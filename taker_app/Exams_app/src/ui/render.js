import { state } from "../state.js";
import { $, letter, toast } from "../utils.js";
import { isMultiCorrect, getCorrectIndices } from "../quiz/evaluate.js";
import { submitAnswer, unsubmitAnswer } from "../quiz/session.js";
import { getImageUrl } from "../data/zipImages.js";
import { qMetaHtml, buildExplainPrompt, formatAiTextForDisplay } from "./components.js";
import { questionIdIndex } from "../quiz/filters.js";
import { getLatestAnsweredResultsByQuestion } from "../data/storage.js";

const MAX_RENDER_NO_PAGING = 1000;
let notebookLmWindow = null;

function getThemeTokens() {
  return state.themeTokens || {
    chartSeries: ["#7aa2ff", "#4cc9f0", "#72efdd", "#ffd166", "#f4978e", "#ff99c8"],
    progress: {
      correct1: "rgba(52,211,153,.95)",
      correct2: "rgba(22,163,74,.95)",
      wrong1: "rgba(252,165,165,.95)",
      wrong2: "rgba(198,40,40,.95)",
    },
    pie: {
      label: "#f8fbff",
      inner: "rgba(11,15,23,.82)",
    }
  };
}

function getQuizMode() {
  return $("quizMode")?.value || state.quizConfig?.quizMode || "practice";
}

function computeQuizProgress() {
  const total = state.questionOrder.length;
  const submitted = state.submitted.size;
  let correct = 0;
  for (const qid of state.submitted) if (state.results.get(qid) === true) correct++;
  const pct = submitted ? Math.round((correct / submitted) * 100) : 0;
  return { total, submitted, correct, pct };
}

function solutionsVisible() {
  if (getQuizMode() === "practice") return true;
  return state.view === "review";
}

function usesOriginalSolutionInQuiz(q) {
  return (state.view === "quiz" || state.view === "review") &&
    state.quizConfig?.useAiModifiedAnswers === false &&
    q.aiChangedAnswers;
}

export function renderHeaderProgress() {
  const subtitle = $("headerSubtitle");
  const progText = $("headerProgressText");
  const pctEl = $("headerCorrectPct");
  const bar = $("headerProgressBar");

  if (!state.activeDataset) {
    subtitle.textContent = "Datensatz laden und Abfrage konfigurieren";
    progText.textContent = "—";
    pctEl.textContent = "—";
    bar.style.width = "0%";
    bar.style.background = "";
    return;
  }

  const modeLabel = state.view === "quiz" ? "Abfragemodus" :
                    state.view === "review" ? "Auswertung" :
                    state.view === "search" ? "Suchmodus" : "Konfiguration";

  subtitle.textContent = `${state.activeDataset.label || state.activeDataset.id} · ${modeLabel}`;

  if (state.view !== "quiz" && state.view !== "review") {
    progText.textContent = "—";
    pctEl.textContent = "—";
    bar.style.width = "0%";
    bar.style.background = "";
    return;
  }

  const { total, submitted, correct, pct } = computeQuizProgress();
  progText.textContent = `${submitted}/${total}`;
  bar.style.width = total ? `${(submitted / total) * 100}%` : "0%";

  const canShowQuality = !(getQuizMode() === "exam" && !solutionsVisible());
  if (!canShowQuality || submitted === 0) {
    bar.style.background = "";
  } else {
    const { progress } = getThemeTokens();
    const corrPct = Math.round((correct / submitted) * 100);
    bar.style.background = `linear-gradient(90deg, ${progress.correct1} 0%, ${progress.correct2} ${corrPct}%, ${progress.wrong1} ${corrPct}%, ${progress.wrong2} 100%)`;
  }

  if (!canShowQuality) pctEl.textContent = "—";
  else pctEl.textContent = `${pct}%`;
}

function setSidebarVisibility() {
  const isSession = (state.view === "quiz" || state.view === "review");
  $("sidebarConfig").hidden = isSession;
  $("sidebarSession").hidden = !isSession;

  // In search view, force-highlight the search tab (user is logically in search workflow)
  const tab = (state.view === "search") ? "search" : state.configTab;

  $("tabQuiz").classList.toggle("active", tab === "quiz");
  $("tabSearch").classList.toggle("active", tab === "search");

  const showQuizConfig = (state.view === "config" && tab === "quiz");
  const showSearchConfig = ((state.view === "config" && tab === "search") || state.view === "search");

  $("configQuiz").hidden = !showQuizConfig;
  $("configSearch").hidden = !showSearchConfig;

  const configDisplay = $("displayControlsConfig");
  if (configDisplay && state.view === "config") configDisplay.hidden = true;

  // Search view controls
  const startSearchBtn = $("startSearchBtn");
  if (startSearchBtn) startSearchBtn.textContent = "Suche aktualisieren";

  // Session buttons
  const endBtn = $("endQuizBtn");
  if (endBtn) {
    endBtn.hidden = !(state.view === "quiz" || state.view === "review");
    endBtn.disabled = (state.view !== "quiz");
  }

  const ab = $("abortQuizBtn");
  if (ab) {
    ab.hidden = !(state.view === "quiz" || state.view === "review");
    ab.textContent = (state.view === "review") ? "Neue Abfrage" : "Abfrage abbrechen";
  }

  const hint = $("sessionHint");
  if (hint) {
    hint.textContent = (state.view === "review")
      ? "Auswertung abgeschlossen. Starte eine neue Abfrage oder gehe zurück zur Konfiguration."
      : "Abfrage läuft.";
  }
}

function setPagingSectionsVisibility(isPaging) {
  const sess = $("displayControlsSession");
  if (sess) sess.hidden = !isPaging;
  // Config controls are optional; we hide them when not needed (events.js toggles in config/search)
}

function highlightText(el, text, query) {
  const raw = String(text || "");
  const q = String(query || "").trim();
  el.textContent = "";
  if (!q) {
    el.textContent = raw;
    return;
  }

  const lower = raw.toLowerCase();
  const needle = q.toLowerCase();
  let start = 0;

  while (start < raw.length) {
    const idx = lower.indexOf(needle, start);
    if (idx < 0) {
      el.appendChild(document.createTextNode(raw.slice(start)));
      break;
    }
    if (idx > start) el.appendChild(document.createTextNode(raw.slice(start, idx)));

    const mark = document.createElement("mark");
    mark.className = "hl";
    mark.textContent = raw.slice(idx, idx + needle.length);
    el.appendChild(mark);
    start = idx + needle.length;
  }
}


