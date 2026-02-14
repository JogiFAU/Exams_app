import { state } from "../state.js";
import { $ } from "../utils.js";

export async function loadManifest() {
  try {
    const res = await fetch("datasets/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`manifest.json HTTP ${res.status}`);
    state.manifest = await res.json();
  } catch (e) {
    state.manifest = null;
    console.warn("Manifest konnte nicht geladen werden:", e);
  }
}

export function populateDatasetSelect() {
  const sel = $("datasetSelect");
  sel.innerHTML = "";
  const datasets = (state.manifest && state.manifest.datasets) ? state.manifest.datasets : [];
  for (const d of datasets) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.label || d.id;
    sel.appendChild(opt);
  }
}

export function getSelectedDataset() {
  const datasets = (state.manifest && state.manifest.datasets) ? state.manifest.datasets : [];
  const id = $("datasetSelect").value;
  return datasets.find(d => d.id === id) || null;
}
