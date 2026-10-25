// 99 ARCADE: three small games behind the easter eggs. Loaded only when someone finds a way in.
// Everything draws on one canvas at a fixed 480 × 360 "screen" that is scaled to fit.

const W = 480, H = 360;
const FG = "#f4f5f6", DIM = "#8a8f96", FAINT = "#3a3d42", RED = "#ff2a2a";
const FONT = '"Share Tech Mono", ui-monospace, monospace';
const store = {
  get(k) { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} },
};

let root, canvas, ctx, raf, state, keys = new Set(), lastT = 0, onKey, onKeyUp, menuSel = 0;

export function openArcade() {
  if (root) return;
  root = document.createElement("div");
  root.className = "arcade";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "99 Arcade");
  root.innerHTML = `
    <div class="arcade-screen">
      <canvas width="${W * 2}" height="${H * 2}"></canvas>
      <div class="arcade-scan" aria-hidden="true"></div>
      <div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="arcade-bar"><span>99 ARCADE</span><button type="button" class="arcade-x">ESC · EXIT</button></div>`;
  document.body.append(root);
  document.documentElement.classList.add("arcade-open");
  canvas = root.querySelector("canvas");
  ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  root.querySelector(".arcade-x").addEventListener("click", closeArcade);

  onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); state.name === "menu" ? closeArcade() : menu(); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    e.stopPropagation();
    keys.add(e.key.toLowerCase());
    state.key?.(e.key.toLowerCase());
  };
  onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  addEventListener("keydown", onKey, true);
  addEventListener("keyup", onKeyUp, true);
  touch();
  menu();
  lastT = performance.now();
  raf = requestAnimationFrame(loop);
}

export function closeArcade() {
  if (!root) return;
  cancelAnimationFrame(raf);
  removeEventListener("keydown", onKey, true);
  removeEventListener("keyup", onKeyUp, true);
  root.remove();
  root = null;
  keys.clear();
  document.documentElement.classList.remove("arcade-open");
}

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  if (!document.hidden) state.update?.(dt);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  state.draw(t / 1000);
  raf = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- touch
// Tap = start / jump, swipe = steer the snake, drag = move the paddle.
function touch() {
  let sx = 0, sy = 0, moved = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    [sx, sy] = [e.clientX, e.clientY];
    moved = false;
    state.point?.(...pos(e), "down");
  });
  canvas.addEventListener("pointermove", (e) => {
    state.point?.(...pos(e), "move");
    if (!canvas.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) > 28 && !moved) {
      moved = true;
      state.key?.(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "arrowright" : "arrowleft") : dy > 0 ? "arrowdown" : "arrowup");
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!moved) state.tap?.(...pos(e));
  });
}

// ---------------------------------------------------------------- drawing helpers
function text(str, x, y, { size = 12, color = FG, align = "left", font = FONT } = {}) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}
const big = (str, x, y, size = 48, color = FG) => text(str, x, y, { size, color, align: "center", font: '"Anton", Impact, sans-serif' });
const blink = (t, rate = 2) => Math.floor(t * rate) % 2 === 0;
const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");

function hud(title, score, hiKey) {
  text(title, 14, 16, { color: DIM });
  text(`SCORE ${pad(score, 3)}`, W / 2, 16, { align: "center" });
  text(`HI ${pad(Math.max(score, store.get(hiKey)), 3)}`, W - 14, 16, { align: "right", color: DIM });
  ctx.fillStyle = FAINT;
  ctx.fillRect(0, 30, W, 1);
}

// Shared end screen. Saves the high score.
function over(title, score, hiKey, won) {
  const best = store.get(hiKey);
  if (score > best) store.set(hiKey, score);
  const lines = won
    ? ["99. THAT'S THE NUMBER.", "YOU MADE IT."]
    : score >= 90 ? ["SO CLOSE.", "99 OR NOTHING."] : ["GAME OVER", score > best ? "NEW HIGH SCORE" : "TRY AGAIN"];
  return { lines, best: Math.max(best, score), score, title };
}
function drawOver(o, t) {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 31, W, H - 31);
  big(o.lines[0], W / 2, H / 2 - 34, 40);
  text(o.lines[1], W / 2, H / 2 + 6, { align: "center", color: DIM });
  text(`SCORE ${pad(o.score, 3)}   ·   HI ${pad(o.best, 3)}`, W / 2, H / 2 + 34, { align: "center" });
  if (blink(t)) text("ENTER / TAP · AGAIN      ESC · MENU", W / 2, H - 34, { align: "center", color: DIM, size: 11 });
}

// ---------------------------------------------------------------- menu