const QUESTION_SIGNAL_RE = /\b(nicht|kein(?:e|er|en|em)?|am meisten|am wenigsten)\b/gi;

function escapeRegExp(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderQuestionText(el, text, query) {
  const raw = String(text || "");
  const q = String(query || "").trim();
  const escapedNeedle = q ? escapeRegExp(q) : "";
  const combined = q
    ? new RegExp(`${escapedNeedle}|${QUESTION_SIGNAL_RE.source}`, "gi")
    : new RegExp(QUESTION_SIGNAL_RE.source, "gi");

  el.textContent = "";
  let start = 0;
  for (const m of raw.matchAll(combined)) {
    const idx = m.index ?? -1;
    if (idx < 0) continue;
    if (idx > start) el.appendChild(document.createTextNode(raw.slice(start, idx)));

    const hit = m[0];
    const isQuery = q && hit.toLowerCase() === q.toLowerCase();
    if (isQuery) {
      const mark = document.createElement("mark");
      mark.className = "hl";
      mark.textContent = hit;
      el.appendChild(mark);
    } else {
      const sig = document.createElement("span");
      sig.className = "qsignal";
      sig.textContent = hit;
      el.appendChild(sig);
    }
    start = idx + hit.length;
  }
  if (start < raw.length) el.appendChild(document.createTextNode(raw.slice(start)));
}


function aiSourcesTooltipHtml(q) {
  const list = Array.isArray(q?.aiSources) ? q.aiSources : [];
  const items = list.length
    ? list.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
    : "<li>Keine Quellenangaben verfügbar.</li>";

  return `
    <span class="aiHintSource" tabindex="0" aria-label="Quellen zum KI-Hinweis anzeigen">
      <span class="aiHintSource__icon" aria-hidden="true">📚</span>
      <span class="aiHintSource__tip" role="tooltip">
        <strong>Quellen</strong>
        <ul>${items}</ul>
      </span>
    </span>
  `;
}

function getQuestionsByOrder(order) {
  const idx = questionIdIndex(state.questionsAll);
  const out = [];
  for (const qid of order) {
    const q = idx.get(qid);
    if (q) out.push(q);
  }
  return out;
}

function getExamStatsMap() {
  const datasetId = state.activeDataset?.id;
  if (!datasetId) return new Map();

  const latestAnswered = getLatestAnsweredResultsByQuestion(datasetId);
  if (!latestAnswered.size) return new Map();

  const byExam = new Map();
  for (const q of state.questionsAll) {
    const exam = q?.examName || null;
    if (!exam) continue;
    if (!byExam.has(exam)) byExam.set(exam, []);
    byExam.get(exam).push(q.id);
  }

  const out = new Map();
  for (const [exam, qids] of byExam.entries()) {
    const total = qids.length;
    let answered = 0, correct = 0;
    for (const qid of qids) {
      if (!latestAnswered.has(qid)) continue;
      answered++;
      if (latestAnswered.get(qid) === true) correct++;
    }

    if (!answered) continue;

    const wrong = answered - correct;
    const unanswered = total - answered;
    const complete = unanswered === 0 && total > 0;

    const pct = answered ? Math.round((correct / answered) * 100) : 0;
    out.set(exam, { total, answered, correct, wrong, unanswered, pct, complete });
  }

  return out;
}

export function updateFilterLists() {
  const exams = Array.from(new Set(state.questionsAll.map(q => q.examName).filter(Boolean))).sort();
  const stats = getExamStatsMap();
  renderExamList("examListQuiz", exams, stats);
  renderExamList("examListSearch", exams, stats);

  const topics = getTopicTree();
  renderTopicList("topicListQuiz", topics);
  renderTopicList("topicListSearch", topics);
}

function renderExamList(containerId, exams, statsMap) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = "";

  for (const exam of exams) {
    const item = document.createElement("div");
    item.className = "examitem";

    const left = document.createElement("div");
    left.className = "examleft";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.exam = exam;
    cb.addEventListener("click", (e) => e.stopPropagation());

    const name = document.createElement("div");
    name.className = "examname";
    name.textContent = exam;

    left.appendChild(cb);
    left.appendChild(name);
    item.appendChild(left);

    const stats = statsMap.get(exam);
    const right = document.createElement("div");
    right.className = "examstats";

    if (stats) {
      const bar = document.createElement("div");
      bar.className = "exambar";

      const segOk = document.createElement("div");
      segOk.className = "examseg ok";
      segOk.style.width = `${(stats.correct / stats.total) * 100}%`;

      const segBad = document.createElement("div");
      segBad.className = "examseg bad";
      segBad.style.width = `${(stats.wrong / stats.total) * 100}%`;

      const segNeu = document.createElement("div");
      segNeu.className = "examseg neu";
      segNeu.style.width = `${(stats.unanswered / stats.total) * 100}%`;

      bar.appendChild(segOk);
      bar.appendChild(segBad);
      bar.appendChild(segNeu);

      const pct = document.createElement("div");
      pct.className = "exampct";
      pct.textContent = `${stats.pct}%`;

      right.appendChild(bar);
      right.appendChild(pct);
    } else {
      const pct = document.createElement("div");
      pct.className = "exampct placeholder";
      pct.textContent = "Auswertung nach Abschluss";
      right.appendChild(pct);
    }

    item.appendChild(right);

    const syncSelected = () => item.classList.toggle("selected", cb.checked);
    syncSelected();
    cb.addEventListener("change", syncSelected);

    item.addEventListener("click", () => {
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    });

    el.appendChild(item);
  }
}


