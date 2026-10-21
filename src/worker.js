// 99 PRODUCTIONS Worker.
// - 99prod.dk          → public site (static files in /public) + public API + media
// - admin.99prod.dk    → admin panel (/public/admin) + admin API
// Data: D1 (binding DB) holds the video list, R2 (binding MEDIA) holds video and poster files.

const SITE_HOST = "99prod.dk";
const ADMIN_HOST = "admin.99prod.dk";
const CATEGORIES = ["music-video", "promo", "commercial", "showreel", "other"];
const SESSION_COOKIE = "p99_admin";
const SESSION_DAYS = 30;
const MAX_LOGIN_ATTEMPTS = 10; // per IP per 15 minutes
const MAX_SIMPLE_UPLOAD = 15 * 1024 * 1024; // posters
const MAX_PART = 95 * 1024 * 1024; // Workers accept request bodies up to 100 MB on the free plan

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === `www.${SITE_HOST}`) {
      url.hostname = SITE_HOST;
      return Response.redirect(url.toString(), 301);
    }

    const adminHost = url.hostname === ADMIN_HOST;
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) return await api(request, env, url);
      if (path.startsWith("/media/")) return await media(request, env, url);

      if (adminHost) {
        if (path === "/" || path === "/index.html") return page(env, url, "/admin/", true);
        return withHeaders(await env.ASSETS.fetch(request), true);
      }

      if (path === "/admin" || path.startsWith("/admin/")) {
        // On the real domain the admin lives on its own subdomain; locally it stays at /admin/.
        if (url.hostname === SITE_HOST) return Response.redirect(`https://${ADMIN_HOST}/`, 302);
        return withHeaders(await env.ASSETS.fetch(request), true);
      }

      if (path.startsWith("/work/")) return page(env, url, "/work");

      return withHeaders(await env.ASSETS.fetch(request));
    } catch (err) {
      console.error(err);
      if (path.startsWith("/api/")) return json({ error: "Server error" }, 500);
      return new Response("Server error", { status: 500 });
    }
  },
};

// Serve a static page under a different path (e.g. every /work/<slug> gets work.html).
async function page(env, url, assetPath, admin = false) {
  const res = await env.ASSETS.fetch(new URL(assetPath, url.origin));
  return withHeaders(res, admin);
}

function withHeaders(res, admin = false) {
  const out = new Response(res.body, res);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  out.headers.set("X-Frame-Options", "SAMEORIGIN");
  if (admin) {
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    out.headers.set("Cache-Control", "no-store");
  }
  return out;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

/* ---------------------------------------------------------------- schema */

let schemaReady;
function ensureSchema(env) {
  schemaReady ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'music-video',
      year INTEGER,
      duration REAL,
      credits TEXT NOT NULL DEFAULT '[]',
      video_key TEXT,
      poster_key TEXT,
      width INTEGER,
      height INTEGER,
      featured INTEGER NOT NULL DEFAULT 1,
      published INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS videos_sort ON videos (sort)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts (ip, at)`),
  ]).catch((err) => {
    schemaReady = undefined;
    throw err;
  });
  return schemaReady;
}

/* ---------------------------------------------------------------- API */

async function api(request, env, url) {
  await ensureSchema(env);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/videos" && method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT * FROM videos WHERE published = 1 AND video_key IS NOT NULL ORDER BY sort, created_at DESC`
    ).all();
    return json({ videos: results.map(publicVideo) }, 200, { "cache-control": "no-cache" });
  }

  if (path.startsWith("/api/admin/")) return admin(request, env, url);

  return json({ error: "Not found" }, 404);
}

function publicVideo(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    category: row.category,
    year: row.year,
    duration: row.duration,
    credits: safeJson(row.credits, []),
    video: row.video_key ? `/media/${row.video_key}` : null,
    poster: row.poster_key ? `/media/${row.poster_key}` : null,
    width: row.width,
    height: row.height,
    featured: !!row.featured,
  };
}

