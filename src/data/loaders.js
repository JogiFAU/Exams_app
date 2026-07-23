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

function cleanMultilineText(value) {
  return String(decodeHtmlEntities(value || ""))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function restoreQuestionLineBreaks(value) {
  const text = cleanMultilineText(value);
  if (!text || /\n/.test(text)) return text;

  return text
    .replace(/\s+(?=\(\d+\s+Richtige?\))/gi, "\n")
    .replace(/([?:.!])\s+(?=[A-E][).]\s+)/g, "$1\n")
    .replace(/([?:.!])\s+(?=\d+[).]\s+)/g, "$1\n")
    .trim();
}

function normalizeIndices(indices, answerCount = null, answers = null) {
  if (!Array.isArray(indices)) return [];
  const normalized = indices
    .map(x => Number(x))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  if (!normalized.length) return [];

  const canBeOneBased = Number.isInteger(answerCount) && answerCount > 0
    && normalized.every((idx) => idx >= 1 && idx <= answerCount);
  const hasZeroBasedOnlyIndex = Number.isInteger(answerCount) && answerCount > 0
    && normalized.some((idx) => idx === 0 || idx >= answerCount);

  if (canBeOneBased && !normalized.includes(0)) {
    const oneBased = normalized.map((idx) => idx - 1);
    const answerList = Array.isArray(answers) ? answers : [];
    const zeroBasedScore = normalized.filter((idx) => answerList[idx]?.isCorrect === true).length;
    const oneBasedScore = oneBased.filter((idx) => answerList[idx]?.isCorrect === true).length;

    if (normalized.some((idx) => idx === answerCount) || oneBasedScore > zeroBasedScore) {
      return oneBased;
    }
  }

  if (hasZeroBasedOnlyIndex) {
    return normalized.filter((idx) => idx >= 0 && idx < answerCount);
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

  const rawAnswers = Array.isArray(q.answers) ? q.answers : [];
  const answerCount = rawAnswers.length;

  const originalCorrectIndices = normalizeIndices(
    q.originalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.originalCorrectIndices,
    answerCount,
    rawAnswers
  );

  const finalCorrectIndices = normalizeIndices(
    q.finalCorrectIndices ||
    q.aiAudit?.answerPlausibility?.finalCorrectIndices ||
    q.correctIndices,
    answerCount,
    rawAnswers
  );

  const answerPlausibility = q.aiAudit?.answerPlausibility || {};
  const changedInDataset = answerPlausibility.changedInDataset;
  const aiDisagreesWithOriginalAnswer = answerPlausibility.aiDisagreesWithDataset === true;
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

  const aiWrongExplanationIndexSet = new Set(aiWrongOptionExplanations.map((entry) => entry.answerIndex));
  const aiCorrectnessExplanationIndices = aiCorrectnessExplanation && answerCount > 0 && aiWrongExplanationIndexSet.size > 0
    ? Array.from({ length: answerCount }, (_, idx) => idx).filter((idx) => !aiWrongExplanationIndexSet.has(idx))
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
    aiDisagreesWithOriginalAnswer,
    aiCorrectnessExplanation,
    aiCorrectnessExplanationIndices,
    aiWrongOptionExplanations,
    originalCorrectIndices,
    examYear: (q.examYear != null ? Number(q.examYear) : null),
    text: restoreQuestionLineBreaks(q.questionText || ""),
    explanation: cleanText(q.explanationText || "") || null,
    reconstructedQuestion: reconstructedQuestion && typeof reconstructedQuestion === "object"
      ? {
          questionText: restoreQuestionLineBreaks(reconstructedQuestion.questionText || "") || "",
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
  const allExamNames = new Set();

  for (const q of questions) {
    if (q.examName) allExamNames.add(q.examName);
  }
  const totalExamCount = allExamNames.size;

  for (const q of questions) {
    const clusterIdRaw = q.abstractionClusterId;
    if (clusterIdRaw == null) continue;

    const clusterId = String(clusterIdRaw);
    if (!clusterMap.has(clusterId)) {
      clusterMap.set(clusterId, { clusterId, ids: [], examNames: new Set() });
    }
    const clusterEntry = clusterMap.get(clusterId);
    clusterEntry.ids.push(q.id);
    if (q.examName) clusterEntry.examNames.add(q.examName);
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
    q.clusterExamCount = cluster ? cluster.examNames.size : 0;
    q.clusterExamShare = totalExamCount > 0 ? q.clusterExamCount / totalExamCount : 0;
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
