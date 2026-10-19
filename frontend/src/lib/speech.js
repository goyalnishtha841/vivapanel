// Web Speech API: a different voice per examiner, and dictation for answers.
import { EXAMINERS } from "./examiners.js";

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canListen = Boolean(Recognition);

function pickVoice(prefer) {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.startsWith("en"));
  for (const name of prefer) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return voices[0] || null;
}

/** Speak an examiner's line. Code chips are read as plain words. */
export function speak(speaker, text) {
  if (!canSpeak) return;
  const cfg = EXAMINERS[speaker]?.voice;
  if (!cfg) return;
  const u = new SpeechSynthesisUtterance(text.replace(/`/g, "").replace(/_/g, " "));
  const v = pickVoice(cfg.prefer);
  if (v) u.voice = v;
  u.pitch = cfg.pitch;
  u.rate = cfg.rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel();
}

/** Start dictation; calls onText with the running transcript. Returns a stop function. */
export function listen(onText, onEnd) {
  if (!canListen) return () => {};
  const r = new Recognition();
  r.lang = "en-IN";
  r.interimResults = true;
  r.continuous = true;
  r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
  r.onend = () => onEnd?.();
  r.start();
  return () => r.stop();
}
