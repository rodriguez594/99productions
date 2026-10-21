// 99 PRODUCTIONS admin: log in, upload videos to R2, edit details, order and publish.

const $ = (id) => document.getElementById(id);
const PART_SIZE = 32 * 1024 * 1024; // upload in 32 MB parts (Workers accept up to 100 MB per request)
const PARALLEL = 3;
const DEFAULT_CREDITS = ["Director", "DOP", "Edit", "Colour"];

let videos = [];
let draft = null; // video being edited
let uploading = null; // { abort(), promise }

// The admin lives on admin.99prod.dk; "View site" should go to the public site.
if (location.hostname.startsWith("admin.")) $("site-link").href = `https://${location.hostname.slice(6)}/`;

/* ---------------------------------------------------------------- api */

async function api(path, { json, body, method, headers } = {}) {
  const res = await fetch(path, {
    method: method || (json || body ? "POST" : "GET"),
    headers: { "x-99-admin": "1", ...(json ? { "content-type": "application/json" } : {}), ...headers },
    body: json ? JSON.stringify(json) : body,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/admin/login") showLogin();
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

const clock = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CAT = { "music-video": "Music video", promo: "Promo", commercial: "Commercial", showreel: "Showreel", other: "Other" };

/* ---------------------------------------------------------------- views */

function show(view) {
  $("login").hidden = view !== "login";
  $("app").hidden = view !== "app";
  $("editor").hidden = view !== "editor";
  scrollTo(0, 0);
}

function showLogin(message = "") {
  show("login");
  $("login-msg").textContent = message;
  $("password").focus();
}

async function boot() {
  const s = await api("/api/admin/session").catch(() => ({}));
  if (!s.configured) return showLogin("ADMIN_PASSWORD is not set yet. Add it in Cloudflare → Workers → 99productions → Settings → Variables and Secrets.");
  if (!s.loggedIn) return showLogin();
  await loadList();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-msg").textContent = "";
  try {
    await api("/api/admin/login", { json: { password: $("password").value } });
    $("password").value = "";
    await loadList();
  } catch (err) {
    $("login-msg").textContent = err.message;
  }
});

$("logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  showLogin();
});

/* ---------------------------------------------------------------- list */

async function loadList() {
  const data = await api("/api/admin/videos");
  videos = data.videos;
  renderList();
  show("app");
}

function renderList() {
  $("count").textContent = videos.length ? `(${videos.length})` : "";
  $("empty").hidden = videos.length > 0;
  $("list").innerHTML = videos
    .map(
      (v) => `
    <li class="item" draggable="true" data-id="${v.id}">
      <span class="handle" title="Drag">⋮⋮</span>
      <div class="thumb" style="${v.poster ? `background-image:url('${esc(v.poster)}')` : ""}"></div>
      <div class="info"><b>${esc(v.title)}</b><span>${esc(v.artist || "–")} · ${CAT[v.category] || v.category} · ${clock(v.duration)}</span></div>
      <div class="chips">
        ${!v.video_key ? `<span class="chip warn">No video</span>` : ""}
        <button class="chip ${v.published ? "live" : ""}" data-act="publish" title="Click to ${v.published ? "hide" : "publish"}">${v.published ? "Live" : "Hidden"}</button>
        <button class="chip ${v.featured ? "live" : ""}" data-act="feature" title="Show on the homepage reel">${v.featured ? "On reel" : "Archive only"}</button>
      </div>
      <div class="actions">
        <button class="icon" data-act="up" title="Move up" aria-label="Move up">↑</button>
        <button class="icon" data-act="down" title="Move down" aria-label="Move down">↓</button>
        <button class="btn" data-act="edit">Edit</button>
      </div>
    </li>`
    )
    .join("");
}

function payload(v) {
  return {
    title: v.title, artist: v.artist, category: v.category, year: v.year, duration: v.duration, credits: v.credits,
    video_key: v.video_key, poster_key: v.poster_key, width: v.width, height: v.height,
    featured: v.featured, published: v.published, slug: v.slug,
  };
}

$("list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const li = btn.closest(".item");
  const i = videos.findIndex((v) => v.id === li.dataset.id);
  const v = videos[i];
  const act = btn.dataset.act;
  try {
    if (act === "edit") return openEditor(v);
    if (act === "publish" || act === "feature") {
      const next = { ...payload(v), [act === "publish" ? "published" : "featured"]: act === "publish" ? !v.published : !v.featured };
      const { video } = await api(`/api/admin/videos/${v.id}`, { method: "PUT", json: next });
      videos[i] = video;
      renderList();
      toast(act === "publish" ? (video.published ? "Published" : "Hidden from the site") : video.featured ? "On the homepage reel" : "Archive only");
    }
    if (act === "up" || act === "down") {
      const j = act === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= videos.length) return;
      [videos[i], videos[j]] = [videos[j], videos[i]];
      renderList();
      await saveOrder();
    }
  } catch (err) {
    toast(err.message);
  }
});

