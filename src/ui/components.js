import { letter } from "../utils.js";
import {
  evaluateMaintenanceTrafficRules,
  MAINTENANCE_TRAFFIC_RULES
} from "../rules/questionPresentationRules.js";

function escHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatAiTextForDisplay(text) {
  return String(text || "");
}

function getAltQuestionFrequencyTier(q) {
  const share = Number(q?.clusterExamShare || 0);
  if (share > 0.66) return { className: "clusterBadge--gold", label: "Gold" };
  if (share > 0.33) return { className: "clusterBadge--silver", label: "Silber" };
  return { className: "clusterBadge--bronze", label: "Bronze" };
}

function questionMentionsImageWithoutAttachment(q) {
  const text = String(q?.text || "").toLowerCase();
  const hasImageRef = /(abbildung|bildanhang|siehe bild|grafik|schaubild|darstellung|anhang)/i.test(text);
  const hasImages = Array.isArray(q?.imageFiles) && q.imageFiles.length > 0;
  return hasImageRef && !hasImages;
}

function hasAmbiguousAnswerOptions(q) {
  const answers = Array.isArray(q?.answers) ? q.answers : [];
  const normalized = answers.map(a => String(a?.text || "").trim().toLowerCase()).filter(Boolean);
  if (normalized.length < 2) return false;
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) return true;
  return normalized.some(t => /(alle (antworten|aussagen)|keine der genannten|mehrere antworten sind richtig|nicht eindeutig)/i.test(t));
}

function evaluateQualityTraffic(q) {
  const reasons = [];
  let hardIssue = false;
  let softIssueCount = 0;

  const severity = Number(q?.aiMaintenanceSeverity);
  if (Number.isFinite(severity)) {
    reasons.push(`KI-Wartungsbedarf: Severity ${severity}`);
    if (severity >= MAINTENANCE_TRAFFIC_RULES.thresholds.hardSeverityMin) hardIssue = true;
    else if (severity >= MAINTENANCE_TRAFFIC_RULES.thresholds.softSeverityMin) softIssueCount += 1;
  } else {
    reasons.push("Kein KI-Severity-Wert vorhanden");
  }

  if (Array.isArray(q?.aiMaintenanceReasons) && q.aiMaintenanceReasons.length) {
    reasons.push(...q.aiMaintenanceReasons.map(r => `KI-Hinweis: ${formatAiTextForDisplay(r)}`));
  }

  const answerCount = Array.isArray(q?.answers) ? q.answers.length : 0;
  if (answerCount < MAINTENANCE_TRAFFIC_RULES.thresholds.minAnswerOptions) {
    softIssueCount += 1;
    reasons.push("Nur 2 Antwortoptionen vorhanden (maximal gelb/orange ohne weitere Probleme)");
  }

  const confidence = Number(q?.aiConfidence);
  if (Number.isFinite(confidence) && confidence < MAINTENANCE_TRAFFIC_RULES.thresholds.lowConfidenceSoftMax) {
    if (confidence < MAINTENANCE_TRAFFIC_RULES.thresholds.lowConfidenceHardMax) hardIssue = true;
    else softIssueCount += 1;
    reasons.push(`Niedrige KI-Confidence zur Korrektheit (${Math.round(confidence * 100)}%)`);
  }

  if (questionMentionsImageWithoutAttachment(q)) {
    softIssueCount += 1;
    reasons.push("Frage verweist auf Bild/Anhang, aber es ist kein Bild hinterlegt (allein max. gelb/orange)");
  }

  if (hasAmbiguousAnswerOptions(q)) {
    softIssueCount += 1;
    reasons.push("Antwortoptionen wirken mehrdeutig/unklar");
  }

  return {
    ...evaluateMaintenanceTrafficRules({ hardIssue, softIssueCount }),
    reasons
  };
}