function getTopicTree() {
  const tree = new Map();

  for (const q of state.questionsAll) {
    const superTopic = (q.aiSuperTopic || "").trim();
    const subTopic = (q.aiSubtopic || "").trim();
    if (!superTopic) continue;

    if (!tree.has(superTopic)) tree.set(superTopic, new Set());
    if (subTopic) tree.get(superTopic).add(subTopic);
  }

  return Array.from(tree.entries())
    .sort(([a], [b]) => a.localeCompare(b, "de"))
    .map(([superTopic, subSet]) => ({
      superTopic,
      subTopics: Array.from(subSet).sort((a, b) => a.localeCompare(b, "de"))
    }));
}

function renderTopicList(containerId, topics) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = "";

  for (const topic of topics) {
    const parent = renderTopicItem({
      superTopic: topic.superTopic,
      level: "super"
    });
    el.appendChild(parent.item);

    const childCheckboxes = [];
    for (const subTopic of topic.subTopics) {
      const child = renderTopicItem({
        superTopic: topic.superTopic,
        subTopic,
        level: "sub"
      });
      childCheckboxes.push(child.checkbox);
      el.appendChild(child.item);
    }

    const syncParentState = () => {
      if (!childCheckboxes.length) {
        parent.checkbox.indeterminate = false;
        return;
      }

      const checkedCount = childCheckboxes.filter(cb => cb.checked).length;
      parent.checkbox.checked = checkedCount === childCheckboxes.length;
      parent.checkbox.indeterminate = checkedCount > 0 && checkedCount < childCheckboxes.length;
      parent.item.classList.toggle("selected", parent.checkbox.checked || parent.checkbox.indeterminate);
    };

    if (childCheckboxes.length) {
      parent.checkbox.addEventListener("change", () => {
        const nextChecked = parent.checkbox.checked;
        for (const cb of childCheckboxes) {
          cb.checked = nextChecked;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      for (const cb of childCheckboxes) {
        cb.addEventListener("change", () => syncParentState());
      }

      syncParentState();
    }
  }
}

function renderTopicItem({ superTopic, subTopic = null, level = "super" }) {
  const item = document.createElement("div");
  item.className = `examitem topicitem ${level === "sub" ? "topicitem-sub" : "topicitem-super"}`;

  const left = document.createElement("div");
  left.className = "examleft";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  if (level === "super") cb.dataset.topicSuper = superTopic;
  else cb.dataset.topicSub = `${superTopic}::${subTopic}`;
  cb.addEventListener("click", (e) => e.stopPropagation());

  const name = document.createElement("div");
  name.className = "examname";
  name.textContent = level === "super" ? superTopic : subTopic;

  left.appendChild(cb);
  left.appendChild(name);
  item.appendChild(left);

  const right = document.createElement("div");
  right.className = "examstats";
  item.appendChild(right);

  const syncSelected = () => item.classList.toggle("selected", cb.checked);
  syncSelected();
  cb.addEventListener("change", syncSelected);

  item.addEventListener("click", () => {
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  });

  return { item, checkbox: cb };
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reviewPalette(i) {
  const colors = getThemeTokens().chartSeries;
  return colors[i % colors.length];
}

function polarToCartesian(cx, cy, r, angleRad) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  };
}

function createPieChartSvg(segments, { size = 240, innerRatio = 0.58, showLabels = true, minLabelPct = 0.07 } = {}) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  if (!total) return "";

  if (segments.length === 1) {
    const c = size / 2;
    const outerR = c - 2;
    const innerR = outerR * innerRatio;
    const seg = segments[0];
    const labelRadius = innerR + ((outerR - innerR) * 0.5);
    const textPos = polarToCartesian(c, c, labelRadius, -Math.PI / 2);

    const { pie } = getThemeTokens();
    return `
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Themenverteilung">
        <circle
          class="pieSegment"
          data-index="0"
          cx="${c}"
          cy="${c}"
          r="${outerR}"
          fill="${seg.color}"
        />
        <circle cx="${c}" cy="${c}" r="${innerR}" fill="${pie.inner}" />
        ${showLabels ? `
          <text class="pieLabel" x="${textPos.x.toFixed(2)}" y="${textPos.y.toFixed(2)}" fill="${pie.label}" text-anchor="middle" dominant-baseline="middle">
            <tspan x="${textPos.x.toFixed(2)}" dy="-0.38em">${seg.value}</tspan>
            <tspan x="${textPos.x.toFixed(2)}" dy="1.05em">100%</tspan>
          </text>
        ` : ""}
      </svg>
    `;
  }

  const c = size / 2;
  const { pie } = getThemeTokens();
  const outerR = c - 2;
  const innerR = outerR * innerRatio;
  let angleStart = -Math.PI / 2;
  const paths = [];
  const labels = [];

  segments.forEach((seg, idx) => {
    const frac = seg.value / total;
    const sweep = frac * Math.PI * 2;
    const angleEnd = angleStart + sweep;

    const p1 = polarToCartesian(c, c, outerR, angleStart);
    const p2 = polarToCartesian(c, c, outerR, angleEnd);
    const p3 = polarToCartesian(c, c, innerR, angleEnd);
    const p4 = polarToCartesian(c, c, innerR, angleStart);
    const largeArc = sweep > Math.PI ? 1 : 0;

    paths.push(`
      <path
        class="pieSegment"
        data-index="${idx}"
        d="M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}
           A ${outerR.toFixed(3)} ${outerR.toFixed(3)} 0 ${largeArc} 1 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}
           L ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}
           A ${innerR.toFixed(3)} ${innerR.toFixed(3)} 0 ${largeArc} 0 ${p4.x.toFixed(3)} ${p4.y.toFixed(3)}
           Z"
        fill="${seg.color}"
      />
    `);

    if (showLabels && frac >= minLabelPct) {
      const midAngle = angleStart + sweep / 2;
      const labelRadius = innerR + ((outerR - innerR) * 0.5);
      const textPos = polarToCartesian(c, c, labelRadius, midAngle);
      const pct = Math.round(frac * 100);
      labels.push(`
        <text class="pieLabel" x="${textPos.x.toFixed(2)}" y="${textPos.y.toFixed(2)}" fill="${pie.label}" text-anchor="middle" dominant-baseline="middle">
          <tspan x="${textPos.x.toFixed(2)}" dy="-0.38em">${seg.value}</tspan>
          <tspan x="${textPos.x.toFixed(2)}" dy="1.05em">${pct}%</tspan>
        </text>
      `);
    }

    angleStart = angleEnd;
  });

  return `
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Themenverteilung">
      ${paths.join("\n")}
      ${labels.join("\n")}
      <circle cx="${c}" cy="${c}" r="${innerR - 3}" fill="${pie.inner}" />
    </svg>
  `;
}

