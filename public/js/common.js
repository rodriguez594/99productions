// Shared by every public page: settings, language, colour mode, cursor, scramble text, data.

// Contact details shown on the site. Leave a value empty to hide that link.
export const CONFIG = {
  email: "", // e.g. "booking@99prod.dk"
  instagram: "https://instagram.com/the99ent",
  tiktok: "",
  youtube: "",
  family: [
    { name: "99MGMT", url: "https://99management.dk" },
    { name: "99MS", url: "https://99ms.dk" },
    { name: "99RIM", url: "https://99rim.dk" },
  ],
};

const DA = {
  archive: "Arkiv",
  contact: "Kontakt",
  scroll: "Scroll",
  soon: "Første klip kommer snart",
  "music-video": "Musikvideo",
  promo: "Promo",
  commercial: "Reklame",
  showreel: "Showreel",
  other: "Andet",
  all: "Alle",
  fullscreen: "Fuldskærm",
  sound: "Lyd",
  "sound-off": "Lyd fra",
  play: "Afspil",
  pause: "Pause",
  credits: "Credits",
  details: "Detaljer",
  year: "År",
  runtime: "Spilletid",
  category: "Kategori",
  next: "Næste",
  prev: "Forrige",
  back: "Tilbage",
  "not-found": "Ikke fundet",
  "view-showreel": "Se showreel",
  "mode-colour": "Farve",
  "mode-mono": "S/H",
  mode: "Mode",
  email: "Email",
  "all-work": "Alt arbejde",
  view: "Se",
};
const EN = {
  archive: "Archive",
  contact: "Contact",
  scroll: "Scroll",
  soon: "First cuts coming soon",
  "music-video": "Music video",
  promo: "Promo",
  commercial: "Commercial",
  showreel: "Showreel",
  other: "Other",
  all: "All",
  fullscreen: "Fullscreen",
  sound: "Sound",
  "sound-off": "Sound off",
  play: "Play",
  pause: "Pause",
  credits: "Credits",
  details: "Details",
  year: "Year",
  runtime: "Runtime",
  category: "Category",
  next: "Next",
  prev: "Prev",
  back: "Back",
  "not-found": "Not found",
  "view-showreel": "View showreel",
  "mode-colour": "Colour",
  "mode-mono": "Mono",
  mode: "Mode",
  email: "Email",
  "all-work": "All work",
  view: "View",
};

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

export let lang = store.get("p99-lang") === "da" ? "da" : "en";
export const t = (key) => (lang === "da" ? DA : EN)[key] ?? key;
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll(".lang").forEach((el) => {
    el.innerHTML = lang === "da" ? `<b>DA</b> / EN` : `<b>EN</b> / DA`;
    el.setAttribute("aria-label", lang === "da" ? "Switch to English" : "Skift til dansk");
  });
  document.dispatchEvent(new CustomEvent("langchange"));
}

function applyMode() {
  const mono = store.get("p99-mode") === "mono";
  document.documentElement.classList.toggle("mono", mono);
  document.querySelectorAll("[data-mode-label]").forEach((el) => (el.textContent = t(mono ? "mode-mono" : "mode-colour")));
  document.querySelectorAll(".mode-dot, .mode-btn").forEach((el) => el.setAttribute("aria-pressed", String(mono)));
}

export function toggleMode() {
  store.set("p99-mode", document.documentElement.classList.contains("mono") ? "colour" : "mono");
  applyMode();
}

// ---------------------------------------------------------------- data

let videosPromise;
export function getVideos() {
  videosPromise ??= fetch("/api/videos")
    .then((r) => (r.ok ? r.json() : { videos: [] }))
    .then((d) => d.videos || [])
    .catch(() => []);
  return videosPromise;
}

export const pad = (n, w = 2) => String(n).padStart(w, "0");
export function clock(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  return h ? `${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
export const ratio = (v) => {
  const r = v.width && v.height ? v.width / v.height : 16 / 9;
  return Math.min(2.4, Math.max(0.5625, r));
};
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------------------------------------------------------------- scramble text

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#_-";
const scrambles = new WeakMap();
export function scramble(el, text) {
  text = String(text ?? "").toUpperCase();
  if (reducedMotion) {
    el.textContent = text;
    return;
  }
  cancelAnimationFrame(scrambles.get(el));
  const from = el.textContent;
  const len = Math.max(from.length, text.length);
  const start = performance.now();
  const dur = 420;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    let out = "";
    for (let i = 0; i < len; i++) {
      const settle = i / len;
      if (p >= settle + 0.25 || p === 1) out += text[i] ?? "";
      else if (p >= settle) out += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else out += from[i] ?? "";
    }
    el.textContent = out;
    if (p < 1) scrambles.set(el, requestAnimationFrame(step));
  };
  scrambles.set(el, requestAnimationFrame(step));
}

// ---------------------------------------------------------------- cursor

function initCursor() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const el = document.createElement("div");
  el.className = "cursor";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="cursor-x"></div><div class="cursor-dot"></div><div class="cursor-label"></div>`;
  document.body.append(el);
  document.documentElement.classList.add("has-cursor");
  const label = el.querySelector(".cursor-label");
  let x = -100, y = -100, cx = x, cy = y, raf;
  const loop = () => {
    cx += (x - cx) * 0.35;
    cy += (y - cy) * 0.35;
    el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.1 ? requestAnimationFrame(loop) : null;
  };
  addEventListener("pointermove", (e) => {
    x = e.clientX;
    y = e.clientY;
    if (!raf) raf = requestAnimationFrame(loop);
    const media = e.target.closest?.("[data-cursor]");
    el.classList.toggle("is-media", !!media);
    el.classList.toggle("is-link", !media && !!e.target.closest?.("a, button"));
    if (media) label.textContent = t(media.dataset.cursor);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { x = y = -100; if (!raf) raf = requestAnimationFrame(loop); });
}

// ---------------------------------------------------------------- shell

export function initShell() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  document.querySelectorAll(".hud-link").forEach((a) => {
    if (a.getAttribute("href") === path) a.setAttribute("aria-current", "page");
  });
  document.querySelectorAll(".lang").forEach((b) =>
    b.addEventListener("click", () => {
      lang = lang === "da" ? "en" : "da";
      store.set("p99-lang", lang);
      applyLang();
    })
  );
  document.querySelectorAll(".mode-dot, .mode-btn").forEach((b) => b.addEventListener("click", toggleMode));
  applyLang();
  applyMode();
  initCursor();
}
