# Change: pwa-install

## Why
Phase 5 "PWA and desktop" (re-planned 2026-11-20), PWA half. The app must be installable on an iPhone, Android and desktop Chrome, look like RWX (the real icon, not the placeholder), keep its shell and cover images across launches, and tell the user how to install it. There is deliberately no offline data: sync is Phase 10. A service worker in this phase exists for the shell and covers, and is the file Phase 9 (Web Push) adds its handlers to.

The desktop Media table (`docs/design/desktop.md`; one sidebar "Media" section, table view, shared table family) is a separate change driven by `docs/design/desktop.md`. It is not designed or specified here; the seam is named in `design.md` section 11.

## What changes
- Web app manifest and the real app icons generated reproducibly from the iOS artwork by a square crop inside the rounded tile (full-bleed 180/192/512, a maskable 512, favicon; `icon-192.png` doubles as the sign-in page logo); `icon.svg` removed.
- The `Cover` component (`docs/design/desktop.md` section 6) with the iOS `draft_book` / `draft_movie` artwork as placeholder (four `2x` PNGs, light and dark by `<picture>`) for every item without a cover or poster, replacing the generic icons.
- A minimal Workbox service worker (`vite-plugin-pwa`, `injectManifest`): precaches the built shell, runtime-caches covers and posters from `covers.openlibrary.org` and `image.tmdb.org`; never `/api`, `/actuator`, `/oauth2`; no data cache.
- Update flow: a waiting new worker shows a "New version available - Reload" toast; the app also asks the browser to check for a new worker whenever it comes to the foreground (iOS standalone apps are resumed, not navigated).
- Backend: a `Content-Security-Policy` header limited to `img-src` plus three zero-risk directives; tests pinning how the jar serves `sw.js`, the manifest and the icons (unauthenticated, revalidated, never the SPA fallback).
- Install: the capture/detection logic (`useInstall()`, `detectInstallMode`); the UI (Settings "App" row, three-step walkthrough Sheet, sign-in link) is specified in `docs/design/desktop.md` sections 10-11 and hidden when installed.
- Housekeeping: `MediaError` becomes `ApiError` (and moves to `frontend/src/api/errors.ts`).

## Impact
Capabilities: `platform` (manifest, service worker, update, serving, CSP), `settings` (install section), `media` (cover placeholder). New frontend dev dependencies (approved by the owner 2026-11-20): `vite-plugin-pwa`, `workbox-build` (peer), `workbox-window` (peer), plus the `workbox-*` runtime modules imported by `sw.ts`. No new backend dependency, no migration, no OpenAPI change, no new configuration. Icons are generated with ImageMagick by a committed script; generated PNGs are committed (the build does not need ImageMagick).

## Non-goals
Desktop Media table and the shared table family (own change); the sign-in page itself (redesigned by owner request, `docs/design/desktop.md` section 10; own change, this one supplies the icon assets and `useInstall()`); any offline data, Dexie, outbox, `/sync/*`, offline banners, Background Sync (Phase 10); Web Push, VAPID, subscriptions, the Notifications switch (Phase 9); a full CSP (`script-src`, `style-src`, `connect-src`: Security phase 8); Android manifest `shortcuts`, share target, screenshots for the rich install UI; iOS dark/tinted icon variants (not supported for web apps, see design section 4); a minimum-client-version handshake between a stale shell and a newer API (Phase 10 needs it; noted in design section 7).

## Correction to earlier notes
`AppIcon 1.png` is RGB with no alpha: the "transparent corners" are a black matte (pixel (0,0) is black) around a rounded tile inset about 6% from each edge. Owner decision 2026-11-20 (final, after trying both): crop a square inside the rounded tile (780 px at offset 122) and scale it; filling the matte by extending the tile's pixels was built first and rejected on looks.

## Phone-only check
The checks that need a real iPhone after the first deploy are listed in `design.md` section 10; they do not block merging this change.
