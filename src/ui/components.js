import { letter } from "../utils.js";

function maintenanceTrafficLightHtml(severity) {
  const hasSeverity = Number.isFinite(severity);
  const level = !hasSeverity ? "unknown" : (severity >= 3 ? "red" : severity >= 2 ? "yellow" : "green");
  const label = !hasSeverity ? "unbekannt" : (severity >= 3 ? "hoch" : severity >= 2 ? "mittel" : "niedrig");
  const severityText = hasSeverity ? `Severity ${severity}` : "ohne Severity-Wert";

  return `
    <span class="pill qmetaTraffic" title="KI-Einschätzung: Wartungsbedarf ${label} (${severityText})." aria-label="KI-Einschätzung Wartungsbedarf ${severityText}">
      <span class="qmetaTraffic__dot qmetaTraffic__dot--${level}" aria-hidden="true"></span>
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

  const maintenance = maintenanceTrafficLightHtml(q.aiMaintenanceSeverity);

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