function adminVideo(row) {
  return { ...publicVideo(row), published: !!row.published, sort: row.sort, video_key: row.video_key, poster_key: row.poster_key, updated_at: row.updated_at };
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/* ---------------------------------------------------------------- admin API */

async function admin(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/admin/login" && method === "POST") return login(request, env);
  if (path === "/api/admin/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }
  if (path === "/api/admin/session" && method === "GET") {
    return json({ loggedIn: await isAdmin(request, env), configured: !!env.ADMIN_PASSWORD });
  }

  if (!(await isAdmin(request, env))) return json({ error: "Not logged in" }, 401);
  // Requests that change something must carry this header. Browsers can't add it cross-site
  // without a CORS preflight, which we never allow, so it blocks CSRF together with SameSite.
  if (method !== "GET" && request.headers.get("x-99-admin") !== "1") return json({ error: "Missing header" }, 403);

  if (path === "/api/admin/videos" && method === "GET") {
    const { results } = await env.DB.prepare(`SELECT * FROM videos ORDER BY sort, created_at DESC`).all();
    return json({ videos: results.map(adminVideo) });
  }
  if (path === "/api/admin/videos" && method === "POST") return createVideo(request, env);

  const one = path.match(/^\/api\/admin\/videos\/([\w-]+)$/);
  if (one && method === "PUT") return updateVideo(request, env, one[1]);
  if (one && method === "DELETE") return deleteVideo(env, one[1]);

  if (path === "/api/admin/order" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.ids)) return json({ error: "ids required" }, 400);
    const stmt = env.DB.prepare(`UPDATE videos SET sort = ? WHERE id = ?`);
    await env.DB.batch(body.ids.slice(0, 1000).map((id, i) => stmt.bind(i, String(id))));
    return json({ ok: true });
  }

  // Large files (videos): R2 multipart upload in parts, so any size works.
  if (path === "/api/admin/uploads" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const key = newKey(body.kind, body.name);
    if (!key) return json({ error: "Bad file" }, 400);
    const upload = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: body.type || "video/mp4" } });
    return json({ key, uploadId: upload.uploadId });
  }
  if (path === "/api/admin/uploads/part" && method === "PUT") {
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId");
    const n = Number(url.searchParams.get("n"));
    if (!validKey(key) || !uploadId || !Number.isInteger(n) || n < 1 || n > 10000) return json({ error: "Bad part" }, 400);
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > MAX_PART) return json({ error: "Bad part size" }, 400);
    const part = await env.MEDIA.resumeMultipartUpload(key, uploadId).uploadPart(n, data);
    return json(part);
  }
  if (path === "/api/admin/uploads/complete" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!validKey(body.key) || !body.uploadId || !Array.isArray(body.parts)) return json({ error: "Bad upload" }, 400);
    const parts = body.parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }));
    await env.MEDIA.resumeMultipartUpload(body.key, body.uploadId).complete(parts);
    return json({ key: body.key, url: `/media/${body.key}` });
  }
  if (path === "/api/admin/uploads/abort" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (validKey(body.key) && body.uploadId) {
      await env.MEDIA.resumeMultipartUpload(body.key, body.uploadId).abort().catch(() => {});
    }
    return json({ ok: true });
  }

  // Small files (posters): one request.
  if (path === "/api/admin/files" && method === "PUT") {
    const type = request.headers.get("content-type") || "";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: "Poster must be JPEG, PNG or WebP" }, 400);
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > MAX_SIMPLE_UPLOAD) return json({ error: "Poster too large (max 15 MB)" }, 400);
    const key = newKey("poster", "poster." + type.split("/")[1]);
    await env.MEDIA.put(key, data, { httpMetadata: { contentType: type } });
    return json({ key, url: `/media/${key}` });
  }

  return json({ error: "Not found" }, 404);
}

function newKey(kind, name) {
  const prefix = kind === "video" ? "videos" : kind === "poster" ? "posters" : null;
  if (!prefix) return null;
  const ext = (String(name || "").match(/\.([a-z0-9]{2,5})$/i)?.[1] || (prefix === "videos" ? "mp4" : "jpg")).toLowerCase();
  return `${prefix}/${crypto.randomUUID()}.${ext}`;
}

function validKey(key, prefix) {
  if (typeof key !== "string" || !/^(videos|posters)\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(key)) return false;
  return !prefix || key.startsWith(prefix + "/");
}