function maintenanceTrafficLightHtml(q) {
  const quality = evaluateQualityTraffic(q);
  const tooltip = quality.reasons.length
    ? quality.reasons.map(r => `<li>${r}</li>`).join("")
    : "<li>Keine Auffälligkeiten erkannt.</li>";

  return `
    <span class="pill qmetaTraffic" data-tip-toggle aria-label="Qualitätsampel: ${quality.label}" tabindex="0">
      <span class="qmetaTraffic__dot qmetaTraffic__dot--${quality.level}" aria-hidden="true"></span>
      <span class="qmetaTraffic__tip" role="tooltip">
        <strong>Qualitätseinstufung: ${quality.label}</strong>
        <ul>${tooltip}</ul>
      </span>
    </span>
  `;
}

function topicInfoHtml(q) {
  const topicPath = [q.aiSuperTopic, q.aiSubtopic].filter(Boolean).join(" → ");
  if (!topicPath) return "";

  const reasonRaw = q.aiTopicReason || "Keine KI-Begründung zur Themenzuordnung vorhanden.";
  const reason = formatAiTextForDisplay(reasonRaw);
  return `
    <span class="pill qmetaTopic" data-tip-toggle tabindex="0" aria-label="Themenzuordnung mit KI-Begründung">
      ${topicPath}
      <span class="qmetaTopic__tip" role="tooltip">
        <strong>KI-Themenzuordnung</strong>
        <span>${reason}</span>
      </span>
    </span>
  `;
}

