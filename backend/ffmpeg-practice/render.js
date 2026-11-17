
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function renderMinimalDemo() {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(currentDir, "knarra-demo.mp4");

    const args = [
      "-y",
      "-loop", "1",
      "-framerate", "30",
      "-t", "3",
      "-i", path.join(currentDir, "pic.png"),

      "-i", path.join(currentDir, "vid.mp4"),
      "-i", path.join(currentDir, "aud.mp3"),

      "-filter_complex",
      [
        "[0:v]trim=duration=3,setpts=PTS-STARTPTS,",
        "scale=1080:1920:force_original_aspect_ratio=decrease,",
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,",
        "setsar=1,fps=30,format=yuv420p[v0];",

        "[1:v]trim=duration=5,setpts=PTS-STARTPTS,",
        "scale=1080:1920:force_original_aspect_ratio=decrease,",
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,",
        "setsar=1,fps=30,format=yuv420p[v1];",

        "[v0][v1]concat=n=2:v=1:a=0[v];",

        "[2:a]atrim=duration=8,asetpts=PTS-STARTPTS,",
        "afade=t=out:st=6:d=2[a]"
      ].join(""),

      "-map", "[v]",
      "-map", "[a]",

      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",

      "-t", "8",
      "-movflags", "+faststart",

      outputPath
    ];

    let stderr = "";

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    ffmpeg.stderr.setEncoding("utf8");

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    ffmpeg.on("error", (error) => {
      fs.rmSync(outputPath, { force: true });

      reject(
        new Error(`Failed to start FFmpeg: ${error.message}`)
      );
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        fs.rmSync(outputPath, { force: true });

        reject(
          new Error(
            `FFmpeg exited with code ${code}\n${stderr}`
          )
        );

        return;
      }

      resolve(outputPath);
    });
  });
}

// Execute when running: node render.js
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  renderMinimalDemo()
    .then((outputPath) => {
      console.log("Render successful:", outputPath);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

export { renderMinimalDemo };
