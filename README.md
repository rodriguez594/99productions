# 99 PRODUCTIONS

Website for 99 PRODUCTIONS, the video production part of 99.

| Address | What |
|---|---|
| https://99prod.dk | The site: homepage reel, video pages, archive, contact |
| https://admin.99prod.dk | Admin: upload videos, edit details, order, publish/hide |

The look follows the 99 family (white on black, Share Tech Mono + IBM Plex Sans). The layout is inspired by DON PROD: a vertical video reel with viewfinder corners, tick-mark gauges and huge condensed titles.

## How it runs (all Cloudflare)

- **Worker `99productions`** (`src/worker.js`) serves everything for both domains.
- **Static files** in `public/` are plain HTML/CSS/JS with no build step.
- **D1** (database `99productions`) holds the video list and the 🔥 / 👎 votes from the contact page (one per visitor, stored as a hash of their IP). The tables are created automatically on the first request.
- **R2** (bucket `99productions-media`) holds the video and poster files. Videos stream with byte ranges, so seeking works. Uploads go in 32 MB parts, so any file size works.
- Every push to `main` deploys to the live site, through Cloudflare Workers Builds (`npx wrangler deploy`). There's no separate production/staging branch.
- **D1 and R2 have no IDs in `wrangler.jsonc` on purpose.** Wrangler creates them on the first deploy and keeps them linked.

## One-time setup in Cloudflare

1. **Turn on R2:** Dashboard → R2 Object Storage → activate / purchase R2.
   - The free plan includes 10 GB storage, and egress is free.
   - Cloudflare asks for a payment method, but only charges above the free tier.
   - The deploy fails until R2 is on.
2. **Connect the repo:** Workers & Pages → your Worker → Settings → Builds → Connect → `rodriguez594/99productions`, branch `main`.
   - Build command: *(empty)*
   - Deploy command: `npx wrangler deploy`
3. **Admin password:** Worker → Settings → Variables and Secrets → Add → type **Secret**, name `ADMIN_PASSWORD`, then a long password.
   - Optional: add `SESSION_SECRET` (any long random text). Without it, changing the password logs everyone out, which is usually what you want.
4. **Domains:** `wrangler.jsonc` attaches `99prod.dk`, `www.99prod.dk` (redirects to `99prod.dk`) and `admin.99prod.dk` as Custom Domains, and Cloudflare creates the DNS records.
   - If a deploy fails with "existing DNS record", delete the old `A`/`AAAA`/`CNAME` records for those names under DNS → Records.
   - Leave `MX`/`TXT` email records alone.

## Posting a video

1. Go to https://admin.99prod.dk and log in.
2. Click **+ New video**, then drop the file in. It uploads straight away; the bar shows progress.
3. A poster (cover image) is taken from 10% into the video. To change it, pause the preview on a better frame and click **Use current frame**, or upload an image.
4. Fill in title, artist, category, year and credits.
5. Tick **Published** to put it on the site, then **Save**. Untick it to hide the video again; nothing is deleted.
6. Drag rows (or use ↑ ↓) to change the order. The top video is first on the homepage.
7. **On reel / Archive only** chooses whether a video appears in the homepage reel or only in the archive.

**Export tip:** MP4, H.264, 1080p, "web optimized / fast start" on. About 8–12 Mbit/s looks good and streams fast. HEVC/ProRes files won't play in every browser.

## Contact details

The email and social links are at the top of `public/js/common.js` (`CONFIG`). An empty value hides that link.

## Placeholder clips

Until the first real video is published, the site shows six placeholder clips from `public/placeholder/`. They disappear by themselves as soon as one real video is published in the admin.

## Easter eggs

Hidden on purpose; the only hint is a message in the browser console.

| Egg | How to find it |
|---|---|
| **99 ARCADE** (Snake 99, Brick 99, Reel Run) | Click the big 99 on the homepage nine times fast · type the Konami code (↑↑↓↓←→←→BA) · type `arcade` · on the archive, click "All" nine times to reveal track [99] · on the 404 page, press 9 |
| 99 Luftballons | Type `luftballons` |
| Agent 99 | Type `agent` |
| Gretzky, No. 99 | Type `gretzky` |
| VHS tape (9.9 seconds) | Click the colour dot (bottom left) nine times fast |
| 99 Problems | On the contact page, click the clock three times |

High scores are kept in the visitor's own browser. Code: `public/js/eggs.js` and `public/js/arcade.js`.

## Run locally

```sh
npm install
echo "ADMIN_PASSWORD=localtest" > .dev.vars
npm run dev
```

Then open:
- http://localhost:8787 for the site
- http://localhost:8787/admin/ for the admin

Local data lives in `.wrangler/`.
