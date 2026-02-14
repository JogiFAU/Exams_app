export const state = {
  questionsAll: [],

  // Dataset meta
  activeDataset: null, // { id, label, notebookUrl, ... }
  manifest: null,

  // ZIP for images
  zip: null,
  zipIndex: new Map(),
  zipObjectUrls: new Map(),

  // View / workflow
  view: "config", // "config" | "quiz" | "review" | "search"
  configTab: "quiz", // "quiz" | "search"

  // Quiz session (fixed subset once started)
  currentSessionId: null,
  quizConfig: null,
  quizFinishedAt: null,
  questionOrder: [], // array of qids (fixed)
  answerOrder: new Map(), // qid -> array of original answer indices in display order

  // Preview counts in config
  preview: { quizCount: 0, searchCount: 0 },

  // Search view
  searchConfig: null,
  searchOrder: [], // array of qids

  // Per-question user data (stored as original indices)
  answers: new Map(), // qid -> number[]
  submitted: new Set(), // qids
  results: new Map(), // qid -> boolean

  // UI-only
  explainOpen: new Set(), // qids
};

export function resetAnswers() {
  state.answers = new Map();
  state.submitted = new Set();
  state.results = new Map();
  state.explainOpen = new Set();
}

export function resetQuizSession() {
  state.currentSessionId = null;
  state.quizConfig = null;
  state.quizFinishedAt = null;
  state.questionOrder = [];
  state.answerOrder = new Map();
  resetAnswers();
}

export function resetSearch() {
  state.searchConfig = null;
  state.searchOrder = [];
  state.explainOpen = new Set();
}