function computeTopicPerformance({ answeredOnly = false } = {}) {
  const byId = questionIdIndex(state.questionsAll);
  const topics = new Map();

  for (const qid of state.questionOrder) {
    const q = byId.get(qid);
    if (!q) continue;

    const superTopic = (q.aiSuperTopic || "Sonstige").trim() || "Sonstige";
    const subTopic = (q.aiSubtopic || "Nicht zugeordnet").trim() || "Nicht zugeordnet";

    if (!topics.has(superTopic)) {
      topics.set(superTopic, {
        name: superTopic,
        total: 0,
        answered: 0,
        correct: 0,
        wrong: 0,
        subtopics: new Map()
      });
    }

    const superBucket = topics.get(superTopic);
    superBucket.total++;

    if (!superBucket.subtopics.has(subTopic)) {
      superBucket.subtopics.set(subTopic, {
        name: subTopic,
        total: 0,
        answered: 0,
        correct: 0,
        wrong: 0
      });
    }

    const subBucket = superBucket.subtopics.get(subTopic);
    subBucket.total++;

    if (state.submitted.has(qid)) {
      superBucket.answered++;
      subBucket.answered++;

      const isCorrect = state.results.get(qid) === true;
      if (isCorrect) {
        superBucket.correct++;
        subBucket.correct++;
      } else {
        superBucket.wrong++;
        subBucket.wrong++;
      }
    }
  }

  const result = Array.from(topics.values())
    .map((topic, i) => {
      const denominator = answeredOnly ? topic.answered : topic.total;
      const answerBase = denominator || 1;
      const correctPct = Math.round((topic.correct / answerBase) * 100);
      const wrongPct = Math.round((topic.wrong / answerBase) * 100);
      const unansweredPct = answeredOnly ? 0 : Math.max(0, 100 - correctPct - wrongPct);
      const subtopics = Array.from(topic.subtopics.values())
        .map((sub, subIdx) => {
          const subDenominator = answeredOnly ? sub.answered : sub.total;
          const subBase = subDenominator || 1;
          const subCorrectPct = Math.round((sub.correct / subBase) * 100);
          const subWrongPct = Math.round((sub.wrong / subBase) * 100);
          return {
            ...sub,
            denominator: subDenominator,
            correctPct: subCorrectPct,
            wrongPct: subWrongPct,
            unansweredPct: answeredOnly ? 0 : Math.max(0, 100 - subCorrectPct - subWrongPct),
            color: reviewPalette(i + subIdx + 2)
          };
        })
        .sort((a, b) => b.denominator - a.denominator || a.name.localeCompare(b.name, "de"));

      return {
        ...topic,
        denominator,
        color: reviewPalette(i),
        correctPct,
        wrongPct,
        unansweredPct,
        subtopics
      };
    })
    .sort((a, b) => b.denominator - a.denominator || a.name.localeCompare(b.name, "de"));

  return result;
}

function buildSubtopicPie(topic) {
  const segments = topic.subtopics.map((sub) => ({
    label: sub.name,
    value: sub.total,
    color: sub.color
  }));
  const pie = createPieChartSvg(segments, { size: 170, innerRatio: 0.45, minLabelPct: 0.1 });

  const legend = segments.slice(0, 5).map((seg) => `
    <div class="miniLegend__row">
      <span class="miniLegend__dot" style="background:${seg.color}"></span>
      <span>${escapeHtml(seg.label)}</span>
    </div>
  `).join("");

  return `
    <div class="miniPanel">
      <div class="miniPanel__title">Unterthemen-Verteilung</div>
      <div class="miniPanel__body">
        <div class="miniPie">${pie}</div>
        <div class="miniLegend">${legend}</div>
      </div>
    </div>
  `;
}

function buildSubtopicBars(topic) {
  const rows = topic.subtopics.slice(0, 6).map((sub) => `
    <div class="miniBarRow">
      <div class="miniBarRow__name">${escapeHtml(sub.name)}</div>
      <div class="miniBarRow__track">
        <span class="miniBarRow__ok" style="width:${sub.correctPct}%"></span>
        <span class="miniBarRow__bad" style="width:${sub.wrongPct}%"></span>
        <span class="miniBarRow__neu" style="width:${sub.unansweredPct}%"></span>
      </div>
      <div class="miniBarRow__pct">${sub.correctPct}%</div>
    </div>
  `).join("");

  return `
    <div class="miniPanel">
      <div class="miniPanel__title">Unterthemen-Leistung</div>
      <div class="miniPanel__body miniPanel__body--stack">${rows || '<div class="small">Keine Unterthemen-Daten</div>'}</div>
    </div>
  `;
}

