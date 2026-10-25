import { initShell, getVideos, scramble, t, pad, ratio, esc, reducedMotion, CONFIG } from "./common.js";

initShell();
runLoader();

const reel = document.getElementById("reel");
const hud = document.getElementById("hud");
const gauge = document.getElementById("gauge");
const hint = document.getElementById("hint");
const pips = document.getElementById("pips");
const hero = document.querySelector(".hero");
const [hCat, hTitle, hArtist, hIdx] = hud.children;

document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("family").innerHTML = CONFIG.family.map((f) => `<a href="${f.url}">${f.name}</a>`).join("");

const all = await getVideos();
const videos = all.some((v) => v.featured) ? all.filter((v) => v.featured) : all;

if (!videos.length) {
  reel.innerHTML = `<p class="reel-empty" data-i18n="soon">${t("soon")}</p>`;
  hTitle.textContent = "99 PRODUCTIONS";
  hIdx.textContent = "00";
  gauge.hidden = true;
} else {
  reel.innerHTML = videos
    .map(
      (v, i) => `
    <a class="reel-item" href="/work/${encodeURIComponent(v.slug)}" data-i="${i}">
      <div class="reel-box">
        <div class="reel-media" style="--ar:${ratio(v)}" data-cursor="view">
          ${v.poster ? `<img class="media" src="${esc(v.poster)}" alt="" loading="${i < 2 ? "eager" : "lazy"}">` : ""}
          <video class="media" muted playsinline loop preload="none" data-src="${esc(v.video)}" aria-label="${esc(v.title)}"></video>
        </div>
        <div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="reel-cap"><span>${esc(v.title)}</span><span>${esc(v.artist)}</span></div>
    </a>`
    )
    .join("");
  setup();
}

function setup() {
  const items = [...reel.querySelectorAll(".reel-item")];
  const TICKS = 48;
  gauge.innerHTML = "<i></i>".repeat(TICKS);
  const ticks = [...gauge.children];
  let focus = -1;

  const load = (i) => {
    const vid = items[i]?.querySelector("video");
    if (vid && !vid.src) vid.src = vid.dataset.src;
  };

  // Clips further from the viewfinder are cropped narrower, so the stack tapers.
  const CUT = ["0%", "7%", "13%", "17%"];

  function setFocus(i) {
    if (i === focus) return;
    focus = i;
    items.forEach((el, j) => {
      const on = j === i;
      el.classList.toggle("is-focus", on);
      el.style.setProperty("--cut", CUT[Math.min(CUT.length - 1, Math.abs(j - i))]);
      const vid = el.querySelector("video");
      const media = el.querySelector(".reel-media");
      if (on) {
        load(j);
        vid.play().then(() => media.classList.add("is-playing")).catch(() => {});
      } else if (vid.src) {
        vid.pause();
        media.classList.remove("is-playing");
      }
    });
    load(i + 1);
    const v = videos[i];
    scramble(hCat, t(v.category));
    scramble(hTitle, v.title);
    scramble(hArtist, v.artist);
    hIdx.textContent = `${pad(i + 1)} – ${pad(videos.length)}`;
    pips.querySelector('[data-d="-1"]').disabled = i === 0;
    pips.querySelector('[data-d="1"]').disabled = i === items.length - 1;
  }

  function onScroll() {
    const mid = innerHeight / 2;
    let best = 0, bestD = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    setFocus(best);
    const first = items[0].offsetTop + items[0].offsetHeight / 2;
    const last = items[items.length - 1].offsetTop + items[items.length - 1].offsetHeight / 2;
    const p = last > first ? Math.min(1, Math.max(0, (scrollY + mid - first) / (last - first))) : 0;
    const at = Math.round(p * (TICKS - 1));
    ticks.forEach((tk, i) => { tk.classList.toggle("on", i <= at); tk.classList.toggle("at", i === at); });
    hint.style.opacity = scrollY > 40 ? 0 : 1;
    // The logo fades out as the reel takes over.
    hero.style.opacity = String(Math.max(0, 1 - scrollY / (hero.offsetHeight * 0.75)));
  }

  let raf;
  addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; onScroll(); }); }, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  const goTo = (i) => items[Math.max(0, Math.min(items.length - 1, i))].scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });

  reel.addEventListener("click", (e) => {
    const item = e.target.closest(".reel-item");
    if (!item) return;
    const i = Number(item.dataset.i);
    if (i !== focus) {
      e.preventDefault();
      goTo(i);
      return;
    }
    // Shared-element page transition: the focused clip grows into the player.
    item.querySelector(".reel-media").style.viewTransitionName = "film";
    if (reducedMotion || e.metaKey || e.ctrlKey || e.shiftKey) return;
    // First the rest clears and guide lines shoot out from the clip's edges. The player page
    // has lines with the same names, so the page transition slides them into its frame.
    e.preventDefault();
    crosshair(item.querySelector(".reel-media").getBoundingClientRect());
    setTimeout(() => (location.href = item.href), 560);
  });
  // Coming back from the player (bfcache): undo the exit.
  addEventListener("pageshow", () => {
    items.forEach((el) => (el.querySelector(".reel-media").style.viewTransitionName = ""));
    document.body.classList.remove("is-leaving");
    document.querySelector(".xhair")?.remove();
  });

  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); goTo(focus + 1); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); goTo(focus - 1); }
  });

  pips.hidden = items.length < 2;
  pips.addEventListener("click", (e) => {
    const d = Number(e.target.closest("button")?.dataset.d);
    if (d) goTo(focus + d);
  });

  gauge.style.pointerEvents = "auto";
  gauge.addEventListener("click", (e) => {
    const r = gauge.getBoundingClientRect();
    goTo(Math.round(((e.clientY - r.top) / r.height) * (items.length - 1)));
  });
}

