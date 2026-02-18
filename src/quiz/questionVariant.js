function normalizeReconstructedAnswers(answers) {
  if (!Array.isArray(answers)) return [];

  return answers
    .map((entry, idx) => {
      const answerIndex = Number(entry?.answerIndex);
      const normalizedIndex = Number.isInteger(answerIndex) ? answerIndex - 1 : idx;
      return {
        sortIndex: normalizedIndex,
        text: String(entry?.text || "").trim()
      };
    })
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((entry) => ({ text: entry.text }));
}

function extractImageReferenceText(questionText) {
  const text = String(questionText || "").trim();
  if (!text) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const imageRefLines = lines.filter((line) =>
    /(abbildung|bild|grafik|schema|schaubild|siehe\s+.*bild|image|img\.?)/i.test(line)
  );

  if (!imageRefLines.length) return null;
  return imageRefLines.join(" ");
}

export function getQuizQuestionVariant(q, quizConfig) {
  const aiModeEnabled = (quizConfig?.aiModeEnabled ?? quizConfig?.useAiModifiedAnswers) !== false;
  const reconstructed = q?.reconstructedQuestion;
  const hasReconstructedQuestion = !!(
    reconstructed &&
    (String(reconstructed.questionText || "").trim() ||
      (Array.isArray(reconstructed.answers) && reconstructed.answers.length))
  );

  if (!aiModeEnabled || !hasReconstructedQuestion) {
    return {
      text: q?.text || "",
      answers: Array.isArray(q?.answers) ? q.answers : [],
      imageReferenceText: null,
      usedAiReconstruction: false
    };
  }

  const reconstructedAnswers = normalizeReconstructedAnswers(reconstructed.answers);
  const answers = reconstructedAnswers.length
    ? reconstructedAnswers
    : (Array.isArray(q?.answers) ? q.answers : []);

  return {
    text: String(reconstructed.questionText || "").trim() || (q?.text || ""),
    answers,
    imageReferenceText: extractImageReferenceText(q?.text || ""),
    usedAiReconstruction: true
  };
}
