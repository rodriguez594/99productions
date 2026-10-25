import { initShell, getVideos, CONFIG, pad, esc, reducedMotion } from "./common.js";

initShell();

document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("family").innerHTML = CONFIG.family.map((f) => `<a href="${f.url}">${f.name}</a>`).join(" &nbsp; ");

const links = [
  ["Instagram", CONFIG.instagram],
  ["TikTok", CONFIG.tiktok],
  ["YouTube", CONFIG.youtube],
  ["Email", CONFIG.email && `mailto:${CONFIG.email}`],
].filter(([, url]) => url);
document.getElementById("links").innerHTML = links
  .map(([name, url]) => `<a href="${esc(url)}"${url.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${name}</a>`)
  .join("");

// Wordmark wall: each line holds the text twice so the scroll loops seamlessly.
const line = "<span>99 PRODUCTIONS</span>".repeat(8);
document.getElementById("wall").innerHTML = Array.from({ length: 7 }, () => `<div class="wall-line">${line}${line}</div>`).join("");

// Copenhagen time.
const clockEl = document.getElementById("clock");
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
const tick = () => (clockEl.textContent = fmt.format(new Date()));
tick();
setInterval(tick, 1000);

const videos = await getVideos();

// Showreel tile: a video marked "showreel", otherwise the newest one.
const reelVideo = videos.find((v) => v.category === "showreel") || videos[0];
if (reelVideo) {
  const reel = document.getElementById("reel");
  reel.href = `/work/${encodeURIComponent(reelVideo.slug)}`;
  reel.insertAdjacentHTML(
    "afterbegin",
    `<video class="media" src="${esc(reelVideo.video)}" ${reelVideo.poster ? `poster="${esc(reelVideo.poster)}"` : ""} muted playsinline loop autoplay preload="metadata"></video>`
  );
}

// The showreel tile drifts around the top panel (old DVD-player screensaver). Pauses on hover.
{
  const area = document.querySelector(".c-top");
  const tile = document.getElementById("reel");
  let x = 0, y = 0, vx = 46, vy = 34, last = 0, hover = false;
  tile.addEventListener("pointerenter", () => (hover = true));
  tile.addEventListener("pointerleave", () => (hover = false));
  const place = () => (tile.style.transform = `translate3d(${x}px, ${y}px, 0)`);
  const step = (now) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const maxX = area.clientWidth - tile.offsetWidth;
    const maxY = area.clientHeight - tile.offsetHeight;
    if (!hover && !document.hidden) {
      x += vx * dt;
      y += vy * dt;
      if (x <= 0 || x >= maxX) { vx = -vx; x = Math.max(0, Math.min(maxX, x)); }
      if (y <= 0 || y >= maxY) { vy = -vy; y = Math.max(0, Math.min(maxY, y)); }
    }
    place();
    requestAnimationFrame(step);
  };
  if (!reducedMotion) {
    x = Math.random() * Math.max(0, area.clientWidth - tile.offsetWidth) * 0.6;
    requestAnimationFrame(step);
  }
}

// Stills: video posters, one at a time.
const stills = videos.filter((v) => v.poster);
const box = document.getElementById("stills");
const counter = document.getElementById("still-n");
if (!stills.length) {
  box.innerHTML = `<img src="/assets/logo.svg" alt="" class="on" style="object-fit:contain;padding:30%">`;
  counter.textContent = "001 / 001";
} else {
  box.innerHTML = stills.map((v, i) => `<img class="media${i === 0 ? " on" : ""}" src="${esc(v.poster)}" alt="${esc(v.title)}" loading="lazy">`).join("");
  let at = 0;
  const imgs = [...box.children];
  const show = (i) => {
    const prev = at;
    at = (i + imgs.length) % imgs.length;
    // The old photo stays under the new one until it has tipped in.
    imgs.forEach((img, j) => {
      img.classList.toggle("was", j === prev && j !== at);
      img.classList.toggle("on", j === at);
    });
    counter.textContent = `${pad(at + 1, 3)} / ${pad(imgs.length, 3)}`;
  };
  show(0);
  let timer = setInterval(() => show(at + 1), 4000);
  const manual = (d) => { clearInterval(timer); show(at + d); timer = setInterval(() => show(at + 1), 4000); };
  document.getElementById("still-next").addEventListener("click", () => manual(1));
  document.getElementById("still-prev").addEventListener("click", () => manual(-1));
}
