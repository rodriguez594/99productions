import { initShell, getVideos, t, pad, clock, esc, ratio, reducedMotion } from "./common.js";

initShell();

const rowsEl = document.getElementById("rows");
const filtersEl = document.getElementById("filters");
const preview = document.getElementById("preview");
const pvideo = preview.querySelector("video");
const videos = await getVideos();
let filter = "all";

if (!videos.length) {
  rowsEl.outerHTML = `<p class="archive-empty" data-i18n="soon">${t("soon")}</p>`;
} else {
  document.getElementById("count").textContent = `[${pad(videos.length)}]`;
  render();
  renderFilters();
  document.addEventListener("langchange", () => { render(); renderFilters(); });
}

function render() {
  rowsEl.innerHTML = videos
    .map(
      (v, i) => `
    <li class="row" data-cat="${esc(v.category)}" data-i="${i}">
      <a href="/work/${encodeURIComponent(v.slug)}">
        <span class="n">[${pad(i + 1)}]</span>
        <span class="t">${esc(v.title)}</span>
        <span class="a">${esc(v.artist)}</span>
        <span class="d">${v.duration ? clock(v.duration) : "--:--"}</span>
      </a>
    </li>`
    )
    .join("");
  applyFilter(false);
}

function renderFilters() {
  const counts = videos.reduce((m, v) => ((m[v.category] = (m[v.category] || 0) + 1), m), {});
  const cats = ["music-video", "promo", "commercial", "showreel", "other"].filter((c) => counts[c]);
  filtersEl.innerHTML = [["all", videos.length], ...cats.map((c) => [c, counts[c]])]
    .map(([c, n]) => `<button type="button" data-f="${c}" aria-pressed="${c === filter}">${t(c)}<small>[${pad(n)}]</small></button>`)
    .join("");
}

filtersEl.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  filter = b.dataset.f;
  filtersEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  applyFilter(true);
});

function applyFilter(animate) {
  rowsEl.querySelectorAll(".row").forEach((row, i) => {
    const show = filter === "all" || row.dataset.cat === filter;
    if (!animate || reducedMotion) { row.hidden = !show; row.classList.remove("is-out"); return; }
    row.classList.add("is-out");
    setTimeout(() => {
      row.hidden = !show;
      if (show) requestAnimationFrame(() => setTimeout(() => row.classList.remove("is-out"), i * 12));
    }, 180);
  });
}

// Hover preview with the old-TV wobble. Desktop only (CSS hides it on small screens).
const noise = document.getElementById("crt-noise");
const disp = document.getElementById("crt-disp");
const shift = document.getElementById("crt-shift");
let current = -1, hideTimer, glitchRaf;

function glitch() {
  if (reducedMotion) return;
  preview.classList.remove("is-glitch");
  void preview.offsetWidth;
  preview.classList.add("is-glitch");
  const start = performance.now();
  cancelAnimationFrame(glitchRaf);
  const step = (now) => {
    const p = Math.min(1, (now - start) / 500);
    const k = 1 - p;
    disp.setAttribute("scale", String(10 + 70 * k));
    shift.setAttribute("dx", String(-3 - 12 * k));
    noise.setAttribute("seed", String((Math.random() * 100) | 0));
    if (p < 1) glitchRaf = requestAnimationFrame(step);
  };
  glitchRaf = requestAnimationFrame(step);
}

rowsEl.addEventListener("pointerover", (e) => {
  const row = e.target.closest(".row");
  if (!row || row.dataset.i === undefined || !matchMedia("(min-width: 901px)").matches) return;
  clearTimeout(hideTimer);
  const i = Number(row.dataset.i);
  preview.classList.add("is-on");
  bendTo(1);
  if (i === current) return;
  current = i;
  const v = videos[i];
  preview.style.aspectRatio = String(ratio(v));
  drawLens();
  pvideo.poster = v.poster || "";
  pvideo.src = v.video;
  pvideo.addEventListener("loadedmetadata", () => {
    // Start a little way in, past black intro frames.
    if (pvideo.duration > 8) pvideo.currentTime = pvideo.duration * 0.2;
  }, { once: true });
  pvideo.play().catch(() => {});
  glitch();
});
rowsEl.addEventListener("pointerleave", () => {
  hideTimer = setTimeout(() => {
    preview.classList.remove("is-on");
    pvideo.pause();
    current = -1;
    bendTo(0);
  }, 120);
});

// Lens lines. Two guides run down the sides of the preview. While a clip shows they bow
// outwards, and four more lines run from the screen edges into the preview's corners.
const lens = document.getElementById("lens");
const paths = [...lens.children];
let bend = 0, bendTarget = 0, bendRaf;

function drawLens() {
  const W = innerWidth, H = innerHeight;
  // Layout size, not getBoundingClientRect: the preview scales a little as it appears.
  const w = preview.offsetWidth, h = preview.offsetHeight;
  const L = W / 2 - w / 2, R = W / 2 + w / 2, T = H / 2 - h / 2, B = H / 2 + h / 2;
  const bow = 22 * bend, drop = 36 * bend;
  paths[0].setAttribute("d", `M${L + bow} 0 Q${L - bow} ${H / 2} ${L + bow} ${H}`);
  paths[1].setAttribute("d", `M${R - bow} 0 Q${R + bow} ${H / 2} ${R - bow} ${H}`);
  paths[2].setAttribute("d", `M0 ${T + drop} L${L} ${T}`);
  paths[3].setAttribute("d", `M${R} ${T} L${W} ${T + drop * 0.3}`);
  paths[4].setAttribute("d", `M0 ${B - drop * 0.3} L${L} ${B}`);
  paths[5].setAttribute("d", `M${R} ${B} L${W} ${B - drop}`);
  paths.slice(2).forEach((p) => (p.style.opacity = String(bend)));
}

function bendTo(target) {
  bendTarget = target;
  if (reducedMotion) { bend = target; drawLens(); return; }
  cancelAnimationFrame(bendRaf);
  const step = () => {
    bend += (bendTarget - bend) * 0.16;
    if (Math.abs(bendTarget - bend) < 0.002) bend = bendTarget;
    drawLens();
    if (bend !== bendTarget) bendRaf = requestAnimationFrame(step);
  };
  bendRaf = requestAnimationFrame(step);
}
addEventListener("resize", drawLens);
drawLens();
// Idle wobble while a clip is showing.
setInterval(() => {
  if (preview.classList.contains("is-on") && !reducedMotion) noise.setAttribute("seed", String((Math.random() * 100) | 0));
}, 140);
