import { letter } from "../utils.js";

export function qMetaHtml(q, ordinal) {
  const img = (q.imageFiles && q.imageFiles.length) ? `<span class="pill">🖼️ ${q.imageFiles.length}</span>` : "";
  const exam = q.examName ? `<span class="pill">${q.examName}</span>` : "";
  return `
    <span class="pill">#${ordinal}</span>
    ${exam}
    ${img}
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
