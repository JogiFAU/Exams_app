import { loadManifest, populateDatasetSelect } from "./data/manifest.js";
import { wireUiEvents } from "./ui/events.js";
import { renderAll } from "./ui/render.js";
import { initTheme } from "./theme.js";

async function init() {
  await initTheme();
  await loadManifest();
  populateDatasetSelect();
  wireUiEvents();
  await renderAll();
}

init();
