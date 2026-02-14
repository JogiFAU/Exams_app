import { loadManifest, populateDatasetSelect } from "./data/manifest.js";
import { wireUiEvents } from "./ui/events.js";
import { renderAll } from "./ui/render.js";

async function init() {
  await loadManifest();
  populateDatasetSelect();
  wireUiEvents();
  await renderAll();
}

init();
