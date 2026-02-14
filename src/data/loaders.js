import { normSpace } from "../utils.js";
import { state } from "../state.js";

function normalizeQuestion(q) {
  const id = String(q.id || "").trim();
  if (!id) return null;

  return {
    id,
    examName: q.examName || null,
    examYear: (q.examYear != null ? Number(q.examYear) : null),
    text: normSpace(q.questionText || ""),
    explanation: normSpace(q.explanationText || "") || null,
    answers: (q.answers || []).map(a => ({
      text: normSpace(a.text || ""),
      isCorrect: !!a.isCorrect
    })),
    correctIndices: Array.isArray(q.correctIndices) ? q.correctIndices.slice() : [],
    imageFiles: Array.isArray(q.imageFiles) ? q.imageFiles.slice() : []
  };
}

export async function loadJsonUrls(urls) {
  const byId = new Map();
  for (const url of urls) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`JSON HTTP ${res.status}: ${url}`);
    const payload = await res.json();
    for (const q of (payload.questions || [])) {
      const nq = normalizeQuestion(q);
      if (!nq) continue;
      byId.set(nq.id, nq);
    }
  }
  state.questionsAll = Array.from(byId.values());
}
