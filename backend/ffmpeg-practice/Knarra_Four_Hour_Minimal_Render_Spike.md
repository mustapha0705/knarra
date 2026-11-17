# Knarra: Four-Hour Minimal Render Spike

## Goal

Make Knarra produce one real video today.

The demo output will be an approximately eight-second vertical MP4:

1. Show one photo for three seconds.
2. Hard-cut to the first five seconds of one video.
3. Play one music file underneath the full edit.
4. Export at `1080x1920`, 30 fps, H.264 video, and AAC audio.

Clicking Knarra's existing **Export** button should call the local backend, wait for FFmpeg, and download or open the finished video.

## Do Not Build Yet

- No LLM
- No database
- No project saving
- No proxies
- No background queue
- No progress percentage
- No cancellation
- No transitions beyond one hard cut
- No generic Timeline-to-FFmpeg compiler
- No arbitrary user uploads for this spike

Use three fixed demo files so you can prove the pipeline first:

```text
backend/demo-assets/photo.jpg
backend/demo-assets/clip.mp4
backend/demo-assets/music.mp3
```

## Hour 1 — Learn the Three FFmpeg Operations

Install FFmpeg and verify:

```bash
ffmpeg -version
ffprobe -version
```

Create these manually from the terminal:

1. A three-second MP4 made from `photo.jpg`.
2. A five-second trimmed MP4 made from `clip.mp4`.
3. A copy of the video with `music.mp3` as its audio.

For both visual segments, normalize:

- Resolution: `1080x1920`
- Frame rate: 30 fps
- Pixel format: `yuv420p`

Use `scale` plus `pad` so media keeps its aspect ratio instead of stretching.

Reference only what you need in the [official FFmpeg manual](https://ffmpeg.org/ffmpeg.html), [`ffprobe` manual](https://ffmpeg.org/ffprobe.html), and [filter reference](https://ffmpeg.org/ffmpeg-filters.html).

**Checkpoint:** You can play all three intermediate outputs and explain every option in each command.

## Hour 2 — Produce the Final Demo From One Command

Combine the three inputs with one `-filter_complex` command:

```text
photo.jpg ──> loop 3s ──> scale/pad ──┐
                                      ├─> concat ──> video output
clip.mp4 ──> trim 5s ──> scale/pad ───┘

music.mp3 ──> trim 8s ──> fade out ─────> audio output
```

Write the working command in:

```text
backend/experiments/minimal-render/command.md
```

Probe the result and confirm:

- One video stream
- One audio stream
- Approximately eight seconds
- `1080x1920`
- H.264/AAC inside MP4

**Checkpoint:** `backend/demo-output/knarra-demo.mp4` plays correctly outside the browser.

## Hour 3 — Run the Command From Node

Create a small function:

```ts
renderMinimalDemo(): Promise<string>
```

Requirements:

- Use `node:child_process.spawn()`.
- Pass FFmpeg arguments as an array.
- Do not construct an interpolated shell command.
- Capture stderr for debugging.
- Reject when FFmpeg exits with a nonzero code.
- Resolve with the output path only after FFmpeg exits successfully.
- Remove an incomplete output if the process fails.

For this spike, the arguments may remain hard-coded. The purpose is to understand process execution before designing the reusable compiler.

Add one test or verification script that runs `ffprobe` against the output and checks its duration and dimensions.

**Checkpoint:** Running one Node command creates the same video as your manual terminal command.

## Hour 4 — Connect Knarra's Export Button

Add one temporary backend endpoint:

```text
POST /api/demo-render
```

The endpoint should:

1. Call `renderMinimalDemo()`.
2. Wait for the asynchronous child process to finish.
3. Return a download URL when successful.
4. Return a useful error response when FFmpeg fails.

The existing frontend Export button should:

1. Enter a loading state.
2. Disable repeated clicks while rendering.
3. Call `/api/demo-render`.
4. Open or download the completed MP4.
5. Display a small error message if rendering fails.

For this spike, it is acceptable for every click to render the same three demo assets.

## Definition of Done

Stop when all of these are true:

- You click **Export** inside Knarra.
- The request reaches the Express backend.
- Node starts FFmpeg without blocking the event loop.
- FFmpeg produces the eight-second vertical edit.
- The browser downloads or opens the resulting MP4.
- A second export works after the first finishes.
- A deliberate bad input produces a visible error instead of hanging.
- You can explain the path from button click to MP4.

## Suggested Commit

```text
feat(rendering): add minimal end-to-end FFmpeg export spike
```

## What Happens Next

Keep this spike as proof that the full loop works, then begin Week 1 of the main plan.

The reusable implementation will gradually replace:

- Fixed demo assets with project assets
- Hard-coded timing with Composition JSON
- One FFmpeg command with a tested render compiler
- A waiting request with an asynchronous render job
- A fixed output with project-specific exports

Do not refactor the spike into the final architecture during these four hours. Seeing one real Knarra video is the entire point.