function renderReviewAnalytics(summaryEl, data) {
  const panel = document.createElement("div");
  panel.className = "topicAnalytics";

  if (!data.length) {
    panel.innerHTML = `<div class="small">Keine Themeninformationen verfügbar.</div>`;
    summaryEl.appendChild(panel);
    return;
  }

  const pieSegments = data.map((topic) => ({
    label: topic.name,
    value: topic.total,
    color: topic.color
  }));

  const pieSvg = createPieChartSvg(pieSegments, { size: 260, innerRatio: 0.56 });

  const pieLegend = data.map((topic, idx) => `
    <button class="topicLegend" type="button" data-topic-index="${idx}" data-mode="pie" style="--topic-color:${topic.color}">
      <span class="topicLegend__dot"></span>
      <span class="topicLegend__name">${escapeHtml(topic.name)}</span>
    </button>
  `).join("");

  const bars = data.map((topic, idx) => `
    <button class="topicBar" type="button" data-topic-index="${idx}" data-mode="bar" style="--topic-color:${topic.color}">
      <div class="topicBar__head">
        <span>${escapeHtml(topic.name)} (${topic.denominator || 0})</span>
        <span>${topic.correctPct}% richtig</span>
      </div>
      <div class="topicBar__track">
        <span class="topicBar__ok" style="width:${topic.correctPct}%"></span>
        <span class="topicBar__bad" style="width:${topic.wrongPct}%"></span>
        <span class="topicBar__neu" style="width:${topic.unansweredPct}%"></span>
      </div>
    </button>
  `).join("");

  const recommendations = data
    .filter((topic) => topic.correctPct < 55)
    .sort((a, b) => a.correctPct - b.correctPct)
    .map((topic) => `<li><strong>${escapeHtml(topic.name)}</strong> · ${topic.correctPct}% richtig (${topic.correct}/${topic.denominator || topic.total})</li>`)
    .join("");

  panel.innerHTML = `
    <div class="topicAnalytics__grid">
      <section class="topicCard" aria-labelledby="topicDistHeading">
        <h3 id="topicDistHeading">Verteilung nach Überthemen</h3>
        <div class="topicPieWrap">
          <div class="topicPie" id="superTopicPie">${pieSvg}</div>
          <div class="topicLegendList">${pieLegend}</div>
        </div>
      </section>
      <section class="topicCard" aria-labelledby="topicPerfHeading">
        <h3 id="topicPerfHeading">Leistung pro Überthema (richtig/falsch)</h3>
        <div class="topicBars">${bars}</div>
      </section>
    </div>
    <div class="topicOverlay" id="topicOverlay" hidden></div>
    <section class="topicCard topicCard--recommendations" aria-labelledby="topicRecoHeading">
      <h3 id="topicRecoHeading">Lernempfehlungen</h3>
      ${recommendations
        ? `<p class="small">Fokus auf Themen unter 55% Trefferquote:</p><ul class="recoList">${recommendations}</ul>`
        : `<p class="small">Sehr stark! Alle Überthemen liegen bei mindestens 55% richtigen Antworten.</p>`}
    </section>
  `;

  summaryEl.appendChild(panel);

  const overlay = panel.querySelector("#topicOverlay");
  let lockedKey = null;

  const openTopicOverlay = (topic, mode) => {
    overlay.hidden = false;
    overlay.innerHTML = mode === "bar" ? buildSubtopicBars(topic) : buildSubtopicPie(topic);
  };

  const closeTopicOverlay = () => {
    overlay.hidden = true;
    overlay.innerHTML = "";
  };

  const bindInteractive = (selector) => {
    panel.querySelectorAll(selector).forEach((el) => {
      const idx = Number(el.dataset.topicIndex);
      const mode = el.dataset.mode;
      const topic = data[idx];
      if (!topic) return;
      const key = `${mode}:${idx}`;

      const open = () => openTopicOverlay(topic, mode);

      el.addEventListener("mouseenter", () => {
        if (lockedKey && lockedKey !== key) return;
        open();
      });
      el.addEventListener("focus", () => {
        if (lockedKey && lockedKey !== key) return;
        open();
      });
      el.addEventListener("click", () => {
        if (lockedKey === key) {
          lockedKey = null;
          closeTopicOverlay();
          return;
        }
        lockedKey = key;
        open();
      });
      el.addEventListener("mouseleave", () => {
        if (!lockedKey) closeTopicOverlay();
      });
      el.addEventListener("blur", () => {
        if (!lockedKey) closeTopicOverlay();
      });
    });
  };

  bindInteractive(".topicLegend");
  bindInteractive(".topicBar");

  const pieEl = panel.querySelector("#superTopicPie");
  pieEl?.querySelectorAll(".pieSegment").forEach((seg) => {
    const idx = Number(seg.dataset.index);
    seg.dataset.topicIndex = String(idx);
    seg.dataset.mode = "pie";
    seg.setAttribute("tabindex", "0");
    seg.setAttribute("role", "button");
  });
  bindInteractive(".pieSegment");

  panel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      lockedKey = null;
      closeTopicOverlay();
    }
  });

  const closeOnOutsideClick = (ev) => {
    if (!panel.isConnected) {
      document.removeEventListener("click", closeOnOutsideClick);
      return;
    }
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".topicLegend, .topicBar, .pieSegment, .topicOverlay")) return;
    lockedKey = null;
    closeTopicOverlay();
  };

  document.addEventListener("click", closeOnOutsideClick);
}

export function renderPager(totalCount, suffix="") {
  const pageSizeEl = $("pageSize" + suffix);
  const pageNumberEl = $("pageNumber" + suffix);
  const pageInfoEl = $("pageInfo" + suffix);

  const pageSize = Math.max(10, Math.min(300, Number(pageSizeEl.value || 50)));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  let page = Number(pageNumberEl.value || 1);
  page = Math.max(1, Math.min(totalPages, page));

  pageNumberEl.value = String(page);
  pageInfoEl.textContent = `Seite ${page}/${totalPages} · ${totalCount} Fragen`;
  return { page, pageSize, totalPages };
}

async function notebookExplain(q) {
  const nb = state.activeDataset?.notebookUrl;
  const prompt = buildExplainPrompt(q, state.answers.get(q.id) || []);

  try {
    await navigator.clipboard.writeText(prompt);
    toast("Fragen-Prompt wurde in die Zwischenablage kopiert.");
  } catch {
    toast("Prompt konnte nicht automatisch kopiert werden (Browser-Rechte).");
  }

  if (!nb) {
    toast("Kein Notebook-Link im Datensatz hinterlegt.");
    return;
  }

  if (notebookLmWindow && !notebookLmWindow.closed) {
    try {
      if (notebookLmWindow.location?.href !== nb) notebookLmWindow.location.href = nb;
      notebookLmWindow.focus();
      return;
    } catch {
      notebookLmWindow = null;
    }
  }

  notebookLmWindow = window.open(nb, "_blank");
}