async function saveOrder() {
  await api("/api/admin/order", { json: { ids: videos.map((v) => v.id) } });
  toast("Order saved");
}

// Drag to reorder.
let dragId = null;
$("list").addEventListener("dragstart", (e) => {
  const li = e.target.closest(".item");
  dragId = li?.dataset.id;
  li?.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});
$("list").addEventListener("dragover", (e) => {
  e.preventDefault();
  document.querySelectorAll(".item.over").forEach((x) => x.classList.remove("over"));
  e.target.closest(".item")?.classList.add("over");
});
$("list").addEventListener("dragend", () => document.querySelectorAll(".item").forEach((x) => x.classList.remove("dragging", "over")));
$("list").addEventListener("drop", async (e) => {
  e.preventDefault();
  const target = e.target.closest(".item")?.dataset.id;
  if (!dragId || !target || dragId === target) return;
  const from = videos.findIndex((v) => v.id === dragId);
  const to = videos.findIndex((v) => v.id === target);
  const [moved] = videos.splice(from, 1);
  videos.splice(to, 0, moved);
  renderList();
  await saveOrder().catch((err) => toast(err.message));
});

$("new").addEventListener("click", () => openEditor(null));

/* ---------------------------------------------------------------- editor */

const form = $("form");
const pv = $("pv");

function openEditor(v) {
  draft = v
    ? { ...v, credits: [...(v.credits || [])] }
    : { title: "", artist: "", category: "music-video", year: new Date().getFullYear(), credits: DEFAULT_CREDITS.map((role) => ({ role, name: "" })), featured: true, published: false, video_key: null, poster_key: null };
  $("editor-title").textContent = v ? v.title : "New video";
  $("delete").hidden = !v;
  $("form-msg").textContent = "";
  form.title.value = draft.title;
  form.artist.value = draft.artist || "";
  form.category.value = draft.category;
  form.year.value = draft.year || "";
  form.slug.value = draft.slug || "";
  $("slug-hint").textContent = v ? `99prod.dk/work/${v.slug}` : "";
  form.featured.checked = draft.featured !== false;
  form.published.checked = !!draft.published;
  renderCredits();
  setVideoPreview(draft.video ? draft.video : null);
  setPoster(draft.poster || null);
  $("meta").textContent = describe();
  $("progress").hidden = true;
  show("editor");
}

function describe() {
  if (!draft?.duration) return "";
  return `${clock(draft.duration)}${draft.width ? ` · ${draft.width}×${draft.height}` : ""}`;
}

function setVideoPreview(src) {
  pv.hidden = !src;
  $("drop-empty").hidden = !!src;
  if (src) pv.src = src;
  else pv.removeAttribute("src");
}

function setPoster(src) {
  $("poster-img").hidden = !src;
  $("poster-none").hidden = !!src;
  if (src) $("poster-img").src = src;
}

