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

function parseColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (isHexColor(v)) {
    const raw = v.slice(1);
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgba = v.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgba) return null;
  const parts = rgba[1].split(",").map((x) => x.trim());
  if (parts.length < 3) return null;
  const r = Number.parseFloat(parts[0]);
  const g = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a };
}

function toRgbaString({ r, g, b, a = 1 }) {
  const rr = Math.round(Math.max(0, Math.min(255, r)));
  const gg = Math.round(Math.max(0, Math.min(255, g)));
  const bb = Math.round(Math.max(0, Math.min(255, b)));
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${rr},${gg},${bb},${aa})`;
}

function darken(color, amount = 0.2) {
  const c = parseColor(color);
  if (!c) return color;
  const t = Math.max(0, Math.min(1, amount));
  return toRgbaString({
    r: c.r * (1 - t),
    g: c.g * (1 - t),
    b: c.b * (1 - t),
    a: 1,
  });
}

function blend(fg, bg) {
  const a = Math.max(0, Math.min(1, fg.a));
  return {
    r: (fg.r * a) + (bg.r * (1 - a)),
    g: (fg.g * a) + (bg.g * (1 - a)),
    b: (fg.b * a) + (bg.b * (1 - a)),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const toLin = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);
  return (0.2126 * R) + (0.7152 * G) + (0.0722 * B);
}

function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function pickReadableText({ background, baseBackground = "#000000", preferred, light = "#ffffff", dark = "#000000", minRatio = 4.5 }) {
  const bgRaw = parseColor(background) || parseColor(baseBackground);
  const base = parseColor(baseBackground) || { r: 0, g: 0, b: 0, a: 1 };
  if (!bgRaw) return preferred || light;

  const bg = bgRaw.a < 1 ? blend(bgRaw, base) : { ...bgRaw, a: 1 };
  const candidates = [preferred, light, dark].filter(Boolean);

  let best = candidates[0] || light;
  let bestRatio = -1;
  for (const c of candidates) {
    const parsed = parseColor(c);
    if (!parsed) continue;
    const ratio = contrastRatio({ ...parsed, a: 1 }, bg);
    if (ratio >= minRatio) return c;
    if (ratio > bestRatio) {
      best = c;
      bestRatio = ratio;
    }
  }
  return best;
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
  const accent = dark.accent || {};
  const stateColors = dark.state || {};
  const heroGradient = dark.gradient?.hero || {};

  const bg1 = aliases.Background1 || "#0b0f17";
  const bg2 = aliases.Background2 || bg1;
  const surface1 = aliases.Surface1 || "#0f1622";
  const surface2 = aliases.Surface2 || "#121a27";
  const accent1 = aliases.Accent1 || accent.accent1 || "#7aa2ff";
  const accent2 = aliases.Accent2 || accent.accent2 || accent1;
  const accent3 = aliases.Accent3 || accent.accent3 || accent1;
  const overlayBase = stateColors.hoverOverlay || "#ffffff10";
  const textLight = text.onAccentLight || "#ffffff";
  const textDark = text.onAccentDark || "#12091f";
  const uiAccent = component.input?.focusBorder || accent1 || accent3;
  const selectedBg = stateColors.selectedOverlay || hexToRgba(uiAccent, 0.14);
  const selectedBgSoft = hexToRgba(uiAccent, 0.08);
  const focusColor = component.input?.focusBorder || accent1 || accent3 || "#7aa2ff";
  const primaryText = aliases.Text1 || text.text1 || "#e8eefc";
  const mutedText = aliases.Text2 || text.text2 || "#a9b4cc";
  const successBase = semantic.success?.bg || aliases.Greenlight || "#2e7d32";
  const dangerBase = semantic.danger?.bg || aliases.Danger || "#c62828";

  const textSafe = pickReadableText({
    background: bg1,
    preferred: primaryText,
    light: textLight,
    dark: textDark,
    minRatio: 4.5,
  });
  const mutedSafe = pickReadableText({
    background: bg1,
    preferred: mutedText,
    light: textLight,
    dark: textDark,
    minRatio: 3.4,
  });
  const textOnSelected = pickReadableText({
    background: selectedBg,
    baseBackground: bg1,
    preferred: textLight,
    light: textLight,
    dark: textDark,
    minRatio: 5,
  });
  const textOnFocus = pickReadableText({
    background: focusColor,
    preferred: textLight,
    light: textLight,
    dark: textDark,
    minRatio: 4.5,
  });
  const questionOptionText = pickReadableText({
    background: surface1,
    baseBackground: bg1,
    preferred: textLight,
    light: textLight,
    dark: textSafe,
    minRatio: 6,
  });

  return {
    "--bg": bg1,
    "--panel": surface2,
    "--panel2": surface1,
    "--text": textSafe,
    "--muted": mutedSafe,
    "--border": aliases.Border1 || "#22304a",
    "--ok": aliases.Greenlight || semantic.success?.bg || "#2e7d32",
    "--bad": aliases.Danger || semantic.danger?.bg || "#c62828",
    "--neutral": aliases.TextMuted || "#607d8b",
    "--btn": component.button?.secondary?.bg || surface2,
    "--btn2": component.button?.secondary?.hoverBg || surface1,
    "--focus": focusColor,
    "--bg-gradient-start": heroGradient.from || bg2,
    "--bg-gradient-accent": hexToRgba(heroGradient.via || accent1, 0.22),
    "--theme-progress-correct-1": darken(component.progress?.successFill || successBase, 0.08),
    "--theme-progress-correct-2": darken(component.progress?.successFill || successBase, 0.25),
    "--theme-progress-wrong-1": darken(dangerBase, 0.08),
    "--theme-progress-wrong-2": darken(component.progress?.dangerFill || dangerBase, 0.25),
    "--theme-pie-label": text.onAccentLight || "#f8fbff",
    "--theme-pie-inner": hexToRgba(bg1, 0.82),

    "--surface-header": hexToRgba(surface2, 0.9),
    "--surface-card": hexToRgba(surface2, 0.74),
    "--surface-soft": hexToRgba(surface1, 0.6),
    "--surface-soft-strong": hexToRgba(surface1, 0.8),
    "--surface-hover": hexToRgba(accent2, 0.2),

    "--interactive-border-hover": hexToRgba(accent3, 0.55),
    "--interactive-border-active": hexToRgba(accent3, 0.8),
    "--interactive-border-soft": hexToRgba(accent3, 0.22),
    "--focus-ring": hexToRgba(accent3, 0.2),

    "--surface-track": bg2,
    "--progress-fill-from": component.progress?.fillGradient?.from || accent1,
    "--progress-fill-to": component.progress?.fillGradient?.to || accent3,

    "--traffic-green": semantic.success?.bg || aliases.Greenlight || "#2e7d32",
    "--traffic-yellow": semantic.attention?.bg || accent3 || "#f59e0b",
    "--traffic-red": semantic.danger?.bg || aliases.Danger || "#f43f5e",
    "--traffic-unknown": text.text3 || aliases.TextMuted || "#64748b",

    "--bad-soft-border": hexToRgba(dangerBase, 0.5),
    "--bad-soft-border-strong": hexToRgba(dangerBase, 0.78),
    "--neutral-strong": hexToRgba(text.text3 || aliases.TextMuted || "#607d8b", 0.9),
    "--selected-bg": selectedBg,
    "--selected-bg-soft": selectedBgSoft,
    "--shadow-color": stateColors.shadowColor || "rgba(0,0,0,.35)",
    "--surface-overlay": overlayBase,
    "--text-on-selected": textOnSelected,
    "--text-on-focus": textOnFocus,
    "--question-option-text": questionOptionText,
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

  // Falls Optionen bereits serverseitig im HTML hinterlegt sind, respektieren wir sie als Fallback.
  const existingValues = new Set(Array.from(select.options).map((opt) => opt.value));
  for (const [id, cfg] of Object.entries(THEME_REGISTRY)) {
    if (existingValues.has(id)) continue;
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

  try {
    await applyTheme(stored || DEFAULT_THEME_ID);
  } catch (err) {
    console.error("Theme-Initialisierung fehlgeschlagen:", err);
    // App soll trotz Theme-Fehler nutzbar bleiben; CSS-Fallback aus styles.css bleibt aktiv.
    state.themeId = DEFAULT_THEME_ID;
    state.themeTokens = null;
    const select = $("themeSelect");
    if (select) select.value = DEFAULT_THEME_ID;
  }
}
