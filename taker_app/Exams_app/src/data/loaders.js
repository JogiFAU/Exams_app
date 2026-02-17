import { normSpace } from "../utils.js";
import { state } from "../state.js";
import {
  evaluateAiChangedLabel,
  resolveAiDisplayText
} from "../rules/questionPresentationRules.js";

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

function normalizeAiSources(q) {
  const ap = q.aiAudit?.answerPlausibility || {};
  const candidates = [
    q.aiSources,
    ap.sources,
    ap.evidence,
    ap.Evidence,
    ap.finalPass?.sources,
    ap.finalPass?.evidence,
    ap.finalPass?.Evidence,
    ap.passA?.sources,
    ap.passA?.evidence,
    ap.passA?.Evidence,
    ap.passB?.sources,
    ap.passB?.evidence,
    ap.passB?.Evidence,
    ap.verification?.sources,
    ap.verification?.evidence,
    ap.verification?.Evidence,
  ];

  const out = [];
  const pushSource = (pdf, page) => {
    const file = normSpace(String(pdf || ""));
    if (!file) return;
    const pageText = normSpace(String(page ?? ""));
    out.push(pageText ? `${file} · S. ${pageText}` : file);
  };

  for (const src of candidates) {
    if (!Array.isArray(src)) continue;
    for (const entry of src) {
      if (!entry) continue;
      if (typeof entry === "string") {
        const txt = normSpace(entry);
        if (txt) out.push(txt);
        continue;
      }
      if (typeof entry === "object") {
        pushSource(
          entry.source || entry.pdf || entry.file || entry.filename || entry.document || entry.name,
          entry.page ?? entry.pages ?? entry.seite ?? entry.pageRange
        );
      }
    }
  }

  const chunkLists = [
    ap.evidenceChunkIds,
    ap.finalPass?.evidenceChunkIds,
    ap.passA?.evidenceChunkIds,
    ap.passB?.evidenceChunkIds,
    ap.verification?.evidenceChunkIds,
  ];
  for (const chunks of chunkLists) {
    if (!Array.isArray(chunks)) continue;
    for (const chunkId of chunks) {
      const txt = normSpace(String(chunkId || ""));
      if (!txt) continue;
      const m = txt.match(/^(.+?)#p(\d+)(?:c\d+)?$/i);
      if (m) out.push(`${m[1]} · S. ${m[2]}`);
      else out.push(txt);
    }
  }

  return Array.from(new Set(out));
}

function normalizeQuestion(q) {
  const id = String(q.id || "").trim();
  if (!id) return null;

  const aiReasonDetailed = resolveAiDisplayText(q, "solutionHint");
  const aiTopicReason = resolveAiDisplayText(q, "topicReason");

  const originalCorrectIndices = normalizeIndices(
    q.originalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.originalCorrectIndices
  );

  const finalCorrectIndices = normalizeIndices(
    q.finalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.finalCorrectIndices ||
    q.correctIndices
  );

  const changedInDataset = q.aiAudit?.answerPlausibility?.changedInDataset;
  const aiChangedAnswers = evaluateAiChangedLabel({
    changedInDataset,
    originalCorrectIndices,
    finalCorrectIndices
  });
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
    aiTopicReason,
    aiSources: normalizeAiSources(q),
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
