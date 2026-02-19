import { state } from "../state.js";

function assignQuestionImagesFromZip() {
  if (!Array.isArray(state.questionsAll) || !state.questionsAll.length) return;

  const imageBases = Array.from(state.zipIndex.keys());
  for (const q of state.questionsAll) {
    const qid = String(q?.id || "").trim();
    if (!qid) continue;

    const matchedBases = imageBases.filter((base) => base.includes(qid)).sort();
    if (!matchedBases.length) continue;

    const existing = Array.isArray(q.imageFiles) ? q.imageFiles.slice() : [];
    q.imageFiles = Array.from(new Set([...existing, ...matchedBases]));
  }

  const imageToQuestionIds = new Map();
  for (const q of state.questionsAll) {
    for (const fileBase of (q.imageFiles || [])) {
      if (!imageToQuestionIds.has(fileBase)) imageToQuestionIds.set(fileBase, new Set());
      imageToQuestionIds.get(fileBase).add(q.id);
    }
  }

  for (const q of state.questionsAll) {
    const relatedIds = new Set();
    for (const fileBase of (q.imageFiles || [])) {
      const users = imageToQuestionIds.get(fileBase);
      if (!users) continue;
      for (const qid of users) relatedIds.add(qid);
    }
    q.imageClusterQuestionIds = Array.from(relatedIds);
    q.imageClusterSize = q.imageClusterQuestionIds.length;
    q.imageClusterLabel = q.imageClusterSize > 1 ? "Bildcluster" : null;
  }
}

export function clearZipObjectUrls() {
  for (const url of state.zipObjectUrls.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  state.zipObjectUrls = new Map();
}

function requireJSZip() {
  if (typeof window.JSZip === "undefined") {
    throw new Error("JSZip ist nicht verfügbar (CDN blockiert?). Bilder-ZIP kann nicht geladen werden.");
  }
  return window.JSZip;
}

export async function loadZipUrl(url) {
  clearZipObjectUrls();
  if (!url) { state.zip = null; state.zipIndex = new Map(); return; }

  const JSZip = requireJSZip();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ZIP HTTP ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  state.zip = zip;
  state.zipIndex = new Map();

  zip.forEach((path, entry) => {
    const base = path.split("/").pop();
    const m = base.match(/^(.+)\.(png|jpg|jpeg|webp|gif)$/i);
    if (m) state.zipIndex.set(m[1], path);
  });

  assignQuestionImagesFromZip();
}

export async function getImageUrl(fileBase) {
  if (!state.zip || !state.zipIndex.has(fileBase)) return null;
  if (state.zipObjectUrls.has(fileBase)) return state.zipObjectUrls.get(fileBase);

  const path = state.zipIndex.get(fileBase);
  const blob = await state.zip.file(path).async("blob");
  const url = URL.createObjectURL(blob);
  state.zipObjectUrls.set(fileBase, url);
  return url;
}
