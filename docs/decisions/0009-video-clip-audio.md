# 0009: A Video Clip's Own Audio Is Mixed Under Its Volume

- Status: Accepted
- Date: 2026-11-17

## Context

The KNAR-000 spike dropped the video clip's audio (`concat ... a=0`) and used only the music file. The Composition v1 model already gives every `VideoClip` a `volume` and every `AssetRef` a `hasAudio` flag, but nothing defined what they mean at render time. M2 required this decision before the render compiler could be written. The options were: always drop clip audio, always keep it instead of the background track, or mix it with the background track.

## Decision

1. A video clip's own audio is **mixed** with the background-audio track.
2. The clip's `volume` (0 to 1) scales its audio. `volume: 0` means the clip's audio is not used at all, and its audio stream is not decoded.
3. A video clip whose asset has `hasAudio: false` contributes no audio, whatever its volume.
4. The clip's audio follows the clip: it is cut to the same source range, retimed by the same speed without changing pitch, and placed at the clip's position on the timeline.
5. Image clips have no audio.
6. The rendered file always has exactly one audio stream, of the same length as the video. When nothing is audible, that stream is silence.
7. Sources are summed without automatic level normalization, so each `volume` means the same thing whether one source or several are playing.

## Consequences

- The spike is reproduced by giving its video clip `volume: 0`, which is how `spike.composition.json` encodes it.
- A user or an LLM plan can keep, lower, or mute original sound with the existing `setClipVolume` operation; no new operation or schema field is needed.
- Because sources are summed, loud clip audio over loud music can clip. Limiting or ducking is a later feature and would need its own decision.
- Every output has an audio stream, so players and later tools never have to handle a video-only file.
- Audio tracks beyond one background track, and audio taken from image clips, remain out of scope (invariant 11).
