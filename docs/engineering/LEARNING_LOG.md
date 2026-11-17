# Learning Log

One entry per completed task, written or approved by Mustapha. Agents may draft answers 1–5; answer 6 is always Mustapha's own.

## Template

```markdown
## KNAR-### — Task name (YYYY-MM-DD)

1. What problem does this layer solve?
2. What inputs and outputs cross its boundary?
3. What invariant does it protect?
4. What failure case did the test expose?
5. How would I diagnose it without Claude?
6. What did I personally inspect, change, or test?
```

At the end of each milestone, explain the data flow on paper or in your own words before starting the next one.

---

## KNAR-000 — Minimal Export spike (2026-11-16)

1. **What problem does this layer solve?**
   It proves that Knarra's core output can be produced: a still image and a trimmed video, normalized to one vertical format, joined, with faded music, as a playable MP4 the browser can download.

2. **What inputs and outputs cross its boundary?**
   Input: an empty `POST /api/demo-render`; three fixed files (`pic.png`, `vid.mp4`, `aud.mp3`). Output: `knarra-demo.mp4` streamed as an attachment, or a 409/500 JSON error. Inside, FFmpeg receives an argument array and a filtergraph:
   - Each visual input: `trim` → `setpts=PTS-STARTPTS` (restart timestamps at zero) → `scale=1080:1920:force_original_aspect_ratio=decrease` (fit inside) → `pad` (letterbox to exactly 1080x1920) → `setsar=1` (square pixels) → `fps=30` → `format=yuv420p`.
   - `concat=n=2:v=1:a=0` joins the two visual segments; inputs must already match in size, SAR, frame rate, and pixel format.
   - Audio: `atrim=duration=8` → `asetpts` → `afade=t=out:st=6:d=2`.
   - `-map [v] -map [a]` selects exactly the filtered streams; `+faststart` moves the index to the front so playback can start before download finishes.

3. **What invariant does it protect?**
   Invariant 7: FFmpeg runs through `spawn()` with an argument array, so no shell ever parses the command. It also previews invariant 6: the render is fully determined by its inputs.

4. **What failure case did the test expose?**
   The output probes as `yuvj420p` with `color_range=pc` even though the command asks for `yuv420p`. The source video was full range, and `format=yuv420p` changes the pixel layout but not the range tag. `verify.js` did not check pixel format, so it passed. Separately, the render worked locally but a fresh clone cannot run it, because `render.js` is gitignored.

5. **How would I diagnose it without Claude?**
   - `ffprobe -v error -show_streams -of json knarra-demo.mp4` and read `pix_fmt`, `color_range`, `r_frame_rate`, `width`, `height`, `duration`.
   - Run the same probe on each input to see which one introduced a property.
   - Read FFmpeg's stderr for warnings such as the deprecated pixel-format message.
   - `git ls-files` and `git check-ignore -v <file>` to confirm a file is actually committed.

6. **What did I personally inspect, change, or test?**
   _(Mustapha to write.)_
