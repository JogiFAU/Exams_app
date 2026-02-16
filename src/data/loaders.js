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

  const aiChangeSource = String(
    q.aiAudit?.answerPlausibility?.changeSource ||
    q.aiChangeSource ||
    ""
  ).trim().toLowerCase();

  const aiChangedAnswers = !!(
    q.aiAnswersModified === true ||
    q.answerOptionsModifiedByAi === true ||
    q.answerOptionsModified === true ||
    q.aiAudit?.answerPlausibility?.changedInDataset === true ||
    q.aiAudit?.answerPlausibility?.appliedChange === true ||
    q.aiAudit?.answerPlausibility?.passA?.recommendChange === true ||
    q.aiAudit?.answerPlausibility?.verification?.appliedChange === true ||
    (aiChangeSource && aiChangeSource !== "none")
  );

  const originalCorrectIndices = normalizeIndices(
    q.originalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.originalCorrectIndices
  );

  return {
    id,
    examName: q.examName || null,
    aiSuperTopic: normSpace(q.aiSuperTopic || "") || null,
    aiSubtopic: normSpace(q.aiSubtopic || "") || null,
    aiMaintenanceSeverity: toNumberOrNull(q.aiMaintenanceSeverity ?? q.aiAudit?.maintenance?.severity),
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