async function createVideo(request, env) {
  const input = await request.json().catch(() => null);
  const v = cleanVideo(input);
  if (v.error) return json({ error: v.error }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = await uniqueSlug(env, input.slug || `${v.title} ${v.artist}`);
  // New videos go first.
  const { min } = (await env.DB.prepare(`SELECT MIN(sort) AS min FROM videos`).first()) || {};
  const sort = (min ?? 1) - 1;

  await env.DB.prepare(
    `INSERT INTO videos (id, slug, title, artist, category, year, duration, credits, video_key, poster_key, width, height, featured, published, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, slug, v.title, v.artist, v.category, v.year, v.duration, v.credits, v.video_key, v.poster_key, v.width, v.height, v.featured, v.published, sort, now, now)
    .run();
  const row = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  return json({ video: adminVideo(row) }, 201);
}

async function updateVideo(request, env, id) {
  const old = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  if (!old) return json({ error: "Not found" }, 404);
  const input = await request.json().catch(() => null);
  const v = cleanVideo(input);
  if (v.error) return json({ error: v.error }, 400);

  let slug = old.slug;
  if (input.slug && slugify(input.slug) !== old.slug) slug = await uniqueSlug(env, input.slug, id);

  await env.DB.prepare(
    `UPDATE videos SET slug = ?, title = ?, artist = ?, category = ?, year = ?, duration = ?, credits = ?, video_key = ?, poster_key = ?,
     width = ?, height = ?, featured = ?, published = ?, updated_at = ? WHERE id = ?`
  )
    .bind(slug, v.title, v.artist, v.category, v.year, v.duration, v.credits, v.video_key, v.poster_key, v.width, v.height, v.featured, v.published, new Date().toISOString(), id)
    .run();

  // Replaced files are deleted from storage.
  const stale = [old.video_key !== v.video_key && old.video_key, old.poster_key !== v.poster_key && old.poster_key].filter(Boolean);
  if (stale.length) await env.MEDIA.delete(stale);

  const row = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  return json({ video: adminVideo(row) });
}

async function deleteVideo(env, id) {
  const old = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  if (!old) return json({ error: "Not found" }, 404);
  await env.DB.prepare(`DELETE FROM videos WHERE id = ?`).bind(id).run();
  const keys = [old.video_key, old.poster_key].filter(Boolean);
  if (keys.length) await env.MEDIA.delete(keys);
  return json({ ok: true });
}

function cleanVideo(input) {
  if (!input || typeof input !== "object") return { error: "Bad request" };
  const str = (v, max) => String(v ?? "").trim().slice(0, max);
  const title = str(input.title, 200);
  if (!title) return { error: "Title is required" };
  const category = CATEGORIES.includes(input.category) ? input.category : "other";
  const year = Number.isInteger(Number(input.year)) && Number(input.year) >= 1950 && Number(input.year) <= 2100 ? Number(input.year) : null;
  const duration = Number.isFinite(Number(input.duration)) && Number(input.duration) > 0 ? Math.round(Number(input.duration) * 100) / 100 : null;
  const credits = Array.isArray(input.credits)
    ? input.credits
        .map((c) => ({ role: str(c?.role, 60), name: str(c?.name, 120) }))
        .filter((c) => c.role || c.name)
        .slice(0, 40)
    : [];
  const int = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 20000 ? Number(v) : null);
  const video_key = input.video_key ? (validKey(input.video_key, "videos") ? input.video_key : undefined) : null;
  const poster_key = input.poster_key ? (validKey(input.poster_key, "posters") ? input.poster_key : undefined) : null;
  if (video_key === undefined || poster_key === undefined) return { error: "Bad file reference" };
  const published = input.published ? 1 : 0;
  if (published && !video_key) return { error: "Upload a video before publishing" };
  return {
    title,
    artist: str(input.artist, 200),
    category,
    year,
    duration,
    credits: JSON.stringify(credits),
    video_key,
    poster_key,
    width: int(input.width),
    height: int(input.height),
    featured: input.featured === false ? 0 : 1,
    published,
  };
}

function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "video"
  );
}

async function uniqueSlug(env, text, exceptId = "") {
  const base = slugify(text);
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const hit = await env.DB.prepare(`SELECT id FROM videos WHERE slug = ? AND id != ?`).bind(slug, exceptId).first();
    if (!hit) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/* ---------------------------------------------------------------- auth */

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD is not set on the Worker yet" }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const since = Date.now() - 15 * 60 * 1000;
  await env.DB.prepare(`DELETE FROM login_attempts WHERE at < ?`).bind(since).run();
  const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at >= ?`).bind(ip, since).first();
  if (n >= MAX_LOGIN_ATTEMPTS) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);

  const body = await request.json().catch(() => ({}));
  const ok = await sameSecret(String(body.password || ""), env.ADMIN_PASSWORD);
  if (!ok) {
    await env.DB.prepare(`INSERT INTO login_attempts (ip, at) VALUES (?, ?)`).bind(ip, Date.now()).run();
    return json({ error: "Wrong password" }, 401);
  }
  await env.DB.prepare(`DELETE FROM login_attempts WHERE ip = ?`).bind(ip).run();

  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  const token = `${exp}.${await sign(env, `admin.${exp}`)}`;
  return json({ ok: true }, 200, {
    "set-cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`,
  });
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sameSecret(sig, await sign(env, `admin.${exp}`));
}

async function sign(env, message) {
  // The session key comes from SESSION_SECRET if set, otherwise from the password,
  // so changing the password logs everyone out.
  const secret = env.SESSION_SECRET || `pw:${env.ADMIN_PASSWORD}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/* ---------------------------------------------------------------- media */

async function media(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const key = decodeURIComponent(url.pathname.slice("/media/".length));
  if (!validKey(key)) return new Response("Not found", { status: 404 });

  const rangeHeader = request.headers.get("range");
  let range = null;
  if (rangeHeader) {
    // Seeking in a video asks for byte ranges. Look up the size first so the reply is exact.
    const info = await env.MEDIA.head(key);
    if (info === null) return new Response("Not found", { status: 404 });
    range = parseRange(rangeHeader, info.size);
    if (!range) return new Response("Range not satisfiable", { status: 416, headers: { "content-range": `bytes */${info.size}` } });
  }

  const obj = range ? await env.MEDIA.get(key, { range }) : await env.MEDIA.get(key, { onlyIf: request.headers });
  if (obj === null) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");

  // onlyIf matched (e.g. If-None-Match): R2 returns the object without a body.
  if (!("body" in obj)) return new Response(null, { status: 304, headers });

  const body = request.method === "HEAD" ? null : obj.body;
  if (range) {
    headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${obj.size}`);
    headers.set("content-length", String(range.length));
    return new Response(body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(body, { status: 200, headers });
}

// "bytes=0-99", "bytes=100-" or "bytes=-500" → { offset, length } inside the file, or null.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "") || size === 0) return null;
  let start, end;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || end < start) return null;
  return { offset: start, length: end - start + 1 };
}
