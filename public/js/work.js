import { initShell, getVideos, t, clock, esc, ratio } from "./common.js";

initShell();

const slug = decodeURIComponent(location.pathname.replace(/^\/work\//, "").replace(/\/$/, ""));
const videos = await getVideos();
const index = videos.findIndex((v) => v.slug === slug);

if (index === -1) {
  document.getElementById("main").innerHTML = `
    <section class="notfound">
      <h1>404</h1>
      <p data-i18n="not-found">${t("not-found")}</p>
      <a class="hud-link" href="/archive" data-i18n="all-work">${t("all-work")}</a>
    </section>`;
} else {
  setup(videos[index]);
}

// 00:01.307 style timecode.
function clockMs(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const ms = Math.floor((sec % 1) * 1000);
  return `${clock(sec)}.${String(ms).padStart(3, "0")}`;
}

function setup(v) {
  document.title = `${v.title}${v.artist ? ` · ${v.artist}` : ""} · 99 PRODUCTIONS`;
  const player = document.getElementById("player");
  const stage = document.getElementById("stage");
  const video = document.getElementById("video");
  const scrub = document.getElementById("scrub");
  const tip = document.getElementById("tip");
  const stageVideo = document.getElementById("stage-video");
  const times = document.querySelectorAll("#time, .fs-time");

  stage.style.setProperty("--ar", ratio(v));
  document.getElementById("title").textContent = v.title;
  document.getElementById("artist").textContent = v.artist;
  if (v.poster) video.poster = v.poster;
  video.src = v.video;
  video.muted = true;

  // Credits + details.
  const rows = [
    ...(v.credits || []).map((c) => [c.role, c.name]),
    [t("category"), t(v.category)],
    ...(v.year ? [[t("year"), v.year]] : []),
    ...(v.duration ? [[t("runtime"), clock(v.duration)]] : []),
  ];
  document.getElementById("credits").innerHTML = rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("");

  // Prev / next.
  if (videos.length > 1) {
    const prev = videos[(index - 1 + videos.length) % videos.length];
    const next = videos[(index + 1) % videos.length];
    const card = (x, key) => `
      <a href="/work/${encodeURIComponent(x.slug)}">
        ${x.poster ? `<img class="media" src="${esc(x.poster)}" alt="" loading="lazy">` : ""}
        <span class="lbl" data-i18n="${key}">${t(key)}</span>
        <span class="nm">${esc(x.title)}</span>
      </a>`;
    document.getElementById("pager").innerHTML = card(prev, "prev") + card(next, "next");
  }

  // Tick-mark scrubber.
  let ticks = [];
  const buildTicks = () => {
    const n = Math.max(30, Math.floor(scrub.clientWidth / 7));
    scrub.querySelectorAll("i").forEach((i) => i.remove());
    scrub.insertAdjacentHTML("afterbegin", "<i></i>".repeat(n));
    ticks = [...scrub.querySelectorAll("i")];
    paint();
  };
  const paint = () => {
    const p = video.duration ? video.currentTime / video.duration : 0;
    const at = Math.round(p * (ticks.length - 1));
    ticks.forEach((tk, i) => { tk.className = i < at ? "on" : i === at ? "head" : ""; });
    const txt = `${clockMs(video.currentTime)} / ${clockMs(video.duration)}`;
    times.forEach((el) => (el.textContent = txt));
    scrub.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    scrub.setAttribute("aria-valuetext", clock(video.currentTime));
  };
  let raf;
  const loop = () => { paint(); raf = video.paused ? null : requestAnimationFrame(loop); };

  const seekAt = (clientX) => {
    const r = scrub.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (video.duration) video.currentTime = p * video.duration;
    paint();
  };
  scrub.addEventListener("pointerdown", (e) => { scrub.setPointerCapture(e.pointerId); seekAt(e.clientX); });
  scrub.addEventListener("pointermove", (e) => {
    const r = scrub.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    tip.style.left = `${p * 100}%`;
    tip.textContent = clock(p * (video.duration || 0));
    if (scrub.hasPointerCapture(e.pointerId)) seekAt(e.clientX);
  });
  scrub.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { video.currentTime += 5; e.preventDefault(); }
    if (e.key === "ArrowLeft") { video.currentTime -= 5; e.preventDefault(); }
  });

  // Controls.
  const playBtns = document.querySelectorAll(".ply");
  const soundBtns = document.querySelectorAll(".snd");
  const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  const syncPlay = () => {
    player.classList.toggle("is-paused", video.paused);
    playBtns.forEach((b) => (b.textContent = t(video.paused ? "play" : "pause")));
    // The cursor label over the video says what a click will do.
    stageVideo.dataset.cursor = video.paused ? "play" : "pause";
    document.querySelector(".cursor.is-media .cursor-label")?.replaceChildren(t(stageVideo.dataset.cursor));
  };
  // Muted shows SOUND dimmed, sound on shows it bright.
  const syncSound = () => {
    soundBtns.forEach((b) => {
      b.textContent = t("sound");
      b.setAttribute("aria-pressed", String(!video.muted));
      b.setAttribute("aria-label", t(video.muted ? "sound-off" : "sound"));
    });
  };
  const setLoading = (on) => player.classList.toggle("is-loading", on);
  const toggleSound = () => { video.muted = !video.muted; syncSound(); };
  const fullscreen = () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (stage.requestFullscreen) return stage.requestFullscreen().catch(() => {});
    video.webkitEnterFullscreen?.();
  };

  stage.addEventListener("click", toggle);
  stage.addEventListener("dblclick", fullscreen);
  playBtns.forEach((b) => b.addEventListener("click", toggle));
  soundBtns.forEach((b) => b.addEventListener("click", toggleSound));
  document.querySelectorAll(".fs").forEach((b) => b.addEventListener("click", fullscreen));

  video.addEventListener("play", () => { syncPlay(); if (!raf) raf = requestAnimationFrame(loop); });
  video.addEventListener("waiting", () => setLoading(true));
  video.addEventListener("playing", () => setLoading(false));
  video.addEventListener("canplay", () => setLoading(false));
  video.addEventListener("error", () => setLoading(false));
  video.addEventListener("pause", syncPlay);
  video.addEventListener("ended", syncPlay);
  video.addEventListener("seeked", paint);
  video.addEventListener("loadedmetadata", paint);

  // Fullscreen bar hides after a moment without movement.
  let idle;
  const wake = () => {
    stage.classList.remove("is-idle");
    clearTimeout(idle);
    if (document.fullscreenElement) idle = setTimeout(() => stage.classList.add("is-idle"), 2200);
  };
  stage.addEventListener("pointermove", wake);
  document.addEventListener("fullscreenchange", wake);
  stage.querySelector(".fs-bar").addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("langchange", () => { syncPlay(); syncSound(); });

  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, a, button") && e.key !== "Escape") return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "m") toggleSound();
    else if (k === "f") fullscreen();
    else if (k === "arrowright") video.currentTime += 5;
    else if (k === "arrowleft") video.currentTime -= 5;
  });

  new ResizeObserver(buildTicks).observe(scrub);
  syncPlay();
  syncSound();
  // Starts muted (browsers block autoplay with sound); SOUND turns it on.
  video.play().catch(() => {});
}
