import { decodeHtmlEntities, normSpace } from "../utils.js";
import { state } from "../state.js";
import {
  evaluateAiChangedLabel,
  resolveAiDisplayText
} from "../rules/questionPresentationRules.js";

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value) {
  return normSpace(decodeHtmlEntities(value || ""));
}

function normalizeIndices(indices, answerCount = null) {
  if (!Array.isArray(indices)) return [];
  const normalized = indices
    .map(x => Number(x))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  if (!normalized.length) return [];

  const canConvertFromOneBased = Number.isInteger(answerCount) && answerCount > 0
    && normalized.every((idx) => idx >= 1 && idx <= answerCount)
    && !normalized.includes(0);

  if (canConvertFromOneBased) {
    return normalized.map((idx) => idx - 1);
  }

  return normalized;
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
    const file = cleanText(String(pdf || ""));
    if (!file) return;
    const pageText = cleanText(String(page ?? ""));
    out.push(pageText ? `${file} · S. ${pageText}` : file);
  };

  for (const src of candidates) {
    if (!Array.isArray(src)) continue;
    for (const entry of src) {
      if (!entry) continue;
      if (typeof entry === "string") {
        const txt = cleanText(entry);
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
      const txt = cleanText(String(chunkId || ""));
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

  const aiReasonDetailedRaw = resolveAiDisplayText(q, "solutionHint");
  const aiTopicReasonRaw = resolveAiDisplayText(q, "topicReason");
  const aiReasonDetailed = cleanText(aiReasonDetailedRaw) || null;
  const aiTopicReason = cleanText(aiTopicReasonRaw) || null;

  const answerCount = Array.isArray(q.answers) ? q.answers.length : 0;

  const originalCorrectIndices = normalizeIndices(
    q.originalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.originalCorrectIndices,
    answerCount
  );

  const finalCorrectIndices = normalizeIndices(
    q.finalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.finalCorrectIndices ||
    q.correctIndices,
    answerCount
  );

  const changedInDataset = q.aiAudit?.answerPlausibility?.changedInDataset;
  const aiChangedAnswersRaw = evaluateAiChangedLabel({
    changedInDataset,
    originalCorrectIndices,
    finalCorrectIndices
  });
  const aiConfidence = toNumberOrNull(
    q.aiAnswerConfidence ??
    q.aiAudit?.answerPlausibility?.verification?.confidence ??
    q.aiAudit?.answerPlausibility?.passA?.confidence
  );

  const aiChangedAnswersConfidenceCutoff = 1;
  const aiChangedAnswers = aiChangedAnswersRaw && Number(aiConfidence) > aiChangedAnswersConfidenceCutoff;

  const aiMaintenanceReasons = Array.isArray(q.aiMaintenanceReasons)
    ? q.aiMaintenanceReasons.map(x => cleanText(String(x || ""))).filter(Boolean)
    : (Array.isArray(q.aiAudit?.maintenance?.reasons)
      ? q.aiAudit.maintenance.reasons.map(x => cleanText(String(x || ""))).filter(Boolean)
      : []);

  const explainer = q.aiAudit?.explainer;
  const aiCorrectnessExplanation = cleanText(explainer?.correctnessExplanation || "") || null;
  const aiWrongOptionExplanations = Array.isArray(explainer?.wrongOptionExplanations)
    ? explainer.wrongOptionExplanations
        .map((entry) => {
          const whyWrong = cleanText(entry?.whyWrong || "") || null;
          if (!whyWrong) return null;

          const rawIndex = Number(entry?.answerIndex);
          if (!Number.isInteger(rawIndex)) return null;

          let normalizedIndex = null;
          if (rawIndex >= 1 && rawIndex <= answerCount) normalizedIndex = rawIndex - 1;
          else if (rawIndex >= 0 && rawIndex < answerCount) normalizedIndex = rawIndex;

          if (!Number.isInteger(normalizedIndex)) return null;
          return { answerIndex: normalizedIndex, whyWrong };
        })
        .filter(Boolean)
    : [];

  const reconstructedQuestion = q.aiAudit?.reconstruction?.reconstructedQuestion;

  return {
    id,
    examName: q.examName || null,
    aiSuperTopic: cleanText(q.aiSuperTopic || "") || null,
    aiSubtopic: cleanText(q.aiSubtopic || "") || null,
    aiMaintenanceSeverity: toNumberOrNull(q.aiMaintenanceSeverity ?? q.aiAudit?.maintenance?.severity),
    aiMaintenanceReasons,
    aiConfidence,
    aiChangedAnswers,
    aiCorrectnessExplanation,
    aiWrongOptionExplanations,
    originalCorrectIndices,
    examYear: (q.examYear != null ? Number(q.examYear) : null),
    text: cleanText(q.questionText || ""),
    explanation: cleanText(q.explanationText || "") || null,
    reconstructedQuestion: reconstructedQuestion && typeof reconstructedQuestion === "object"
      ? {
          questionText: cleanText(reconstructedQuestion.questionText || "") || "",
          answers: Array.isArray(reconstructedQuestion.answers)
            ? reconstructedQuestion.answers.map((a) => ({
                answerIndex: Number(a?.answerIndex),
                text: cleanText(a?.text || "")
              }))
            : []
        }
      : null,
    aiReasonDetailed,
    aiTopicReason,
    aiSources: normalizeAiSources(q),
    abstractionClusterId: toNumberOrNull(
      q.abstractionClusterId ??
      q.aiAudit?.clusters?.abstractionClusterId
    ),
    questionAbstraction: cleanText(
      q.questionAbstraction ||
      q.aiAudit?.questionAbstraction?.summary ||
      q.aiAudit?.questionAbstraction?.text ||
      ""
    ) || null,
    answers: (q.answers || []).map(a => ({
      text: cleanText(a.text || ""),
      isCorrect: !!a.isCorrect
    })),
    correctIndices: finalCorrectIndices,
    imageFiles: Array.isArray(q.imageFiles) ? q.imageFiles.slice() : []
  };
}

function annotateQuestionClusters(questions) {
  const clusterMap = new Map();

  for (const q of questions) {
    const clusterIdRaw = q.abstractionClusterId;
    if (clusterIdRaw == null) continue;

    const clusterId = String(clusterIdRaw);
    if (!clusterMap.has(clusterId)) {
      clusterMap.set(clusterId, { clusterId, ids: [] });
    }
    clusterMap.get(clusterId).ids.push(q.id);
  }

  const clusterSizes = Array.from(clusterMap.values())
    .map(c => c.ids.length)
    .sort((a, b) => b - a);

  const largeClusterThreshold = 3;

  for (const q of questions) {
    const clusterIdRaw = q.abstractionClusterId;
    const clusterId = clusterIdRaw != null ? String(clusterIdRaw) : null;
    const cluster = clusterId ? clusterMap.get(clusterId) : null;
    const related = cluster ? cluster.ids.filter(id => id !== q.id) : [];
    const size = cluster ? cluster.ids.length : 0;

    q.clusterId = cluster?.clusterId || null;
    q.clusterLabel = cluster ? `Cluster ${cluster.clusterId}` : null;
    q.clusterSize = size;
    q.clusterRelatedIds = related;
    q.isHighRelevanceCluster = size >= largeClusterThreshold;
  }
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
  annotateQuestionClusters(state.questionsAll);
}
