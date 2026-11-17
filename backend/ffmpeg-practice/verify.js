
import { spawn } from "node:child_process";
import { renderMinimalDemo } from "./render.js";

async function verifyVideo(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_entries",
      "format=duration:stream=codec_type,width,height",
      "-of", "json",
      filePath
    ];

    const probe = spawn("ffprobe", args);

    let stdout = "";
    let stderr = "";

    probe.stdout.setEncoding("utf8");
    probe.stderr.setEncoding("utf8");

    probe.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    probe.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    probe.on("error", reject);

    probe.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`ffprobe failed:\n${stderr}`)
        );
        return;
      }

      try {
        const metadata = JSON.parse(stdout);

        const video = metadata.streams.find(
          (stream) => stream.codec_type === "video"
        );

        const duration = Number(metadata.format.duration);

        if (!video) {
          throw new Error("No video stream found");
        }

        if (Math.abs(duration - 8) > 0.1) {
          throw new Error(
            `Unexpected duration: ${duration}`
          );
        }

        if (
          video.width !== 1080 ||
          video.height !== 1920
        ) {
          throw new Error(
            `Unexpected dimensions: ${video.width}x${video.height}`
          );
        }

        console.log("\nVerification passed!");
        console.log("Duration:", duration, "seconds");
        console.log(
          "Dimensions:",
          `${video.width}x${video.height}`
        );

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function main() {
  console.log("Starting FFmpeg render...\n");

  const outputPath = await renderMinimalDemo();

  console.log("\nRender completed:", outputPath);
  console.log("\nRunning ffprobe verification...\n");

  await verifyVideo(outputPath);
}

main().catch((error) => {
  console.error("\nVerification failed:", error.message);
  process.exitCode = 1;
});
