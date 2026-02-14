export const $ = (id) => document.getElementById(id);

export function normSpace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function letter(i) {
  return String.fromCharCode(65 + i);
}

// Simple 32-bit hash for deterministic RNG seeds
export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Seeded RNG: mulberry32
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sampleK(arr, k, rng) {
  const a = shuffle(arr, rng);
  return a.slice(0, k);
}

export function toast(msg, ms = 1800) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(el.__t);
  el.__t = window.setTimeout(() => { el.hidden = true; }, ms);
}
