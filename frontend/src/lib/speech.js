// Web Speech API: a different voice per examiner, and dictation for answers. Free, runs in the browser.
//
// Browser quirks handled here:
//  - Chrome loads voices asynchronously, so the list is empty on the first call: we wait for "voiceschanged".
//  - Each examiner gets a *different* voice. Preferred names are tried first; if a machine doesn't have them,
//    the remaining English voices are handed out in turn, so the three never share one voice.
//  - Chrome stops speaking long utterances after ~15 s, so text is spoken sentence by sentence.
//  - cancel() fires the old utterance's end callback; a generation counter keeps it from triggering hands-free.
import { EXAMINERS, ORDER } from "./examiners.js";

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canListen = Boolean(Recognition);

let assigned = null; // speaker -> SpeechSynthesisVoice
let generation = 0;

if (canSpeak) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    assigned = null;
  });
}

function englishVoices() {
  const all = window.speechSynthesis.getVoices();
  const en = all.filter((v) => /^en([-_]|$)/i.test(v.lang || ""));
  // local voices first: they start instantly and work offline
  return en.sort((a, b) => Number(b.localService) - Number(a.localService));
}

function voiceFor(speaker) {
  if (!assigned) {
    const en = englishVoices();
    if (!en.length) return null; // not loaded yet: try again next time
    assigned = {};
    const used = new Set();
    for (const s of ORDER) {
      const prefer = EXAMINERS[s].voice.prefer;
      let v = null;
      for (const name of prefer) {
        v = en.find((x) => x.name.includes(name) && !used.has(x.name));
        if (v) break;
      }
      if (!v) v = en.find((x) => !used.has(x.name)) || en[0];
      used.add(v.name);
      assigned[s] = v;
    }
  }
  return assigned[speaker] || null;
}

/** Which voice each examiner will use (for the settings hint and for testing). */
export function voiceNames() {
  if (!canSpeak) return {};
  return Object.fromEntries(ORDER.map((s) => [s, voiceFor(s)?.name || "default"]));
}

function sentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [text];
  const out = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1] + " " + p).length < 160) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out;
}

/**
 * Speak an examiner's line in their voice. Code chips are read as plain words.
 * `onEnd` runs once when the whole line has been spoken (not when it was interrupted).
 */
export function speak(speaker, text, onEnd) {
  if (!canSpeak) {
    onEnd?.();
    return;
  }
  const cfg = EXAMINERS[speaker]?.voice;
  if (!cfg) return;
  const synth = window.speechSynthesis;
  const mine = ++generation;
  synth.cancel();
  synth.resume(); // Chrome sometimes leaves the queue paused after a tab switch

  const clean = text.replace(/`/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const chunks = sentences(clean);
  const voice = voiceFor(speaker);
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-IN";
    u.pitch = cfg.pitch;
    u.rate = cfg.rate;
    if (i === chunks.length - 1) {
      const done = () => {
        if (mine === generation) onEnd?.();
      };
      u.onend = done;
      u.onerror = (e) => {
        if (e.error !== "interrupted" && e.error !== "canceled") done();
      };
    }
    synth.speak(u);
  });
}

export function stopSpeaking() {
  generation += 1;
  if (canSpeak) window.speechSynthesis.cancel();
}

/**
 * Start dictation. Calls onText with the running transcript, onEnd when the mic closes, and onError with a
 * readable message (for example when microphone access is blocked). Returns a stop function.
 */
export function listen(onText, onEnd, onError) {
  if (!canListen) return () => {};
  const r = new Recognition();
  r.lang = "en-IN";
  r.interimResults = true;
  r.continuous = true;
  r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" ").replace(/\s+/g, " ").trim());
  r.onend = () => onEnd?.();
  r.onerror = (e) => {
    const msg = {
      "not-allowed": "Microphone access is blocked. Allow it in the address bar, or type your answer.",
      "service-not-allowed": "Microphone access is blocked. Allow it in the address bar, or type your answer.",
      "no-speech": null, // silence: not an error worth showing
      "audio-capture": "No microphone was found. Type your answer instead.",
      network: "Speech recognition needs an internet connection. Type your answer instead.",
      aborted: null,
    }[e.error];
    if (msg) onError?.(msg);
  };
  try {
    r.start();
  } catch {
    onEnd?.();
    return () => {};
  }
  return () => {
    try {
      r.stop();
    } catch {
      /* already stopped */
    }
  };
}
