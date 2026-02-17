import { letter } from "../utils.js";

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
  let score = 0;

  const severity = Number(q?.aiMaintenanceSeverity);
  if (Number.isFinite(severity)) {
    score += severity - 1;
    reasons.push(`KI-Wartungsbedarf: Severity ${severity}`);
  } else {
    reasons.push("Kein KI-Severity-Wert vorhanden");
  }

  if (Array.isArray(q?.aiMaintenanceReasons) && q.aiMaintenanceReasons.length) {
    reasons.push(...q.aiMaintenanceReasons.map(r => `KI-Hinweis: ${r}`));
  }

  const answerCount = Array.isArray(q?.answers) ? q.answers.length : 0;
  if (answerCount <= 2) {
    score += 2;
    reasons.push("Nur 2 Antwortoptionen vorhanden (geringere Trennschärfe)");
  }

  const confidence = Number(q?.aiConfidence);
  if (Number.isFinite(confidence) && confidence < 0.6) {
    score += confidence < 0.45 ? 3 : 2;
    reasons.push(`Niedrige KI-Confidence zur Korrektheit (${Math.round(confidence * 100)}%)`);
  }

  if (questionMentionsImageWithoutAttachment(q)) {
    score += 3;
    reasons.push("Frage verweist auf Bild/Anhang, aber es ist kein Bild hinterlegt");
  }

  if (hasAmbiguousAnswerOptions(q)) {
    score += 2;
    reasons.push("Antwortoptionen wirken mehrdeutig/unklar");
  }

  const level = score >= 4 ? "red" : score >= 2 ? "yellow" : "green";
  const label = level === "red" ? "kritisch" : level === "yellow" ? "mittel" : "gut";
  return { level, label, reasons };
}

function maintenanceTrafficLightHtml(q) {
  const quality = evaluateQualityTraffic(q);
  const tooltip = quality.reasons.length
    ? quality.reasons.map(r => `<li>${r}</li>`).join("")
    : "<li>Keine Auffälligkeiten erkannt.</li>";

  return `
    <span class="pill qmetaTraffic" aria-label="Qualitätsampel: ${quality.label}">
      <span class="qmetaTraffic__dot qmetaTraffic__dot--${quality.level}" aria-hidden="true"></span>
      <span class="qmetaTraffic__tip" role="tooltip">
        <strong>Qualitätseinstufung: ${quality.label}</strong>
        <ul>${tooltip}</ul>
      </span>
    </span>
  `;
}

export function qMetaHtml(q, ordinal, { showTopics = true } = {}) {
  const img = (q.imageFiles && q.imageFiles.length) ? `<span class="pill">🖼️ ${q.imageFiles.length}</span>` : "";
  const exam = q.examName ? `<span class="pill">${q.examName}</span>` : "";
  const topicPath = showTopics
    ? [q.aiSuperTopic, q.aiSubtopic].filter(Boolean).join(" → ")
    : "";
  const topic = topicPath ? `<span class="pill">${topicPath}</span>` : "";

  const aiChangedBadge = q.aiChangedAnswers
    ? `<span class="pill" title="KI-Hinweis: Die Antwortoption(en) wurden gegenüber der ursprünglichen Markierung verändert." aria-label="Antwortoptionen wurden durch KI verändert">🤖 Antwort geändert</span>`
    : "";

  const maintenance = maintenanceTrafficLightHtml(q);

  return `
    <span class="pill">#${ordinal}</span>
    ${exam}
    ${topic}
    ${img}
    ${aiChangedBadge}
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
