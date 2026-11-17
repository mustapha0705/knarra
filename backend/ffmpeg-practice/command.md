# Knarra Minimal Render

## Inputs

- Photo: backend/ffmpeg-practice/pic.png
- Video: backend/ffmpeg-practice/vid.mp4
- Music: backend/ffmpeg-practice/aud.mp3

## FFmpeg command

```bash
ffmpeg \
  -loop 1 -framerate 30 -t 3 -i backend/ffmpeg-practice/pic.png \
  -i backend/ffmpeg-practice/vid.mp4 \
  -i backend/ffmpeg-practice/aud.mp3 \
  -filter_complex "\
    [0:v]trim=duration=3,setpts=PTS-STARTPTS,\
    scale=1080:1920:force_original_aspect_ratio=decrease,\
    pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,\
    setsar=1,fps=30,format=yuv420p[v0];\
    [1:v]trim=duration=5,setpts=PTS-STARTPTS,\
    scale=1080:1920:force_original_aspect_ratio=decrease,\
    pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,\
    setsar=1,fps=30,format=yuv420p[v1];\
    [v0][v1]concat=n=2:v=1:a=0[v];\
    [2:a]atrim=duration=8,asetpts=PTS-STARTPTS,\
    afade=t=out:st=6:d=2[a]" \
  -map "[v]" \
  -map "[a]" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -c:a aac \
  -b:a 192k \
  -t 8 \
  -movflags +faststart \
  backend/demo-output/knarra-demo.mp4