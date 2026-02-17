import { state } from "./state.js";
import { $ } from "./utils.js";

const THEME_STORAGE_KEY = "exam_app_theme";

// Zentrale Theme-Definition (ein Ort, von dem aus neue Themes leicht ergänzt werden können)
const THEME_REGISTRY = {
  spezi: { label: "Spezi", file: "./assets/Theme_Spezi.json" },
  dark: { label: "Dark Mode", file: "./assets/theme_dark_mode.json" },
};

const DEFAULT_THEME_ID = "spezi";
const themeCache = new Map();

function isHexColor(value) {
  return typeof value === "string" && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

function hexToRgba(hex, alpha = 1) {
  if (!isHexColor(hex)) return `rgba(0,0,0,${alpha})`;
  const raw = hex.slice(1);
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function resolveThemeId(themeId) {
  if (themeId && THEME_REGISTRY[themeId]) return themeId;
  return DEFAULT_THEME_ID;
}

async function loadThemeDefinition(themeId) {
  const resolvedId = resolveThemeId(themeId);
  if (themeCache.has(resolvedId)) return themeCache.get(resolvedId);

  const resp = await fetch(THEME_REGISTRY[resolvedId].file);
  if (!resp.ok) throw new Error(`Theme konnte nicht geladen werden: ${resolvedId}`);
  const data = await resp.json();
  themeCache.set(resolvedId, data);
  return data;
}

function toCssVars(themeData) {
  const aliases = themeData?.aliases || {};
  const dark = themeData?.theme?.dark || {};
  const semantic = dark.semantic || {};
  const component = dark.component || {};
  const text = dark.text || {};

  return {
    "--bg": aliases.Background1 || "#0b0f17",
    "--panel": aliases.Surface2 || "#121a27",
    "--panel2": aliases.Surface1 || "#0f1622",
    "--text": aliases.Text1 || "#e8eefc",
    "--muted": aliases.Text2 || "#a9b4cc",
    "--border": aliases.Border1 || "#22304a",
    "--ok": aliases.Greenlight || semantic.success?.bg || "#2e7d32",
    "--bad": aliases.Danger || semantic.danger?.bg || "#c62828",
    "--neutral": aliases.TextMuted || "#607d8b",
    "--btn": component.button?.secondary?.bg || "#1d2a44",
    "--btn2": component.button?.secondary?.hoverBg || "#22304a",
    "--focus": aliases.Accent3 || component.input?.focusBorder || "#7aa2ff",
    "--bg-gradient-start": aliases.Background2 || aliases.Background1 || "#070a10",
    "--theme-progress-correct-1": semantic.success?.bg || aliases.Greenlight || "#34d399",
    "--theme-progress-correct-2": component.progress?.successFill || semantic.success?.bg || "#22c55e",
    "--theme-progress-wrong-1": semantic.danger?.softBg || "rgba(252,165,165,.95)",
    "--theme-progress-wrong-2": component.progress?.dangerFill || semantic.danger?.bg || "#c62828",
    "--theme-pie-label": text.onAccentLight || "#f8fbff",
    "--theme-pie-inner": hexToRgba(aliases.Background1 || "#0b0f17", 0.82),
  };
}

function buildThemeTokens(themeData) {
  const dark = themeData?.theme?.dark || {};
  const semantic = dark.semantic || {};
  const chartSeries = Array.isArray(dark.chart?.series) && dark.chart.series.length
    ? dark.chart.series
    : ["#7aa2ff", "#4cc9f0", "#72efdd", "#ffd166", "#f4978e", "#ff99c8"];

  return {
    chartSeries,
    progress: {
      correct1: semantic.success?.bg || "rgba(52,211,153,.95)",
      correct2: dark.component?.progress?.successFill || semantic.success?.bg || "rgba(22,163,74,.95)",
      wrong1: semantic.danger?.softBg || "rgba(252,165,165,.95)",
      wrong2: dark.component?.progress?.dangerFill || semantic.danger?.bg || "rgba(198,40,40,.95)",
    },
    pie: {
      label: dark.text?.onAccentLight || "#f8fbff",
      inner: hexToRgba(themeData?.aliases?.Background1 || "#0b0f17", 0.82),
    },
  };
}

function applyCssVars(vars) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, String(v));
  }

  const ok = vars["--ok"];
  const bad = vars["--bad"];
  const neutral = vars["--neutral"];
  root.style.setProperty("--okbg", hexToRgba(ok, 0.22));
  root.style.setProperty("--badbg", hexToRgba(bad, 0.22));
  root.style.setProperty("--neubg", hexToRgba(neutral, 0.22));
}

function hydrateThemeSelect() {
  const select = $("themeSelect");
  if (!select) return;
  select.innerHTML = "";
  for (const [id, cfg] of Object.entries(THEME_REGISTRY)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = cfg.label;
    select.appendChild(opt);
  }
}

export async function applyTheme(themeId) {
  const resolvedId = resolveThemeId(themeId);
  const data = await loadThemeDefinition(resolvedId);
  applyCssVars(toCssVars(data));

  state.themeId = resolvedId;
  state.themeTokens = buildThemeTokens(data);

  const select = $("themeSelect");
  if (select) select.value = resolvedId;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolvedId);
  } catch {
    // ignore
  }
}

export async function initTheme() {
  hydrateThemeSelect();

  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }

  await applyTheme(stored || DEFAULT_THEME_ID);
}