function renderToc() {
  const list = $("tocList");
  const summary = $("tocSummary");
  list.innerHTML = "";

  const { total, submitted } = computeQuizProgress();
  summary.textContent = total ? `Beantwortet: ${submitted}/${total}` : "—";

  const showSol = solutionsVisible();
  const quizMode = getQuizMode();

  const qs = getQuestionsByOrder(state.questionOrder);
  qs.forEach((q, i) => {
    const qid = q.id;
    const item = document.createElement("div");
    item.className = "tocitem";
    item.dataset.qid = qid;

    const dot = document.createElement("div");
    dot.className = "tocdot";

    if (!state.submitted.has(qid)) dot.classList.add("neu");
    else {
      if (quizMode === "exam" && !showSol) dot.classList.add("answered");
      else dot.classList.add(state.results.get(qid) ? "ok" : "bad");
    }

    const title = document.createElement("div");
    title.className = "toctitle";
    title.textContent = (q.text || "").slice(0, 60) + ((q.text || "").length > 60 ? "…" : "");

    const num = document.createElement("div");
    num.className = "tocnum";
    num.textContent = `#${i+1}`;

    item.appendChild(dot);
    item.appendChild(title);
    item.appendChild(num);

    item.addEventListener("click", async () => {
      await jumpToQuestion(qid);
    });

    list.appendChild(item);
  });
}

async function jumpToQuestion(qid) {
  const idx = state.questionOrder.indexOf(qid);
  if (idx < 0) return;

  const usePaging = state.questionOrder.length > MAX_RENDER_NO_PAGING;

  if (usePaging) {
    const pageSize = Math.max(10, Math.min(300, Number($("pageSize").value || 50)));
    const page = Math.floor(idx / pageSize) + 1;
    $("pageNumber").value = String(page);
    $("pageNumber2").value = String(page);
    await renderAll();
  }

  const el = document.getElementById("q_" + qid);
  if (el) {
    const header = document.querySelector("header.top");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const rect = el.getBoundingClientRect();
    const y = window.scrollY + rect.top - headerH - 10;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    el.animate([{ transform: "scale(1.005)" }, { transform: "scale(1.0)" }], { duration: 220, easing: "ease-out" });
  }
}

export async function renderMain() {
  renderHeaderProgress();
  setSidebarVisibility();

  const mainInfo = $("mainInfo");
  const list = $("questionList");
  list.innerHTML = "";

  if (!state.activeDataset) {
    mainInfo.innerHTML = `
      <div class="hero">
        <div class="hero__title">Willkommen bei DocsDocs für Arme in besser</div>
        <div class="hero__lead">
          Wähle links zuerst einen Datensatz aus und lade ihn. Danach kannst du im Abfragemodus gezielt für Klausuren üben (mit Fortschritt, Auswertung und Review) oder im Suchmodus durch alle Fragen browsen. Nutze die Filter für Klausuren, Bilder, Schlagwörter und Themen, um deine Lernsession präzise einzugrenzen.
        </div>
        <div class="hero__stats">
          <div class="pill">🔎 Suche nach Stichwörtern</div>
          <div class="pill">🗂️ Filter nach Altklausuren</div>
          <div class="pill">🏷️ Filter nach Schlagwörtern</div>
          <div class="pill">🧪 Themen-Filter (in construction)</div>
        </div>
      </div>
    `;
    return;
  }

  if (state.view === "config") {
    const qc = state.preview?.quizCount ?? 0;
    const sc = state.preview?.searchCount ?? 0;
    const isSearchTab = state.configTab === "search";

    mainInfo.innerHTML = `
      <div class="hero">
        <div class="hero__title">${isSearchTab ? "Suchmodus konfigurieren" : "Abfragemodus konfigurieren"}</div>
        <div class="hero__lead">
          ${isSearchTab
            ? "Wähle Klausuren und Suchfilter im linken Bereich. Die Anzahl der im Suchmodus sichtbaren Fragen wird hier live aktualisiert."
            : "Wähle Klausuren und Filter im linken Bereich. Die Anzahl der aktuell ausgewählten Fragen wird hier live aktualisiert."}
        </div>
        <div class="hero__stats">
          <div class="pill">${isSearchTab ? `Treffer im Suchmodus: ${sc}` : `Aktuell gewählte Fragen: ${qc}`}</div>
        </div>
      </div>
    `;
    return;
  }

  if (state.view === "search") {
    mainInfo.textContent = `Suchergebnisse: ${state.searchOrder.length} Treffer`;
    await renderQuestionList(getQuestionsByOrder(state.searchOrder), {
      allowSubmit: false,
      showSolutions: $("searchShowSolutions").checked
    });
    return;
  }

  // quiz or review
  renderToc();

  const { total, submitted, correct, pct } = computeQuizProgress();
  if (state.view === "quiz" && getQuizMode() === "exam") {
    mainInfo.textContent = `Abfrage läuft: ${submitted}/${total} beantwortet · Prüfungsmodus`;
  } else {
    const base = state.view === "review" ? "Auswertung" : "Abfrage läuft";
    mainInfo.textContent = `${base}: ${submitted}/${total} beantwortet · ${pct}% richtig (${correct}/${submitted || 0})`;
  }

  if (state.view === "review") {
    const summary = document.createElement("div");
    summary.className = "summary";
    const wrong = Math.max(0, submitted - correct);
    const unanswered = Math.max(0, total - submitted);
    const pctAnswered = submitted ? Math.round((correct / submitted) * 100) : 0;
    const pctAll = total ? Math.round((correct / total) * 100) : 0;
    const pctCards = unanswered === 0
      ? `<div class="sumcard"><div class="sumcard__k">% Richtig</div><div class="sumcard__v">${pctAll}%</div></div>`
      : `
        <div class="sumcard"><div class="sumcard__k">% (nur beantwortet)</div><div class="sumcard__v">${pctAnswered}%</div></div>
        <div class="sumcard"><div class="sumcard__k">% (alle)</div><div class="sumcard__v">${pctAll}%</div></div>
      `;
    summary.innerHTML = `
      <div class="hero__title" style="font-size:18px;">Auswertung</div>
      <label class="summarySwitch">
        <input id="reviewAnsweredOnlyToggle" type="checkbox" ${state.reviewAnsweredOnly ? "checked" : ""} />
        <span>Auswertung nur auf beantwortete Fragen beziehen</span>
      </label>
      <div class="summary__grid">
        <div class="sumcard"><div class="sumcard__k">Richtig</div><div class="sumcard__v">${correct}</div></div>
        <div class="sumcard"><div class="sumcard__k">Falsch</div><div class="sumcard__v">${wrong}</div></div>
        <div class="sumcard"><div class="sumcard__k">Offen</div><div class="sumcard__v">${unanswered}</div></div>
        ${pctCards}
      </div>
    `;

    const analyticsHost = document.createElement("div");
    const refreshReviewAnalytics = () => {
      analyticsHost.innerHTML = "";
      renderReviewAnalytics(analyticsHost, computeTopicPerformance({ answeredOnly: state.reviewAnsweredOnly }));
    };

    const answeredOnlyToggle = summary.querySelector("#reviewAnsweredOnlyToggle");
    if (answeredOnlyToggle) {
      answeredOnlyToggle.addEventListener("change", () => {
        state.reviewAnsweredOnly = answeredOnlyToggle.checked;
        refreshReviewAnalytics();
      });
    }

    refreshReviewAnalytics();
    summary.appendChild(analyticsHost);
    list.appendChild(summary);
  }

  const qs = getQuestionsByOrder(state.questionOrder);
  const allowSubmit = (state.view === "quiz");
  await renderQuestionList(qs, { allowSubmit, showSolutions: solutionsVisible() });
}

