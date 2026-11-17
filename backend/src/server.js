import express from "express";
import cors from "cors";
const PORT = 3001;
import { renderMinimalDemo } from "../ffmpeg-practice/render.js";
import { createExportsRouter } from "./api/exports.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Project-driven Export (KNAR-302). The router parses its own bodies: uploads
// are streamed to disk, never buffered by the JSON parser above.
app.use("/api/exports", createExportsRouter());

app.get("/", (req, res) => {
  res
    .status(200)
    .json({ msg: "API working", timestamp: new Date().toISOString() });
});

// Every render writes the same output file, so only one may run (and be
// streamed back) at a time.
let rendering = false;

app.post("/api/demo-render", async (req, res) => {
  if (rendering) {
    res.status(409).json({ error: "A render is already in progress" });
    return;
  }

  rendering = true;

  let outputPath;
  try {
    outputPath = await renderMinimalDemo();
  } catch (error) {
    rendering = false;
    console.error(error);
    res.status(500).json({ error: "The demo render failed" });
    return;
  }

  res.download(outputPath, "knarra-demo.mp4", (error) => {
    rendering = false;
    if (!error) return;

    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not send the rendered file" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Knarra backend running on http://localhost:${PORT}`);
});