export function qMetaHtml(q, ordinal, {
  showTopics = true,
  showAiReconstructionBadge = false,
  showOriginalQuestionAction = false,
  showLocalOverrideBadge = false,
  isShowingOriginalVariant = false
} = {}) {
  const imageClusterBadge = Number(q.imageClusterSize || 0) > 1
    ? `
      <span class="pill clusterBadge" data-tip-toggle tabindex="0" aria-label="Bildcluster mit ähnlichen Bildfragen">
        🖼️ ${q.imageClusterSize}
        <span class="clusterBadge__tip" role="tooltip">
          <strong>${q.imageClusterSize} Fragen verwenden denselben Bildcluster.</strong>
          <span class="clusterBadge__cluster">${escHtml(q.imageClusterLabel || "Bildcluster")}</span>
          <button class="btn primary clusterBadge__action clusterBadge__action--cta" type="button" data-image-cluster-show="${q.id}">Fragen anzeigen</button>
        </span>
      </span>
    `
    : "";
  const img = (q.imageFiles && q.imageFiles.length)
    ? (imageClusterBadge || `<span class="pill">🖼️ ${q.imageFiles.length}</span>`)
    : "";
  const exam = q.examName ? `<span class="pill">${q.examName}</span>` : "";
  const topic = showTopics ? topicInfoHtml(q) : "";

  const aiChangedBadge = q.aiChangedAnswers
    ? `<span class="pill" title="KI-Hinweis: Die Antwortoption(en) wurden gegenüber der ursprünglichen Markierung verändert." aria-label="Antwortoptionen wurden durch KI verändert">🤖 Antwort geändert</span>`
    : "";

  const aiDisagreesBadge = q.aiDisagreesWithOriginalAnswer
    ? `<span class="pill" title="KI-Hinweis: Die KI widerspricht der ursprünglich als richtig markierten Antwort." aria-label="KI widerspricht der ursprünglichen richtigen Antwort">🤖 KI widerspricht Originallösung</span>`
    : "";

  const aiReconstructionBadge = showAiReconstructionBadge
    ? `
      <span class="pill aiModifiedBadge ${isShowingOriginalVariant ? "is-muted" : ""}" data-tip-toggle tabindex="0" aria-label="KI-modifizierte Fragendarstellung">
        🤖 KI-modifiziert
        <span class="aiModifiedBadge__tip" role="tooltip">
          <strong>KI-modifizierte Fragendarstellung</strong>
          <span>Texte wurden KI-modifiziert, um die Frage prüfungsnaher und inhaltlich stimmiger darzustellen.</span>
          ${showOriginalQuestionAction ? `<button class="btn primary clusterBadge__action clusterBadge__action--cta aiModifiedBadge__action" type="button" data-toggle-original-question="${q.id}">${isShowingOriginalVariant ? "Modifikationen wieder anzeigen" : "Originale Frage anzeigen"}</button>` : ""}
        </span>
      </span>
    `
    : "";

  const localOverrideBadge = showLocalOverrideBadge
    ? `
      <span class="pill aiModifiedBadge ${isShowingOriginalVariant ? "is-muted" : ""}" data-tip-toggle tabindex="0" aria-label="Lokal modifizierte Fragendarstellung">
        ✏️ Lokal modifiziert
        <span class="aiModifiedBadge__tip" role="tooltip">
          <strong>Lokal modifizierte Fragendarstellung</strong>
          <span>Diese Frage nutzt lokal gespeicherte Änderungen aus dem Editor-Modus.</span>
          <button class="btn primary clusterBadge__action clusterBadge__action--cta aiModifiedBadge__action" type="button" data-toggle-original-question="${q.id}">${isShowingOriginalVariant ? "Modifikationen wieder anzeigen" : "Originale Frage anzeigen"}</button>
        </span>
      </span>
    `
    : "";

  const maintenance = maintenanceTrafficLightHtml(q);
  const clusterExamCount = Math.max(0, Number(q.clusterExamCount || 0));
  const clusterExamSharePct = Math.round(Math.max(0, Number(q.clusterExamShare || 0)) * 100);
  const clusterFrequencyTier = getAltQuestionFrequencyTier(q);
  const clusterBadge = q.isHighRelevanceCluster
    ? `
      <span class="pill clusterBadge ${clusterFrequencyTier.className}" data-tip-toggle tabindex="0" aria-label="Altfrage kam in ${clusterExamCount} Klausuren vor (${clusterFrequencyTier.label})">
        ⭐ Altfrage: ${clusterExamCount} Klausuren
        <span class="clusterBadge__tip" role="tooltip">
          <strong>${clusterFrequencyTier.label}: Diese Altfrage wurde in ${clusterExamCount} verschiedenen Klausuren erkannt.</strong>
          <span>Das entspricht ${clusterExamSharePct}% aller Klausuren in diesem Datensatz.</span>
          <span>${Math.max(0, Number(q.clusterSize || 0) - 1)} ähnliche Fragen im Cluster erkannt.</span>
          <span class="clusterBadge__cluster">${escHtml(q.clusterLabel || "Fragencluster")}</span>
          <span class="clusterBadge__abstraction">${escHtml(q.questionAbstraction || "Keine Abstraktion hinterlegt.")}</span>
          <button class="btn primary clusterBadge__action clusterBadge__action--cta" type="button" data-cluster-show="${q.id}">Fragen anzeigen</button>
        </span>
      </span>
    `
    : "";

  return `
    <span class="pill">#${ordinal}</span>
    ${exam}
    ${topic}
    ${clusterBadge}
    ${img}
    ${aiReconstructionBadge}
    ${localOverrideBadge}
    ${aiChangedBadge}
    ${aiDisagreesBadge}
    <span class="qmetaRight">${maintenance}</span>
  `;
}

export function buildExplainPrompt(q, selectedOriginal) {
  const opts = (q.answers || []).map((a, i) => `${letter(i)}) ${a.text}`).join("\n");
  const sel = (selectedOriginal && selectedOriginal.length) ? selectedOriginal.map(i => letter(i)).join(", ") : "(keine)";
  const corr = (q.correctIndices || []).map(i => letter(i)).join(", ");
  const exam = q?.examName ? `Herkunfts-Klausur: ${q.examName}` : "Herkunfts-Klausur: unbekannt";
  return [
    "Erkläre mir diese MC-Frage auf Prüfungsniveau:",
    exam,
    "",
    "FRAGE:",
    q.text,
    "",
    "ANTWORTOPTIONEN:",
    opts,
    "",
    `MEINE AUSWAHL: ${sel}`,
    `RICHTIGE LÖSUNG: ${corr}`,
    "",
    "Bitte:",
    "1) Begründe die richtige(n) Antwort(en) knapp und klar.",
    "2) Erkläre, warum die falschen Antworten falsch sind.",
    "3) Nenne prüfungsrelevante Merksätze/typische Fallen.",
    "4) Falls passend: klinisches Mini-Beispiel."
  ].join("\n");
}