function renderCredits() {
  $("credits").innerHTML = draft.credits
    .map(
      (c, i) => `
    <div class="credit" data-i="${i}">
      <input data-k="role" value="${esc(c.role)}" placeholder="Role" aria-label="Role">
      <input data-k="name" value="${esc(c.name)}" placeholder="Name" aria-label="Name">
      <button class="icon" type="button" data-rm="${i}" aria-label="Remove">×</button>
    </div>`
    )
    .join("");
}
$("credits").addEventListener("input", (e) => {
  const row = e.target.closest(".credit");
  if (row) draft.credits[row.dataset.i][e.target.dataset.k] = e.target.value;
});
$("credits").addEventListener("click", (e) => {
  if (e.target.dataset.rm === undefined) return;
  draft.credits.splice(Number(e.target.dataset.rm), 1);
  renderCredits();
});
$("add-credit").addEventListener("click", () => {
  draft.credits.push({ role: "", name: "" });
  renderCredits();
  $("credits").lastElementChild.querySelector("input").focus();
});

$("back").addEventListener("click", () => {
  if (uploading && !confirm("An upload is still running. Leave and cancel it?")) return;
  uploading?.abort();
  loadList().catch((err) => toast(err.message));
});

/* ---------------------------------------------------------------- video upload */

for (const id of ["file", "file2"]) $(id).addEventListener("change", (e) => e.target.files[0] && pickVideo(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith("video/")) pickVideo(f);
});

async function pickVideo(file) {
  if (uploading) uploading.abort();
  const local = URL.createObjectURL(file);
  setVideoPreview(local);
  $("form-msg").textContent = "";

  // Read length and size in the browser.
  pv.addEventListener(
    "loadedmetadata",
    () => {
      draft.duration = pv.duration;
      draft.width = pv.videoWidth;
      draft.height = pv.videoHeight;
      $("meta").textContent = `${describe()} · ${(file.size / 1e9).toFixed(2)} GB`;
      // First poster automatically, from 10% in, if there isn't one yet.
      if (!draft.poster_key) {
        pv.currentTime = Math.min(pv.duration * 0.1, 8);
        pv.addEventListener("seeked", () => grabFrame().catch(() => {}), { once: true });
      }
    },
    { once: true }
  );
  pv.addEventListener("error", () => ($("form-msg").textContent = "This browser can't play the file. It will still upload, but export an MP4 (H.264) so it plays on the site."), { once: true });

  if (!form.title.value) form.title.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").toUpperCase();

  try {
    const key = await uploadLarge(file);
    draft.video_key = key;
    toast("Video uploaded. Press Save.");
  } catch (err) {
    if (err.name !== "AbortError") $("form-msg").textContent = `Upload failed: ${err.message}`;
  }
}

function uploadLarge(file) {
  const ctrl = new AbortController();
  const xhrs = new Set();
  let state = null;
  const abort = () => {
    ctrl.abort();
    xhrs.forEach((x) => x.abort());
    if (state) api("/api/admin/uploads/abort", { json: state }).catch(() => {});
  };

  const promise = (async () => {
    const bar = $("progress-fill");
    const text = $("progress-text");
    $("progress").hidden = false;
    $("save").disabled = true;
    const parts = Math.max(1, Math.ceil(file.size / PART_SIZE));
    const loaded = new Array(parts).fill(0);
    const started = performance.now();
    const update = () => {
      const done = loaded.reduce((a, b) => a + b, 0);
      const pct = Math.min(100, (done / file.size) * 100);
      const mbps = done / 1e6 / Math.max(0.5, (performance.now() - started) / 1000);
      bar.style.width = `${pct}%`;
      text.textContent = `Uploading ${pct.toFixed(0)}% · ${mbps.toFixed(1)} MB/s`;
      $("save").textContent = `Uploading ${pct.toFixed(0)}%`;
    };

    try {
      const start = await api("/api/admin/uploads", { json: { kind: "video", name: file.name, type: file.type || "video/mp4" } });
      state = { key: start.key, uploadId: start.uploadId };
      const results = [];
      let next = 0;

      const sendPart = (n) =>
        new Promise((resolve, reject) => {
          const blob = file.slice((n - 1) * PART_SIZE, Math.min(file.size, n * PART_SIZE));
          const xhr = new XMLHttpRequest();
          xhrs.add(xhr);
          xhr.open("PUT", `/api/admin/uploads/part?key=${encodeURIComponent(state.key)}&uploadId=${encodeURIComponent(state.uploadId)}&n=${n}`);
          xhr.setRequestHeader("x-99-admin", "1");
          xhr.upload.onprogress = (e) => { loaded[n - 1] = e.loaded; update(); };
          xhr.onload = () => {
            xhrs.delete(xhr);
            if (xhr.status === 200) { loaded[n - 1] = blob.size; update(); resolve(JSON.parse(xhr.responseText)); }
            else reject(new Error(`part ${n}: ${xhr.status}`));
          };
          xhr.onerror = () => { xhrs.delete(xhr); reject(new Error(`part ${n}: network error`)); };
          xhr.onabort = () => { xhrs.delete(xhr); reject(new DOMException("Aborted", "AbortError")); };
          xhr.send(blob);
        });

      const worker = async () => {
        while (next < parts) {
          const n = ++next;
          for (let attempt = 1; ; attempt++) {
            if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
            try {
              results[n - 1] = await sendPart(n);
              break;
            } catch (err) {
              if (err.name === "AbortError" || attempt >= 4) throw err;
              loaded[n - 1] = 0;
              await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, parts) }, worker));
      await api("/api/admin/uploads/complete", { json: { ...state, parts: results } });
      text.textContent = "Upload complete";
      bar.style.width = "100%";
      return state.key;
    } catch (err) {
      if (err.name !== "AbortError" && state) api("/api/admin/uploads/abort", { json: state }).catch(() => {});
      text.textContent = err.name === "AbortError" ? "Upload cancelled" : "Upload failed";
      throw err;
    } finally {
      // A newer upload may have replaced this one; only reset if this is still the current one.
      if (uploading?.abort === abort) {
        uploading = null;
        $("save").disabled = false;
        $("save").textContent = "Save";
      }
    }
  })();

  uploading = { abort, promise };
  return promise;
}

