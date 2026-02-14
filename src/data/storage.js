import { toast } from "../utils.js";

const PREFIX = "examgen:v1:";

function key(datasetId) {
  return `${PREFIX}sessions:${datasetId}`;
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export function listSessions(datasetId) {
  const arr = safeJsonParse(localStorage.getItem(key(datasetId)) || "[]", []);
  arr.sort((a,b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  return arr;
}

export function saveSession(datasetId, session) {
  const arr = listSessions(datasetId);
  const idx = arr.findIndex(x => x.id === session.id);
  const now = Date.now();
  const s = { ...session, updatedAt: now };
  if (idx >= 0) arr[idx] = s;
  else arr.unshift(s);
  localStorage.setItem(key(datasetId), JSON.stringify(arr));
  return s;
}

export function loadSession(datasetId, sessionId) {
  const arr = listSessions(datasetId);
  return arr.find(x => x.id === sessionId) || null;
}

export function deleteSession(datasetId, sessionId) {
  const arr = listSessions(datasetId).filter(x => x.id !== sessionId);
  localStorage.setItem(key(datasetId), JSON.stringify(arr));
}

export function getLatestFinishedQuizSession(datasetId) {
  const arr = listSessions(datasetId);
  const quiz = arr.filter(s => s.kind === "quiz" && s.finishedAt);
  quiz.sort((a,b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  return quiz[0] || null;
}

export function getLatestAnsweredResultsByQuestion(datasetId) {
  const arr = listSessions(datasetId)
    .filter(s => s.kind === "quiz" && s.finishedAt)
    .sort((a,b) => (b.finishedAt || 0) - (a.finishedAt || 0));

  const latestAnswered = new Map(); // qid -> boolean correct

  for (const s of arr) {
    const submitted = new Set(Array.isArray(s.submitted) ? s.submitted : []);
    const results = s.results || {};
    for (const qid of (s.questionOrder || [])) {
      if (latestAnswered.has(qid)) continue;
      if (!submitted.has(qid)) continue;
      latestAnswered.set(qid, results[qid] === true);
    }
  }

  return latestAnswered;
}

export function exportBackupAllDatasets() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(PREFIX + "sessions:")) continue;
    out[k] = safeJsonParse(localStorage.getItem(k), []);
  }
  return out;
}

export function importBackupAllDatasets(backupObj) {
  if (!backupObj || typeof backupObj !== "object") throw new Error("Ungültiges Backup-Format.");
  let written = 0;
  for (const [k, v] of Object.entries(backupObj)) {
    if (!k.startsWith(PREFIX + "sessions:")) continue;
    localStorage.setItem(k, JSON.stringify(Array.isArray(v) ? v : []));
    written++;
  }
  toast(`Backup importiert (${written} Datensatz-Speicherstände).`);
}


export function clearAllSessionData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(PREFIX + "sessions:")) continue;
    keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
  return keys.length;
}