const GAMES = [
  { name: "SNAKE 99", line: "GROW TO 99", hi: "p99-hi-snake", start: () => snake() },
  { name: "BRICK 99", line: "BREAK THE 99", hi: "p99-hi-brick", start: () => brick() },
  { name: "REEL RUN", line: "RUN PAST 99", hi: "p99-hi-run", start: () => run() },
];

function menu() {
  let sel = menuSel;
  const go = () => { menuSel = sel; GAMES[sel].start(); };
  const rowY = (i) => 168 + i * 42;
  state = {
    name: "menu",
    key(k) {
      if (k === "arrowup" || k === "w") sel = (sel + GAMES.length - 1) % GAMES.length;
      if (k === "arrowdown" || k === "s") sel = (sel + 1) % GAMES.length;
      if (k === "enter" || k === " ") go();
      if (["1", "2", "3"].includes(k)) { sel = Number(k) - 1; go(); }
    },
    tap(x, y) {
      const i = GAMES.findIndex((_, j) => Math.abs(y - rowY(j)) < 20);
      if (i < 0) return;
      if (i === sel) go();
      else sel = i;
    },
    draw(t) {
      big("99 ARCADE", W / 2, 70, 64);
      text("CREDITS 99", W / 2, 116, { align: "center", color: DIM });
      GAMES.forEach((g, i) => {
        const y = rowY(i), on = i === sel;
        if (on) { ctx.fillStyle = FG; ctx.fillRect(96, y - 15, W - 192, 30); }
        text(`[${pad(i + 1)}]`, 110, y, { color: on ? "#000" : DIM });
        text(g.name, 160, y, { color: on ? "#000" : FG, size: 14 });
        text(on ? g.line : `HI ${pad(store.get(g.hi), 3)}`, W - 110, y, { align: "right", color: on ? "#000" : DIM, size: 11 });
      });
      if (blink(t, 1.5)) text("INSERT 99 KR · PRESS START", W / 2, H - 30, { align: "center", color: DIM, size: 11 });
    },
  };
}

// ---------------------------------------------------------------- SNAKE 99
// Eat the film reels. Reach length 99 to win.

function snake() {
  const C = 12, COLS = 40, ROWS = 27, TOP = 32;
  let body, dir, next, food, step, acc, end, grow;
  const reset = () => {
    body = [[10, 13], [9, 13], [8, 13]];
    dir = next = [1, 0];
    step = 0.11; acc = 0; end = null; grow = 0;
    place();
  };
  const place = () => {
    do food = [(Math.random() * COLS) | 0, (Math.random() * ROWS) | 0];
    while (body.some(([x, y]) => x === food[0] && y === food[1]));
  };
  const turn = (d) => { if (d[0] !== -dir[0] || d[1] !== -dir[1]) next = d; };
  reset();
  state = {
    name: "snake",
    key(k) {
      if (end) { if (k === "enter" || k === " ") reset(); return; }
      if (k === "arrowup" || k === "w") turn([0, -1]);
      if (k === "arrowdown" || k === "s") turn([0, 1]);
      if (k === "arrowleft" || k === "a") turn([-1, 0]);
      if (k === "arrowright" || k === "d") turn([1, 0]);
    },
    tap() { if (end) reset(); },
    update(dt) {
      if (end) return;
      acc += dt;
      while (acc >= step) {
        acc -= step;
        dir = next;
        const head = [(body[0][0] + dir[0] + COLS) % COLS, (body[0][1] + dir[1] + ROWS) % ROWS];
        if (body.some(([x, y]) => x === head[0] && y === head[1])) { end = over("SNAKE 99", body.length, "p99-hi-snake", false); return; }
        body.unshift(head);
        if (head[0] === food[0] && head[1] === food[1]) { grow += 2; step = Math.max(0.05, step * 0.985); place(); }
        if (grow > 0) grow--; else body.pop();
        if (body.length >= 99) { end = over("SNAKE 99", 99, "p99-hi-snake", true); return; }
      }
    },
    draw(t) {
      hud("SNAKE 99", body.length, "p99-hi-snake");
      // Film reel: a ring with a hole.
      const fx = food[0] * C + C / 2, fy = TOP + food[1] * C + C / 2;
      ctx.strokeStyle = blink(t, 4) ? FG : DIM;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx, fy, C / 2 - 1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = FG;
      body.forEach(([x, y], i) => {
        ctx.globalAlpha = i === 0 ? 1 : Math.max(0.35, 1 - i / 120);
        ctx.fillRect(x * C + 1, TOP + y * C + 1, C - 2, C - 2);
      });
      ctx.globalAlpha = 1;
      text(`${pad(body.length)} / 99`, W - 14, H - 12, { align: "right", color: DIM, size: 10 });
      if (end) drawOver(end, t);
    },
  };
}