$("cancel-upload").addEventListener("click", () => uploading?.abort());
addEventListener("beforeunload", (e) => {
  if (uploading) e.preventDefault();
});

/* ---------------------------------------------------------------- poster */

async function grabFrame() {
  if (!pv.videoWidth) throw new Error("Load a video first");
  const scale = Math.min(1, 1920 / pv.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pv.videoWidth * scale);
  canvas.height = Math.round(pv.videoHeight * scale);
  canvas.getContext("2d").drawImage(pv, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.86));
  await uploadPoster(blob);
}

async function uploadPoster(blob) {
  const res = await api("/api/admin/files", { method: "PUT", body: blob, headers: { "content-type": blob.type } });
  draft.poster_key = res.key;
  setPoster(res.url);
}

$("grab").addEventListener("click", () => grabFrame().then(() => toast("Poster set")).catch((err) => toast(err.message)));
$("poster-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) uploadPoster(f).then(() => toast("Poster set")).catch((err) => toast(err.message));
});

/* ---------------------------------------------------------------- save / delete */

$("save").addEventListener("click", async () => {
  if (uploading) return;
  if (!form.reportValidity()) return;
  Object.assign(draft, {
    title: form.title.value.trim(),
    artist: form.artist.value.trim(),
    category: form.category.value,
    year: form.year.value ? Number(form.year.value) : null,
    slug: form.slug.value.trim() || undefined,
    featured: form.featured.checked,
    published: form.published.checked,
    credits: draft.credits.filter((c) => c.role.trim() || c.name.trim()),
  });
  $("save").disabled = true;
  try {
    if (draft.id) await api(`/api/admin/videos/${draft.id}`, { method: "PUT", json: payload(draft) });
    else await api("/api/admin/videos", { json: payload(draft) });
    toast(draft.published ? "Saved. It's live on the site." : "Saved (hidden)");
    await loadList();
  } catch (err) {
    $("form-msg").textContent = err.message;
  } finally {
    $("save").disabled = false;
  }
});

$("delete").addEventListener("click", async () => {
  if (!draft?.id || !confirm(`Delete "${draft.title}"? The video file is deleted too.`)) return;
  try {
    await api(`/api/admin/videos/${draft.id}`, { method: "DELETE" });
    toast("Deleted");
    await loadList();
  } catch (err) {
    toast(err.message);
  }
});

boot();
