# 99 PRODUCTIONS

Website for 99 PRODUCTIONS (99prod.dk). See README.md for setup and how it works.

## Deploy

- Cloudflare Workers + D1 + R2. The user chose Cloudflare for this site; the other 99 sites use GitHub Pages.
- Pushing to `main` deploys straight to the live site through Workers Builds. There is no production/staging branch, on purpose.
- Test locally with `npm run dev` before pushing.

## Code

- `src/worker.js`: routing for 99prod.dk and admin.99prod.dk, public API, admin API (password cookie), R2 media with range requests.
- `public/`: plain HTML/CSS/JS, no build step.
  - `js/common.js`: shared code and `CONFIG` (contact links).
  - Each page has its own script.
- `public/admin/`: admin panel.

## Look

- White on black (`#000`), dark grey `#1f2124` for contact/admin, same tokens as 99MS/99RIM.
- Fonts: Share Tech Mono (HUD), IBM Plex Sans (admin), Anton (big titles).
- Logo: `public/assets/logo.svg` (cropped white 99).
- Inspired by donprod.uk, but don't copy its copy or assets.
