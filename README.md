# Knarra

**Describe the video you have in mind. Build it from the media you already have. Stay in control of the edit.**

Knarra is an AI-assisted video editor for people who have the raw material for a video but do not necessarily know how to turn it into one.

Most editing tools begin with an empty timeline. Knarra begins one step earlier: with the folder of photos, scattered video clips, song, reference video, and rough idea already in the user's head.

```text
Make a monthly-dump video from these photos and clips.
Start with @I3, use @A1 as the music, and include 00:12-00:19 from @V2.
Keep the opening quick, then slow down for the final three clips.
```

Knarra turns that direction into a reviewable editing plan, applies the approved changes to a real timeline, and leaves the user free to adjust the result manually. The goal is not to replace the editor with a prompt box. It is to make video editing approachable without making it opaque.

## The Product

Knarra has two main surfaces: a project dashboard and an editing workspace.

| Surface | Purpose |
| --- | --- |
| **Project dashboard** | Create, find, resume, and manage video projects and their versions. |
| **Canvas** | Explore, preview, group, stack, and arrange source media spatially before deciding how it should play. |
| **Timeline** | Define the actual sequence, timing, tracks, and final composition. |
| **AI composer** | Describe an edit in plain language and reference selected media, folders, or exact time ranges. |
| **Player and inspector** | Preview the composition and make precise manual adjustments. |

The Canvas and Timeline are two views of the same project, but they serve different purposes. Canvas position expresses organization and intent; the Timeline remains the source of truth for the finished video.

## How Editing Works

### 1. Bring in the material

Users can add photos, video, audio, folders, and eventually reference videos. Knarra reads media metadata, generates useful previews, and keeps the original source files unchanged.

### 2. Organize ideas visually

Media appears on a zoomable Canvas rather than being forced immediately onto a timeline. Assets can be moved, stacked, grouped, previewed, and selected together. Folders make it possible to work with a large collection without flattening everything into one list.

### 3. Describe the edit

Every asset receives a stable short reference such as:

- `@I1` for an image
- `@V2` for a video
- `@A1` for audio
- `@R1` for a reference video
- `@V2-S1` for a saved segment of a video

This allows a prompt to be broad where creative judgment is welcome and exact where precision matters:

```text
Start with @I1, follow it with the group I selected, and use @A1 from 00:42.
Trim @V2 to 00:12-00:19 and make that section 1.5x speed.
```

### 4. Review before applying

Knarra does not silently change the project. It converts the request into structured edit operations, validates the asset references and time ranges, and explains the proposed changes before the user approves them.

### 5. Refine on the Timeline

After approval, the operations update the project composition. The result remains fully editable: clips can be trimmed, reordered, removed, or adjusted through the Timeline and inspector, with undo and redo available throughout the workflow.

## From Prompt to Render

Knarra is designed around a deliberate separation between creative intent and media execution:

```text
Natural-language request + selected project context
                         ↓
                Structured edit plan
                         ↓
              Schema validation and preview
                         ↓
                 Project composition
                         ↓
              Deterministic FFmpeg render
```

The language model's future role is to plan edits—not to manipulate files directly or produce unpredictable shell commands. It will return operations that conform to a defined schema. The application validates those operations, shows them to the user, and passes the resulting composition to a deterministic rendering engine.

This architecture makes AI-assisted edits reviewable, testable, reversible, and reproducible.

## Non-Destructive Project Model

Knarra treats edits as metadata rather than rewriting uploaded media.

A timeline clip can point to a source video while storing its own source range, timeline position, speed, crop, and volume. Multiple clips can reuse different parts of the same original without duplicating or degrading it.

This model supports:

- Undo and redo
- Alternative edits and project versions
- Reusing one source in multiple places
- Fast experimentation
- Reliable recovery
- Final rendering from the original media

The intended media pipeline keeps originals for export while generating lighter proxies and thumbnails for responsive editing in the browser.

## Reference-Guided Editing

One of Knarra's longer-term goals is to let a user provide a reference video and say, in effect, "use this as the creative direction for my media."

Rather than copying a reference blindly, Knarra will analyze it into a structured style profile containing signals such as:

- Shot duration and cut rhythm
- Beat alignment
- Transition patterns
- Aspect ratio and cropping behavior
- Text placement and motion
- Color characteristics
- The relationship between images, video, and music

That profile can then guide a new composition built from the user's own media. Reference analysis is intentionally sequenced after the core manual and conversational editing workflow is reliable.

## Current Build

The current repository contains an interactive React and TypeScript front-end prototype with:

- Project creation, search, filtering, sorting, and grid/list views
- File and folder import
- A pannable and zoomable media Canvas
- Asset selection, grouping, preview, and inspection
- Video segments and reference handles
- Video, image, and audio Timeline tracks
- Natural-language command input with `@` references
- Proposed-edit review before changes are applied
- Project-level undo and redo
- Responsive dashboard states and accessible dialogs and menus

A deterministic local planner currently exercises the edit-operation workflow. Model integration, persistent project storage, and production video rendering are the next major engineering stages.

## Technology

### Current

- React
- TypeScript
- Vite
- CSS Modules
- Browser File, Media, Canvas, and Drag-and-Drop APIs

### Planned application services

- Node.js and Express
- FFmpeg and `ffprobe`
- Background render jobs
- Persistent project and version storage
- LLM structured-output integration

## Project Structure

```text
knarra/
├── frontend/    React and TypeScript application
└── backend/     Service foundation for media processing and persistence
```

The current product implementation lives in `frontend/src`:

```text
src/
├── components/           Shared interface and brand components
├── features/
│   ├── workspace/        Project dashboard and project management
│   └── editor/           Canvas, timeline, media tools, and edit planning
├── lib/                  Shared hooks and utilities
└── styles/               Application-wide design tokens
```

## Run Locally

### Requirements

- Node.js `20.19+` or `22.12+`
- npm

### Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local development URL, typically `http://localhost:5173`.

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and create a production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

## Vision

Knarra is being built for the moment before someone becomes an editor: when they know the story they want to tell, know which memories and sounds belong in it, but do not yet know how to translate that idea into cuts, tracks, timing, and transitions.

The product's job is to bridge that gap while keeping every proposed decision visible and every result editable.