// ---------------------------------------------------------------- BRICK 99
// The bricks spell 99. Three balls.

const GLYPH_9 = ["01110", "10001", "10001", "01111", "00001", "00010", "11100"];

function brick() {
  const PW = 64, PH = 6, PY = H - 26, R = 4;
  let px, ball, bricks, lives, score, end, held, hit;
  const layout = () => {
    bricks = [];
    const bw = 22, bh = 12, gap = 2, cols = 11, x0 = (W - cols * (bw + gap)) / 2, y0 = 52;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < cols; c++) {
        const g = c < 5 ? GLYPH_9[r][c] : c > 5 ? GLYPH_9[r][c - 6] : "0";
        bricks.push({ x: x0 + c * (bw + gap), y: y0 + r * (bh + gap), w: bw, h: bh, hp: g === "1" ? 2 : 1, solid: g === "1" });
      }
  };
  const serve = () => { held = true; ball = { x: px, y: PY - R - 1, vx: 0, vy: 0 }; };
  const launch = () => { if (!held) return; held = false; const a = (Math.random() * 0.8 - 0.4) - Math.PI / 2; ball.vx = Math.cos(a) * 240; ball.vy = Math.sin(a) * 240; };
  const reset = () => { px = W / 2; lives = 3; score = 0; end = null; hit = 0; layout(); serve(); };
  reset();
  state = {
    name: "brick",
    key(k) {
      if (end) { if (k === "enter" || k === " ") reset(); return; }
      if (k === " " || k === "enter" || k === "arrowup") launch();
    },
    point(x, _y, kind) { if (!end) px = Math.max(PW / 2, Math.min(W - PW / 2, x)); if (kind === "down") launch(); },
    tap() { if (end) reset(); else launch(); },
    update(dt) {
      if (end) return;
      const speed = 320;
      if (keys.has("arrowleft") || keys.has("a")) px -= speed * dt;
      if (keys.has("arrowright") || keys.has("d")) px += speed * dt;
      px = Math.max(PW / 2, Math.min(W - PW / 2, px));
      if (held) { ball.x = px; return; }
      // Small steps so the ball can't skip through a brick.
      const n = 4;
      for (let s = 0; s < n; s++) {
        ball.x += (ball.vx * dt) / n;
        ball.y += (ball.vy * dt) / n;
        if (ball.x < R || ball.x > W - R) { ball.vx *= -1; ball.x = Math.max(R, Math.min(W - R, ball.x)); }
        if (ball.y < 32 + R) { ball.vy = Math.abs(ball.vy); }
        if (ball.vy > 0 && ball.y + R >= PY && ball.y < PY + PH && Math.abs(ball.x - px) < PW / 2 + R) {
          const off = (ball.x - px) / (PW / 2);
          const sp = Math.min(420, Math.hypot(ball.vx, ball.vy) * 1.02);
          const a = -Math.PI / 2 + off * 1.05;
          ball.vx = Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
        }
        for (const b of bricks) {
          if (b.hp <= 0) continue;
          if (ball.x + R > b.x && ball.x - R < b.x + b.w && ball.y + R > b.y && ball.y - R < b.y + b.h) {
            const ox = Math.min(ball.x + R - b.x, b.x + b.w - (ball.x - R));
            const oy = Math.min(ball.y + R - b.y, b.y + b.h - (ball.y - R));
            if (ox < oy) ball.vx *= -1; else ball.vy *= -1;
            b.hp--; hit = 0.08;
            if (b.hp === 0) score += b.solid ? 3 : 1;
            break;
          }
        }
      }
      hit = Math.max(0, hit - dt);
      if (ball.y > H + 10) { lives--; if (lives <= 0) end = over("BRICK 99", score, "p99-hi-brick", false); else serve(); }
      if (bricks.every((b) => b.hp <= 0)) end = over("BRICK 99", score, "p99-hi-brick", true);
    },
    draw(t) {
      hud("BRICK 99", score, "p99-hi-brick");
      for (const b of bricks) {
        if (b.hp <= 0) continue;
        ctx.fillStyle = b.solid ? (b.hp === 2 ? FG : DIM) : FAINT;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.fillStyle = FG;
      ctx.fillRect(px - PW / 2, PY, PW, PH);
      ctx.fillStyle = hit > 0 ? RED : FG;
      ctx.fillRect(ball.x - R, ball.y - R, R * 2, R * 2);
      text("●".repeat(lives), 14, H - 12, { color: DIM, size: 10 });
      if (held && !end && blink(t)) text("SPACE / TAP · SERVE", W / 2, H / 2 + 60, { align: "center", color: DIM, size: 11 });
      if (end) drawOver(end, t);
    },
  };
}

