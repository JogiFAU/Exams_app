import { mulberry32, sampleK, shuffle } from "../utils.js";

export function filterByExams(qs, examNames) {
  if (!examNames || examNames.length === 0) return qs;
  const set = new Set(examNames);
  return qs.filter(q => q.examName && set.has(q.examName));
}

export function filterByImageMode(qs, mode) {
  if (!mode || mode === "all") return qs;
  if (mode === "with") return qs.filter(q => (q.imageFiles || []).length > 0);
  if (mode === "without") return qs.filter(q => (q.imageFiles || []).length === 0);
  return qs;
}

export function applyRandomAndShuffle(qs, { randomN = 0, shuffleQuestions = false } = {}) {
  const rng = mulberry32(Date.now());

  let out = qs.slice();
  if (randomN > 0 && randomN < out.length) {
    out = sampleK(out, randomN, rng);
  }
  if (shuffleQuestions) {
    out = shuffle(out, rng);
  }
  return out;
}

export function searchQuestions(qs, { query = "", inAnswers = false } = {}) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return qs;

  return qs.filter(item => {
    if ((item.text || "").toLowerCase().includes(q)) return true;
    if (!inAnswers) return false;
    return (item.answers || []).some(a => (a.text || "").toLowerCase().includes(q));
  });
}

export function questionIdIndex(qs) {
  const m = new Map();
  for (const q of qs) m.set(q.id, q);
  return m;
}
