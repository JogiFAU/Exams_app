import { state, resetQuizSession } from "../state.js";
import { hash32, mulberry32, shuffle, toast } from "../utils.js";
import { evaluate } from "./evaluate.js";
import { saveSession, deleteSession, loadSession } from "../data/storage.js";

function newSessionId() {
  return `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function startQuizSession({ subset, config }) {
  resetQuizSession();
  state.view = "quiz";
  state.quizConfig = config;
  state.quizFinishedAt = null;
  state.currentSessionId = newSessionId();

  state.questionOrder = subset.map(q => q.id);

  // Answer shuffle mapping (qid -> display order as original indices)
  state.answerOrder = new Map();
  if (config.shuffleAnswers) {
    for (const q of subset) {
      const base = hash32((state.currentSessionId || "") + "|" + q.id);
      const rng = mulberry32(base);
      const order = shuffle([...Array((q.answers || []).length).keys()], rng);
      state.answerOrder.set(q.id, order);
    }
  }

  persistCurrentQuizSession();
  toast("Abfrage gestartet.");
}

export function finishQuizSession() {
  if (state.view !== "quiz") return;
  state.view = "review";
  if (!state.quizFinishedAt) state.quizFinishedAt = Date.now();
  persistCurrentQuizSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
  toast("Abfrage beendet. Auswertung ist verfügbar.");
}

export function abortQuizSession() {
  const datasetId = state.activeDataset?.id;
  const sessionId = state.currentSessionId;

  if (datasetId && sessionId) {
    try { deleteSession(datasetId, sessionId); } catch {}
  }

  resetQuizSession();
  state.view = "config";
  toast("Abfrage abgebrochen.");
}


export function exitToConfig() {
  state.view = "config";
  toast("Konfiguration geöffnet.");
}

export function startSearchView({ subset, config }) {
  state.view = "search";
  state.searchConfig = config;
  state.searchOrder = subset.map(q => q.id);
  state.explainOpen = new Set();
}

export function submitAnswer(q) {
  const qid = q.id;
  const selected = state.answers.get(qid) || [];
  state.submitted.add(qid);
  state.results.set(qid, evaluate(q, selected));
  persistCurrentQuizSession();
}

export function unsubmitAnswer(qid) {
  state.submitted.delete(qid);
  state.results.delete(qid);
  persistCurrentQuizSession();
}

export function persistCurrentQuizSession() {
  if (!state.activeDataset?.id || !state.currentSessionId) return;
  const datasetId = state.activeDataset.id;
  const existing = loadSession(datasetId, state.currentSessionId);

  // Serialize Maps/Sets
  const answersObj = {};
  for (const [k,v] of state.answers.entries()) answersObj[k] = v;

  const resultsObj = {};
  for (const [k,v] of state.results.entries()) resultsObj[k] = v;

  const answerOrderObj = {};
  for (const [k,v] of state.answerOrder.entries()) answerOrderObj[k] = v;

  const session = {
    id: state.currentSessionId,
    createdAt: existing?.createdAt || Date.now(),
    datasetId,
    datasetLabel: state.activeDataset.label || datasetId,
    notebookUrl: state.activeDataset.notebookUrl || null,

    kind: "quiz",
    quizConfig: state.quizConfig,
    questionOrder: state.questionOrder,
    answerOrder: answerOrderObj,

    answers: answersObj,
    submitted: Array.from(state.submitted.values()),
    results: resultsObj,

    finishedAt: state.quizFinishedAt || null,
  };

  saveSession(datasetId, session);
}

export function hydrateQuizSessionFromStorage(session) {
  if (!session || session.kind !== "quiz") throw new Error("Ungültiger Session-Typ.");

  resetQuizSession();

  state.currentSessionId = session.id;
  state.quizConfig = session.quizConfig || null;
  state.questionOrder = Array.isArray(session.questionOrder) ? session.questionOrder.slice() : [];

  state.answerOrder = new Map();
  const ao = session.answerOrder || {};
  for (const [qid, order] of Object.entries(ao)) {
    if (Array.isArray(order)) state.answerOrder.set(qid, order);
  }

  state.answers = new Map();
  for (const [qid, arr] of Object.entries(session.answers || {})) {
    if (Array.isArray(arr)) state.answers.set(qid, arr);
  }

  state.submitted = new Set(Array.isArray(session.submitted) ? session.submitted : []);

  state.results = new Map();
  for (const [qid, b] of Object.entries(session.results || {})) state.results.set(qid, !!b);

  state.explainOpen = new Set();

  state.quizFinishedAt = session.finishedAt || null;
  state.view = state.quizFinishedAt ? "review" : "quiz";
}
