import { activeQuestions } from "../quiz/filters.js";
import { state } from "../state.js";
import { letter, downloadBlob } from "../utils.js";

export function exportResultsCsv() {
  const qs = activeQuestions();
  const header = ["question_id","exam_name","selected","correct","submitted","is_correct"];
  const lines = [header.join(",")];

  for (const q of qs) {
    const qid = q.id;
    const sel = state.answers.get(qid) || [];
    const selected = sel.map(i => letter(i)).join(";");
    const correct = (q.correctIndices || []).map(i => letter(i)).join(";");
    const submitted = state.submitted.has(qid);
    const isCorrect = state.results.has(qid) ? String(state.results.get(qid)) : "";
    const exam = (q.examName || "").replaceAll(",", " ");
    lines.push([qid, exam, selected, correct, submitted, isCorrect].join(","));
  }

  downloadBlob("docsdocs_results.csv", "text/csv;charset=utf-8", lines.join("\n"));
}
