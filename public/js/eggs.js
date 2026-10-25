// Easter eggs. Nothing here is advertised on the site; the only hint is in the browser console.
// The full list of triggers is in the README.

import { reducedMotion, toggleMode } from "./common.js";

const arcade = () => import("./arcade.js").then((m) => m.openArcade());

export function initEggs() {
  consoleHint();
  typed();
  clicks(".hero-logo", 9, 4000, arcade, (el) => jolt(el));
  clicks(".mode-dot", 9, 3000, vhs);
  clicks("#clock", 3, 1500, problems);
  clicks('.filters [data-f="all"]', 9, 5000, track99);
  if (document.querySelector(".notfound")) {
    addEventListener("keydown", (e) => { if (e.key === "9" && !document.querySelector(".arcade")) arcade(); });
  }
}

// n clicks on the same element within `ms`. `each` runs on every click (small feedback).
function clicks(selector, n, ms, done, each) {
  let count = 0, first = 0;
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(selector);
    if (!el) return;
    const now = Date.now();
    if (now - first > ms) { count = 0; first = now; }
    count++;
    if (each && count > 3) each(el, count);
    if (count >= n) { count = 0; done(el); }
  });
}

// Words typed anywhere (outside form fields), plus the Konami code.
function typed() {
  const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  const WORDS = {
    arcade,
    luftballons: balloons,
    balloons,
    agent: () => toast("AGENT 99 REPORTING. MISSED IT BY THAT MUCH."),
    gretzky: () => toast("NO. 99. RETIRED LEAGUE-WIDE. THE GREAT ONE."),
  };
  let buf = "", seq = [];
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".arcade")) return;
    const k = e.key.toLowerCase();
    seq = [...seq, k].slice(-KONAMI.length);
    if (seq.join() === KONAMI.join()) { seq = []; arcade(); return; }
    if (k.length !== 1) return;
    buf = (buf + k).slice(-16);
    for (const [w, fn] of Object.entries(WORDS)) if (buf.endsWith(w)) { buf = ""; fn(); }
  });
}

function consoleHint() {
  const art = [
    "  .d8888b.   .d8888b.  ",
    " d88P  Y88b d88P  Y88b ",
    " 888    888 888    888 ",
    " Y88b. d888 Y88b. d888 ",
    "  \"Y888P888  \"Y888P888 ",
    "        888        888 ",
    " Y88b  d88P Y88b  d88P ",
    "  \"Y8888P\"   \"Y8888P\"  ",
  ].join("\n");
  console.log(`%c${art}`, "font-family: monospace; color: #f4f5f6; background: #000; padding: 8px 4px;");
  console.log(
    "%c99 PRODUCTIONS · There's more on this site than videos.\nNine is the magic number. Old games know a code. Balloons go up in German.",
    "font-family: monospace; color: #8a8f96;"
  );
}

// ---------------------------------------------------------------- small eggs

function jolt(el) {
  el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px) rotate(-1deg)" }, { transform: "translateX(2px)" }, { transform: "none" }], { duration: 180 });
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector(".egg-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "egg-toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 3600);
}

// Nena, 1983. Ninety-nine of them, the only red on the site.
function balloons() {
  if (document.querySelector(".balloons")) return;
  if (reducedMotion) return toast("99 LUFTBALLONS AUF IHREM WEG ZUM HORIZONT.");
  const box = document.createElement("div");
  box.className = "balloons";
  box.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 99; i++) {
    const b = document.createElement("i");
    const size = 18 + Math.random() * 26;
    b.style.cssText = `left:${Math.random() * 100}%; width:${size}px; height:${size * 1.2}px; animation-duration:${6 + Math.random() * 7}s, ${1.6 + Math.random() * 1.8}s; animation-delay:${Math.random() * 4}s, 0s; opacity:${0.65 + Math.random() * 0.35}`;
    box.append(b);
  }
  document.body.append(box);
  toast("99 LUFTBALLONS");
  setTimeout(() => box.remove(), 16000);
}

// The whole site plays back off a worn tape for 9.9 seconds.
function vhs() {
  if (document.documentElement.classList.contains("vhs")) return;
  // Nine clicks on the colour dot leave the mode flipped; put it back.
  toggleMode();
  const osd = document.createElement("div");
  osd.className = "vhs-osd";
  osd.setAttribute("aria-hidden", "true");
  osd.innerHTML = `<span>PLAY ▶</span><span class="vhs-sp">SP <b>0:00:00</b></span><i class="vhs-band"></i>`;
  document.body.append(osd);
  document.documentElement.classList.add("vhs");
  const counter = osd.querySelector("b");
  const start = performance.now();
  const tick = setInterval(() => {
    const s = (performance.now() - start) / 1000;
    counter.textContent = `0:00:${String(Math.floor(s)).padStart(2, "0")}`;
  }, 100);
  setTimeout(() => {
    clearInterval(tick);
    document.documentElement.classList.remove("vhs");
    osd.remove();
  }, 9900);
}

// Contact page clock.
function problems(el) {
  el.dataset.egg = "1";
  el.textContent = "99 PROBLEMS BUT A DEADLINE AIN'T ONE";
  setTimeout(() => delete el.dataset.egg, 4000);
}

// Archive: a ninety-ninth track that isn't in the list.
function track99() {
  const rows = document.getElementById("rows");
  if (!rows || rows.querySelector(".row-99")) return;
  rows.insertAdjacentHTML(
    "afterbegin",
    `<li class="row row-99"><a href="#arcade">
      <span class="n">[99]</span><span class="t">ARCADE</span><span class="a">99 PRODUCTIONS</span><span class="d">99:99</span>
    </a></li>`
  );
  rows.querySelector(".row-99 a").addEventListener("click", (e) => { e.preventDefault(); arcade(); });
}
