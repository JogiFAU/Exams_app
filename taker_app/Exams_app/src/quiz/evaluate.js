export function getCorrectIndices(q, { preferOriginal = false } = {}) {
  const normalizedOriginal = Array.isArray(q?.originalCorrectIndices)
    ? q.originalCorrectIndices.map((x) => Number(x)).filter(Number.isInteger)
    : [];

  if (preferOriginal && normalizedOriginal.length) {
    return normalizedOriginal;
  }

  if (Array.isArray(q?.correctIndices) && q.correctIndices.length) {
    return q.correctIndices;
  }

  return Array.isArray(q?.answers)
    ? q.answers
        .map((ans, idx) => (ans?.isCorrect ? idx : -1))
        .filter(idx => idx >= 0)
    : [];
}

export function isMultiCorrect(q) {
  return getCorrectIndices(q).length > 1;
}

export function evaluate(q, selectedOriginalIndices, { preferOriginal = false } = {}) {
  const a = new Set(selectedOriginalIndices || []);
  const b = new Set(getCorrectIndices(q, { preferOriginal }));
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
