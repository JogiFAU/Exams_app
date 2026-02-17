# AGENTS.md — Exam Generator (GitHub Pages)

This repository hosts a **static (client-side) web app** for training with **exam questions (Klausurfragen)** that were extracted from DocsDocs.
The app runs on **GitHub Pages** (no backend) and supports:

- Dataset selection via `manifest.json` (no manual upload)
- Filtering (Klausuren, Bilder, Random-Subset, Schlagwort)
- Two workflows:
  - **Abfragemodus** (Practice/Exam-style answering, progress, review)
  - **Suchmodus** (browse/search questions)
- Session persistence and result history via **localStorage**
- “Explain in NotebookLM” deep-link (dataset-specific URL in manifest)

## Project goals

- **Zero-install for end users**: open the GitHub Pages URL, use immediately.
- **Fast + simple**: plain HTML/CSS/vanilla ES modules, no build step.
- **Robust UX**: clear mode separation (config → active session → review), avoid state bugs.
- **Data privacy**: do not require accounts; store progress locally in the browser only.

## Non-goals

- No server/database/auth.
- No secrets stored in repo or shipped to client.
- No heavy frameworks or bundlers unless explicitly requested.

---

## Local development (required for testing)

Run a static server from the repo root:

- Windows / macOS / Linux:
  - `python -m http.server 8000`
  - then open: `http://localhost:8000/`

Notes:
- Do **not** use `file://` because ES module imports will fail in most browsers.
- GitHub Pages deployment is the same static content (no build step).

---

## Repository map (important files)

- `index.html`
  - All UI anchors/IDs used by JS must stay stable (or update JS accordingly).
  - Loads `src/main.js` as ES module.
- `assets/styles.css`
  - Global theme + responsive rules + sticky sidebar/controls.
- `src/main.js`
  - App bootstrap (loads manifest, wires events, initial render).
- `src/state.js`
  - Global state (active dataset, view/mode, answers/results, previews).
- `src/ui/render.js`
  - Rendering for config/search/quiz/review, progress bar, exam stats display.
- `src/ui/events.js`
  - UI wiring, mode transitions, config reset behavior, button actions.
- `src/quiz/filters.js`
  - Filtering and search helpers (exams, images, keyword/search, random+shuffle).
- `src/quiz/session.js`
  - Session lifecycle (start, finish→review, abort, exit to config).
- `src/data/manifest.js`
  - Loads and exposes dataset definitions (dropdown + selection).
- `src/data/loaders.js`
  - Loads JSON question data (one or multiple files).
- `src/data/zipImages.js`
  - Loads ZIP with images and resolves image blobs/URLs (JSZip in browser).
- `src/data/storage.js`
  - localStorage persistence: sessions, backups, “latest finished session” per dataset.

---

## Data: manifest + question model

### `manifest.json` (dataset selection)
Each dataset entry should include:

- `id` (stable key; used in localStorage namespace)
- `label` (UI name in dropdown)
- `json` (string or array of JSON URLs; relative paths recommended)
- `zip` (optional; ZIP URL for images)
- `notebookUrl` (optional; dataset-specific NotebookLM URL)

Keep datasets **public** (GitHub Pages). Do not include sensitive/private data.

### Questions (expected fields)
The app expects a normalized question object similar to:

- `id` (stable string)
- `text` (question text)
- `answers` (array of `{ text: string }`)
- `correctIndices` (array of numbers, original answer indices)
- `examName` (string; used for “Klausur” grouping/filtering)
- `imageFiles` (optional array; filenames inside ZIP)
- `explanation` (optional; dataset-provided notes)

If you change field names, update loaders + render + filters consistently.

---

## UX & workflow rules (must keep)

### Modes / Views
- `config`: user selects dataset + filters
- `quiz`: active **Abfragemodus** session (answers being collected)
- `review`: finished session (solutions visible + summary placeholder)
- `search`: active **Suchmodus** session

Rules:
- From `quiz` you can only go to `review` (finish) or back to `config` via **abort**.
- Entering `config` from other views should reset UI config fields to defaults (avoid stale filters).
- “Klausuren” selection must be fully clickable row-wise (hitbox includes stats/placeholder).

### Progress UI
- Progress bar should be sticky at top.
- In “exam style” (solutions hidden) do not leak correctness via colors.
- When solutions are visible, progress may show correct/wrong distribution (green/red).

### Mobile behavior
- If the navigation list is above the question list, show a small sticky button to jump back to navigation when it is out of view.

---

## Storage rules (localStorage)

- Persist user progress/results **only locally** in the browser.
- Sessions are namespaced by `datasetId`.
- “Latest finished session” is used to show bars/percentages in the Klausur list.
- Avoid breaking old stored sessions:
  - if you add fields, keep backwards compatible defaults.

---

## NotebookLM integration

- The dataset may define `notebookUrl` in `manifest.json`.
- The button “In NotebookLM erklären” should:
  - open the dataset’s `notebookUrl` in a new tab
  - (future) optionally copy a prompt (question + correct solution + notes) to clipboard

Do not hardcode NotebookLM URLs in code; always derive from manifest.

---

## Coding guidelines for agents

- Make **small, local** changes; avoid unrelated refactors.
- Keep paths relative for GitHub Pages.
- Do not add heavy dependencies unless requested.
- Prefer clear function names and conservative DOM manipulation.
- Always update both:
  - UI (`index.html` / CSS) **and**
  - logic (`render.js` / `events.js`)
  when changing IDs or workflows.

### When implementing a change
1. Identify the exact file(s) to change (see repo map).
2. Implement minimal diff.
3. Verify locally (no console errors):
   - config flow
   - start/finish/abort quiz
   - search enter/exit
   - exam selection hitboxes
   - mobile layout basics

---

## Review checklist (before you finish)

- [ ] App loads on `http://localhost:8000/` with no console errors
- [ ] Dataset loads via `manifest.json`
- [ ] Filters affect preview counts and the rendered subset
- [ ] Abfragemodus: start → answer → finish → review works
- [ ] Abort exits cleanly and resets config
- [ ] Suchmodus can be exited; switching tabs behaves logically
- [ ] Klausur list shows latest results bars where available
- [ ] No “answer leakage” in exam mode while solutions hidden
