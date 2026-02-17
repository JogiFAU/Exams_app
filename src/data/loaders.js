import { normSpace } from "../utils.js";
import { state } from "../state.js";

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeIndices(indices) {
  if (!Array.isArray(indices)) return [];
  return indices
    .map(x => Number(x))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function indicesDiffer(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

function normalizeQuestion(q) {
  const id = String(q.id || "").trim();
  if (!id) return null;

  const aiReasonDetailed = normSpace(
    q.AnswerReasonDetailed ||
    q.answerReasonDetailed ||
    q.aiAnswerReasonDetailed ||
    q.aiAudit?.answerPlausibility?.verification?.reasonDetailed ||
    q.aiAudit?.answerPlausibility?.passA?.reasonDetailed ||
    ""
  ) || null;

  const originalCorrectIndices = normalizeIndices(
    q.originalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.originalCorrectIndices
  );

  const finalCorrectIndices = normalizeIndices(
    q.finalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.finalCorrectIndices ||
    q.correctIndices
  );

  const aiChangedAnswers = indicesDiffer(originalCorrectIndices, finalCorrectIndices);
  const aiConfidence = toNumberOrNull(
    q.aiAnswerConfidence ??
    q.aiAudit?.answerPlausibility?.verification?.confidence ??
    q.aiAudit?.answerPlausibility?.passA?.confidence
  );

  const aiMaintenanceReasons = Array.isArray(q.aiMaintenanceReasons)
    ? q.aiMaintenanceReasons.map(x => normSpace(String(x || ""))).filter(Boolean)
    : (Array.isArray(q.aiAudit?.maintenance?.reasons)
      ? q.aiAudit.maintenance.reasons.map(x => normSpace(String(x || ""))).filter(Boolean)
      : []);

  return {
    id,
    examName: q.examName || null,
    aiSuperTopic: normSpace(q.aiSuperTopic || "") || null,
    aiSubtopic: normSpace(q.aiSubtopic || "") || null,
    aiMaintenanceSeverity: toNumberOrNull(q.aiMaintenanceSeverity ?? q.aiAudit?.maintenance?.severity),
    aiMaintenanceReasons,
    aiConfidence,
    aiChangedAnswers,
    originalCorrectIndices,
    examYear: (q.examYear != null ? Number(q.examYear) : null),
    text: normSpace(q.questionText || ""),
    explanation: normSpace(q.explanationText || "") || null,
    aiReasonDetailed,
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