async function renderQuestionList(qs, { allowSubmit, showSolutions }) {
  const isSession = (state.view === "quiz" || state.view === "review");
  const usePaging = qs.length > MAX_RENDER_NO_PAGING;

  if (isSession) setPagingSectionsVisibility(usePaging);

  let slice = qs;
  let offset = 0;

  if (usePaging) {
    const { page, pageSize } = renderPager(qs.length, "");

    // mirror session pager if visible
    if (isSession) {
      $("pageSize2").value = $("pageSize").value;
      $("pageNumber2").value = $("pageNumber").value;
      $("pageInfo2").textContent = $("pageInfo").textContent;
    }

    slice = qs.slice((page - 1) * pageSize, page * pageSize);
    offset = (page - 1) * pageSize;
  } else {
    // no paging: show all, hide pager sections (session) and keep page fields stable
    const pi = $("pageInfo");
    if (pi) pi.textContent = `${qs.length} Fragen`;
    const pi2 = $("pageInfo2");
    if (pi2) pi2.textContent = `${qs.length} Fragen`;
    $("pageNumber").value = "1";
    $("pageNumber2").value = "1";
  }

  const list = $("questionList");

  for (let idx = 0; idx < slice.length; idx++) {
    const q = slice[idx];
    const qid = q.id;
    const submitted = state.submitted.has(qid);
    const res = state.results.get(qid);

    const card = document.createElement("div");
    card.className = "qcard";
    card.id = "q_" + qid;

    if (submitted) {
      if (showSolutions && (allowSubmit || state.view === "review")) card.classList.add(res ? "ok" : "bad");
      else card.classList.add("neu");
    }

    const meta = document.createElement("div");
    meta.className = "qmeta";
    const showTopicsInBanner = state.view === "search" ? true : (state.quizConfig?.showTopicsInBanner !== false);
    meta.innerHTML = qMetaHtml(q, offset + idx + 1, { showTopics: showTopicsInBanner });

    const text = document.createElement("div");
    text.className = "qtext";
    renderQuestionText(text, q.text, state.view === "search" ? (state.searchConfig?.query || "") : "");

    card.appendChild(meta);
    card.appendChild(text);

    // Images
    if (q.imageFiles && q.imageFiles.length) {
      if (!state.zip) {
        const note = document.createElement("div");
        note.className = "small";
        note.textContent = "Bilder vorhanden – ZIP nicht geladen (oder JSZip nicht verfügbar).";
        card.appendChild(note);
      } else {
        const imgRow = document.createElement("div");
        imgRow.className = "imgrow";
        for (const fb of q.imageFiles) {
          const url = await getImageUrl(fb);
          if (!url) continue;
          const img = document.createElement("img");
          img.loading = "lazy";
          img.src = url;
          img.alt = fb;
          imgRow.appendChild(img);
        }
        if (imgRow.children.length) card.appendChild(imgRow);
      }
    }

    const opts = document.createElement("div");
    opts.className = "opts";

    const selectedOriginal = state.answers.get(qid) || [];
    const preferOriginal = usesOriginalSolutionInQuiz(q);
    const effectiveCorrectIndices = getCorrectIndices(q, { preferOriginal });
    const correctSet = new Set(effectiveCorrectIndices);
    const multi = preferOriginal ? effectiveCorrectIndices.length > 1 : isMultiCorrect(q);
    const displayOrder = state.answerOrder.get(qid) || [...Array((q.answers || []).length).keys()];

    displayOrder.forEach((origIdx, displayIdx) => {
      const a = (q.answers || [])[origIdx];
      const wrap = document.createElement("label");
      wrap.className = "opt";

      const inp = document.createElement("input");
      inp.type = multi ? "checkbox" : "radio";
      inp.name = `q_${qid}`;
      inp.value = String(origIdx);
      inp.checked = selectedOriginal.includes(origIdx);
      inp.disabled = allowSubmit ? submitted : true;

      inp.addEventListener("change", () => {
        const cur = new Set(state.answers.get(qid) || []);
        if (multi) {
          if (inp.checked) cur.add(origIdx);
          else cur.delete(origIdx);
          state.answers.set(qid, Array.from(cur).sort((x,y)=>x-y));
        } else {
          state.answers.set(qid, [origIdx]);
        }
      });

      const t = document.createElement("div");
      t.className = "t";
      const answerText = `${letter(displayIdx)}) ${a?.text || ""}`;
      if (state.view === "search" && state.searchConfig?.inAnswers) {
        highlightText(t, answerText, state.searchConfig?.query || "");
      } else {
        t.textContent = answerText;
      }

      if (showSolutions) {
        const isSel = selectedOriginal.includes(origIdx);
        const isCorr = correctSet.has(origIdx);
        if (!allowSubmit) {
          if (isCorr) wrap.classList.add("ok");
          if (state.view === "review" && isSel && !isCorr) wrap.classList.add("bad");
        } else if (submitted) {
          if (isCorr) wrap.classList.add("ok");
          else if (isSel && !isCorr) wrap.classList.add("bad");
        }
      }

      const shouldMarkOriginalInSearch = (
        state.view === "search" &&
        state.searchConfig?.onlyAiModified &&
        q.aiChangedAnswers &&
        Array.isArray(q.originalCorrectIndices) &&
        q.originalCorrectIndices.includes(origIdx)
      );
      if (shouldMarkOriginalInSearch) {
        wrap.classList.add("orig");
        const marker = document.createElement("span");
        marker.className = "origMarker";
        marker.textContent = " · ursprünglich korrekt";
        t.appendChild(marker);
      }

      wrap.appendChild(inp);
      wrap.appendChild(t);
      opts.appendChild(wrap);
    });

    card.appendChild(opts);

    if (preferOriginal && allowSubmit && submitted && showSolutions) {
      const originalModeInfo = document.createElement("div");
      originalModeInfo.className = "small";
      originalModeInfo.style.marginTop = "8px";
      originalModeInfo.textContent = "Bewertung mit ursprünglicher Lösung (KI-Bearbeitung deaktiviert).";
      card.appendChild(originalModeInfo);
    }

    const practiceAnswered = allowSubmit && submitted && getQuizMode() === "practice";
    const shouldShowAiHint = (
      !!q.aiReasonDetailed &&
      (
        (showSolutions && (state.view === "review" || state.view === "search" || (allowSubmit && submitted))) ||
        practiceAnswered
      )
    );
    if (shouldShowAiHint) {
      const aiHint = document.createElement("details");
      aiHint.className = "aiHintBox";
      const openByDefault = state.explainOpen.has(qid) || state.view === "review" || state.view === "search" || practiceAnswered;
      aiHint.open = openByDefault;

      const aiHintTitle = document.createElement("summary");
      aiHintTitle.className = "aiHintBox__title";
      aiHintTitle.textContent = "Hinweis (KI-generiert):";

      const aiHintBody = document.createElement("div");
      aiHintBody.className = "aiHintBox__body";

      const aiHintText = document.createElement("p");
      aiHintText.className = "aiHintBox__text";
      aiHintText.textContent = formatAiTextForDisplay(q.aiReasonDetailed);

      const aiHintMeta = document.createElement("div");
      aiHintMeta.className = "aiHintBox__meta";
      aiHintMeta.innerHTML = aiSourcesTooltipHtml(q);

      aiHintBody.appendChild(aiHintText);
      aiHintBody.appendChild(aiHintMeta);
      aiHint.appendChild(aiHintTitle);
      aiHint.appendChild(aiHintBody);
      aiHint.addEventListener("toggle", () => {
        if (aiHint.open) state.explainOpen.add(qid);
        else state.explainOpen.delete(qid);
      });
      card.appendChild(aiHint);
    }

    if (q.aiChangedAnswers && allowSubmit && submitted && showSolutions) {
      const oldCorrectIndices = Array.isArray(q.originalCorrectIndices) ? q.originalCorrectIndices : [];
      const oldCorrectText = oldCorrectIndices.length
        ? oldCorrectIndices
            .map((i) => {
              const ansText = (q.answers || [])[i]?.text || "";
              return `${letter(i)}) ${ansText}`;
            })
            .join(" · ")
        : "nicht hinterlegt";

      const oldCorrectInfo = document.createElement("div");
      oldCorrectInfo.className = "small";
      oldCorrectInfo.style.marginTop = "6px";
      oldCorrectInfo.textContent = `Ursprünglich als richtig markiert: ${oldCorrectText}`;
      card.appendChild(oldCorrectInfo);
    }

    if (allowSubmit) {
      const actions = document.createElement("div");
      actions.className = "actions";

      const submitBtn = document.createElement("button");
      submitBtn.className = "btn primary";
      submitBtn.textContent = "Antwort abgeben";
      submitBtn.disabled = submitted;
      submitBtn.addEventListener("click", async () => {
        const nextQid = (() => {
          const idx = state.questionOrder.indexOf(qid);
          if (idx < 0 || idx >= state.questionOrder.length - 1) return null;
          return state.questionOrder[idx + 1];
        })();

        submitAnswer(q);
        const shouldAutoAdvance = (
          state.view === "quiz" &&
          getQuizMode() === "practice" &&
          state.results.get(qid) === true &&
          !!nextQid
        );

        await renderAll();
        if (shouldAutoAdvance) await jumpToQuestion(nextQid);
      });

      const editBtn = document.createElement("button");
      editBtn.className = "btn";
      editBtn.textContent = "Antwort ändern";
      editBtn.disabled = !submitted;
      editBtn.addEventListener("click", async () => {
        unsubmitAnswer(qid);
        await renderAll();
      });

      actions.appendChild(submitBtn);
      actions.appendChild(editBtn);
      card.appendChild(actions);
    }

    // NotebookLM Explain
    if (!allowSubmit || submitted) {
      const explainWrap = document.createElement("div");
      explainWrap.className = "notebookActions";

      const explainBtn = document.createElement("button");
      explainBtn.className = "btn";
      explainBtn.textContent = "In NotebookLM erklären";
      explainBtn.addEventListener("click", async () => { await notebookExplain(q); });

      const hint = document.createElement("div");
      hint.className = "tooltipHint";

      const hintBtn = document.createElement("button");
      hintBtn.type = "button";
      hintBtn.className = "tooltipHint__btn";
      hintBtn.textContent = "?";
      hintBtn.setAttribute("aria-label", "Hinweis zu NotebookLM");

      const hintText = document.createElement("div");
      hintText.className = "tooltipHint__text";
      hintText.textContent = "Öffnet Notebook und kopiert einen Prompt zur Frage in die Zwischenablage, den du direkt im Chat einfügen kannst.";

      hint.appendChild(hintBtn);
      hint.appendChild(hintText);

      explainWrap.appendChild(explainBtn);
      explainWrap.appendChild(hint);
      card.appendChild(explainWrap);
    }

    list.appendChild(card);
  }
}

export async function renderAll() {
  await renderMain();
}