// ---------------------------------------------------------------- REEL RUN
// The camera runs; jump the tripods and clapperboards. 99 is the goal, but it keeps going.

function run() {
  const GY = H - 60, G = 1500, JUMP = 560;
  let y, vy, obs, speed, dist, end, spawn, flash, ducking;
  const reset = () => { y = GY; vy = 0; obs = []; speed = 210; dist = 0; end = null; spawn = 0.8; flash = 0; ducking = false; };
  const jump = () => { if (y >= GY - 0.5) vy = -JUMP; };
  reset();
  state = {
    name: "run",
    key(k) {
      if (end) { if (k === "enter" || k === " ") reset(); return; }
      if (k === " " || k === "arrowup" || k === "w") jump();
    },
    tap() { if (end) reset(); else jump(); },
    update(dt) {
      if (end) return;
      ducking = keys.has("arrowdown") || keys.has("s");
      vy += G * dt * (ducking ? 2.2 : 1);
      y = Math.min(GY, y + vy * dt);
      if (y === GY) vy = 0;
      speed += 6 * dt;
      const before = Math.floor(dist);
      dist += (speed * dt) / 40;
      if (before < 99 && dist >= 99) flash = 1.6;
      flash = Math.max(0, flash - dt);
      spawn -= dt;
      if (spawn <= 0) {
        const kind = Math.random() < 0.55 ? "tripod" : "clap";
        obs.push(kind === "tripod" ? { x: W + 20, w: 18, h: 30, kind } : { x: W + 20, w: 26, h: 18, kind });
        spawn = 0.75 + Math.random() * 0.9 - Math.min(0.35, speed / 2000);
      }
      for (const o of obs) o.x -= speed * dt;
      obs = obs.filter((o) => o.x + o.w > -10);
      // Player box: 22 × 18 camera.
      const pl = { x: 60, y: y - 18, w: 22, h: 18 };
      for (const o of obs) {
        if (pl.x + pl.w - 3 > o.x && pl.x + 3 < o.x + o.w && pl.y + pl.h > GY - o.h + 3) {
          end = over("REEL RUN", Math.floor(dist), "p99-hi-run", false);
          if (dist >= 99) end.lines = ["99 AND BEYOND.", "RESPECT."];
        }
      }
    },
    draw(t) {
      hud("REEL RUN", dist, "p99-hi-run");
      // Ground with moving film perforations.
      ctx.fillStyle = FG;
      ctx.fillRect(0, GY, W, 1);
      ctx.fillStyle = FAINT;
      const off = (dist * 40) % 24;
      for (let x = -off; x < W; x += 24) ctx.fillRect(x, GY + 8, 10, 5);
      // Camera: body, lens, reels on top.
      const cy = y - 18;
      ctx.fillStyle = FG;
      ctx.fillRect(60, cy + 4, 18, 14);
      ctx.fillRect(78, cy + 8, 6, 6);
      ctx.strokeStyle = FG; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(64, cy + 1, 3.5, 0, Math.PI * 2); ctx.arc(74, cy + 1, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = RED;
      if (blink(t, 2)) ctx.fillRect(62, cy + 6, 3, 3);
      for (const o of obs) {
        ctx.strokeStyle = DIM; ctx.fillStyle = DIM; ctx.lineWidth = 2;
        if (o.kind === "tripod") {
          ctx.beginPath();
          ctx.moveTo(o.x + o.w / 2, GY - o.h); ctx.lineTo(o.x, GY);
          ctx.moveTo(o.x + o.w / 2, GY - o.h); ctx.lineTo(o.x + o.w, GY);
          ctx.moveTo(o.x + o.w / 2, GY - o.h); ctx.lineTo(o.x + o.w / 2, GY);
          ctx.stroke();
          ctx.fillRect(o.x + o.w / 2 - 5, GY - o.h - 4, 10, 5);
        } else {
          ctx.fillRect(o.x, GY - o.h + 6, o.w, o.h - 6);
          ctx.save(); ctx.translate(o.x, GY - o.h + 6); ctx.rotate(-0.35); ctx.fillRect(0, -5, o.w, 4); ctx.restore();
        }
      }
      if (flash > 0) big("99!", W / 2, H / 2 - 40, 72, blink(t, 8) ? FG : RED);
      if (dist < 3 && !end) text("SPACE / TAP · JUMP", W / 2, H / 2, { align: "center", color: DIM, size: 11 });
      if (end) drawOver(end, t);
    },
  };
}