function crosshair(r) {
  const el = document.createElement("div");
  el.className = "xhair";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `--t:${r.top}px; --b:${r.bottom}px; --l:${r.left}px; --r:${r.right}px; --cx:${r.left + r.width / 2}px; --cy:${r.top + r.height / 2}px`;
  el.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.append(el);
  document.body.classList.add("is-leaving");
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-on")));
}

// Intro, once per visit: the showreel full screen behind a counter that runs to 99.
function runLoader() {
  const el = document.getElementById("loader");
  let seen = false;
  try { seen = sessionStorage.getItem("p99-loaded") === "1"; sessionStorage.setItem("p99-loaded", "1"); } catch {}
  if (seen || reducedMotion) return;
  el.hidden = false;
  const count = document.getElementById("loader-count");
  const bar = document.getElementById("loader-bar");
  const vid = document.getElementById("loader-video");
  const now = new Date().getFullYear();
  document.getElementById("loader-years").textContent = now;
  const handle = CONFIG.instagram.match(/instagram\.com\/([^/?#]+)/)?.[1];
  if (handle) document.getElementById("loader-handle").textContent = `@${handle}`;

  getVideos().then((list) => {
    const v = list.find((x) => x.category === "showreel") || list[0];
    if (v) {
      vid.src = v.video;
      vid.play().then(() => vid.classList.add("is-on")).catch(() => {});
    }
    const from = Math.min(now, ...list.map((x) => x.year).filter(Boolean));
    if (from < now) document.getElementById("loader-years").textContent = `${from} – ${now}`;
  });

  const start = performance.now();
  const dur = 2600;
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    count.textContent = pad(Math.round(e * 99));
    bar.style.width = `${e * 100}%`;
    if (p < 1) return requestAnimationFrame(step);
    setTimeout(() => el.classList.add("is-done"), 300);
    setTimeout(() => { vid.pause(); vid.removeAttribute("src"); vid.load(); }, 1200);
  };
  requestAnimationFrame(step);
}
