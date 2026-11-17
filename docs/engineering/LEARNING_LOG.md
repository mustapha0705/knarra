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

---

## KNAR-001 — Make the spike reproducible from Git (2026-11-17)

1. **What problem does this layer solve?**
   The spike worked on this machine, but the repository could not reproduce it: `backend/src/server.js` imports `../ffmpeg-practice/render.js`, and the whole `ffmpeg-practice/` folder was gitignored, so a fresh clone crashed on import.

2. **What inputs and outputs cross its boundary?**
   Git's ignore rules decide what reaches the repository. Ignoring a whole folder hid code and notes along with the media. The fix ignores media by extension, so scripts and notes are committed and media and generated MP4s are not.

3. **What invariant does it protect?**
   Commit code and notes; never commit media or generated outputs. A checkpoint must be reproducible from Git alone, apart from deliberately untracked media.

4. **What failure case did the test expose?**
   A passing local run proved nothing about the commit, because the local folder contained ignored files. Only a clone-like copy of exactly what Git would contain showed the import crash, and then showed it had become a clean 500 when media is missing. A second lesson came from the check itself: when another server already holds port 3001, a request to `localhost:3001` silently reaches that server instead, so the check must confirm the port is free and read the new server's own log.

5. **How would I diagnose it without Claude?**
   - `git check-ignore -v <file>` shows which rule ignores a file.
   - `git ls-files` lists what is committed; `git ls-files -co --exclude-standard` lists what would be committed.
   - Clone the repository into an empty folder (or copy only those files), install, and run it before calling a checkpoint done.
   - `netstat -ano | findstr :3001` shows whether a port is already in use.

6. **What did I personally inspect, change, or test?**
   I ran the manual Export test in the browser and confirmed the MP4 downloaded.
