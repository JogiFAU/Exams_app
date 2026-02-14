export function isMultiCorrect(q) {
  return Array.isArray(q.correctIndices) && q.correctIndices.length > 1;
}

export function evaluate(q, selectedOriginalIndices) {
  const a = new Set(selectedOriginalIndices || []);
  const derivedCorrect = Array.isArray(q?.answers)
    ? q.answers
        .map((ans, idx) => (ans?.isCorrect ? idx : -1))
        .filter(idx => idx >= 0)
    : [];
  const source = (Array.isArray(q?.correctIndices) && q.correctIndices.length)
    ? q.correctIndices
    : derivedCorrect;
  const b = new Set(source);
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
