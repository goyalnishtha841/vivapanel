# Demo video

A 2:10 walkthrough of Viva Panel, built with [Remotion](https://www.remotion.dev/). Unlike a
scripted mockup, the UI footage is a real capture: a live viva run against
[`goyalnishtha841/tradepilot`](https://github.com/goyalnishtha841/tradepilot) on the deployed app,
including the Engineer catching a false claim by searching the code
(`search_code(revoke) → 0 match(es)`) and the real report it produced.

**[Watch it: `out/demo.mp4`](out/demo.mp4)** (720p, 10.6 MB — a compressed version of the native
4K render, kept small enough to view directly on GitHub)

## What's in here

- `src/` — the Remotion composition: one file per scene (`scenes/Scene1_Hook.tsx` …
  `scenes/Scene10_Endcard.tsx`), plus shared pieces (`Cursor.tsx` for the animated mouse,
  `Caption.tsx`, `ScreenshotBG.tsx` for the Ken Burns zoom/pan, `Highlight.tsx`, `StatCard.tsx`).
- `public/screenshots/live/` — the real screenshots the video is built from, captured at native
  2x/4K resolution from the live app via a headless `html2canvas` capture during the actual
  tradepilot run (see the scene files for exact on-screen coordinates).
- `out/demo.mp4` / `out/thumbnail.jpg` — the shipped deliverables.

## Rendering it yourself

```bash
cd demo-video
npm install
npm run studio          # live preview in the browser
npx remotion render VivaPanelDemo out/video.mp4 --codec=h264 --crf=18   # full 4K render
```

The composition renders at 3840×2160 (the whole scene graph is authored at 1920×1080 and scaled
2x in `VivaPanelDemo.tsx`, so screenshot pixels map 1:1 to the 4K canvas). A full render takes a
few minutes and produces a 100MB+ file — not meant for the repo; compress before committing, e.g.:

```bash
ffmpeg -i out/video.mp4 -vf scale=1280:720 -an -c:v libx264 -b:v 650k -pass 1 -f mp4 /dev/null
ffmpeg -i out/video.mp4 -vf scale=1280:720 -an -c:v libx264 -b:v 650k -pass 2 -movflags +faststart out/demo.mp4
```
