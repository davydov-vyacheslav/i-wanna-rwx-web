# Design: pwa-install

UI is specified in `docs/design/desktop.md` (sections 6, 10, 11), not here. Reads: `docs/ROADMAP.md` (Phase 5, 6, 10), `docs/REVIEW_LESSONS.md` (rules 1, 5, 8, 9: platform first, no single-use classes, no speculative knobs), `docs/TODO.md` Phase 5, `platform` and `settings` specs, `StaticResourcesConfig`, `SecurityConfig`. No ROADMAP decision is re-litigated.

## 1. Scope in one picture
Online-first stays. The service worker (SW) is a delivery optimisation (shell, images) and a future home for push handlers, never a data path. Offline without network: the shell loads from the SW precache and the existing "Can't reach the server" state appears when `/api` calls fail. No route in the SW touches `/api`, `/actuator` or `/oauth2`, so there is nothing to make stale or to leak across users, and sign-out needs no cache clearing.

## 2. Tooling: vite-plugin-pwa (injectManifest) - owner decision 2026-11-20: approved, with the Workbox packages as devDependencies
Options:
| Option | Moving parts | Verdict |
|---|---|---|
| `vite-plugin-pwa` `strategies: 'injectManifest'`, own `src/sw.ts` | plugin (2.0, peer vite 8 ok) + `workbox-build` + `workbox-window` (peers) | chosen |
| `vite-plugin-pwa` `generateSW` | same | rejected: the generated worker cannot hold our `push`/`notificationclick` handlers without `importScripts` of a second file (that is two workers' worth of build config in Phase 9) |
| `workbox-build` `injectManifest` in a post-build script | one dep, but we write the glue: bundle `sw.ts` (a second Vite/esbuild build, TypeScript, imports), run inject after `vite build`, dev story, registration helper | rejected: the glue is what the plugin is |
| Hand-written SW, no Workbox | zero deps | rejected: ROADMAP says Workbox, expiry and opaque handling are exactly what Workbox is for |

Why the plugin is the least moving parts: it bundles `sw.ts` with the same Vite config, injects `self.__WB_MANIFEST` from the build output, and nothing else is ours. Settings:
- `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'` (output `sw.js` at the root, scope `/`), `registerType: 'prompt'`, `injectRegister: false` (we register from `src/pwa/register.ts` with `workbox-window`, so the update toast is ours), `manifest: false` (the manifest is the hand-written `public/manifest.webmanifest`, linked from `index.html`; the plugin's generated manifest would duplicate it and the icon list), `devOptions.enabled: false` (no SW in `vite dev`, a stale dev cache is the classic trap; test with `vite build && vite preview` or compose).
- `injectManifest.globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}']` minus nothing: the precache is the shell (index.html, hashed assets, icons, placeholder images). `maximumFileSizeToCacheInBytes` default (2 MiB) is fine; a build over it fails loudly, which is the intended guard.
Runtime modules used in `sw.ts`: `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` (versions pinned like the rest of `package.json`, exact, as the repo does).

## 3. Manifest (`frontend/public/manifest.webmanifest`)
Hand-written JSON, not localized (the install dialog uses one string; iOS ignores most fields and reads `<meta>`/`<link>`):
- `id: "/"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `name` and `short_name` `RWX`, `description` English one-liner, `lang` omitted, `orientation` omitted (users rotate iPads and desktop windows).
- `theme_color` and `background_color`: the light `--color-bg` value from `frontend/src/theme.css` (the implementer copies the actual hex; a test asserts it equals the token). `index.html` also gets `<meta name="theme-color">` twice with `media="(prefers-color-scheme: ...)"` (light and dark token) because the manifest holds one colour.
- `icons`: `icon-192.png` (192, any), `icon-512.png` (512, any), `icon-maskable-512.png` (512, `purpose: "maskable"`). Separate files; never `"any maskable"` on one file (the safe-zone padding that fixes maskable looks wrong when unmasked).
- `index.html`: add `<link rel="manifest" href="/manifest.webmanifest">`, replace the `icon.svg` link by `<link rel="icon" href="/favicon.png" type="image/png">`, keep `apple-touch-icon` (180). Not added: `apple-mobile-web-app-capable` (iOS 16.4+ honours the manifest `display`), `apple-mobile-web-app-status-bar-style` `black-translucent` (it changes the safe-area behaviour the design system tuned; revisit only if the iPhone check shows a wrong status bar).
- No `shortcuts`, `screenshots`, `share_target` (speculative, rule 8).

## 4. Icons from the iOS artwork
Facts (measured): `AppIcon 1.png` is 1024x1024, RGB, no alpha; outside the rounded tile (edges at about x/y = 62 and 962, corner radius about 200 px) it is a black matte. Owner decision 2026-11-20 (final): the full-bleed squares are a square crop of the artwork that lies inside the tile's rounded corners (780 px at offset 122, `make-icons.sh`); the maskable is the same crop with no padding (a first version at 72% on a flat dark canvas looked padded and was rejected; Android's mask only cuts the corners, the subject sits inside the 80% safe circle). A first version that extended the tile's edge pixels over the matte was rejected on looks. Section 4's fill method below is superseded.

Method (in the script, deterministic, ImageMagick only, no randomness, `-strip`): (1) build the rounded-rectangle mask of the tile slightly inset (about 3 px) so the anti-aliased black fringe is dropped; (2) make everything outside it transparent; (3) fill the transparent area from the nearest tile pixels: repeated dilation of the opaque colours (`-morphology Dilate` with a small disk, premultiplied, until no transparent pixel remains), then a light blur applied only to the filled region so the extension reads as soft stone shading rather than streaks; (4) flatten to opaque. The filled strip is about 62 px per side, 6% of the canvas, plus the four corner wedges; the visible artwork is unchanged. The implementer tunes inset, disk size and blur by eye. Alternative if the dilation looks streaky at the corners: `-virtual-pixel Edge -distort` of the cropped tile bbox, same outcome class.

Reproducible generation: `frontend/scripts/make-icons.sh <path to AppIcon 1.png>`, run by hand when the artwork changes; the PNG outputs are committed to `frontend/public/` (CI and the Docker build do not need ImageMagick). The 1024 source is not committed (the iOS repo stays the source of truth); the script header records the parameters. Rejected: `vite-pwa/assets-generator` (extra dependency, cannot repaint a matte), generating at build time (ImageMagick in the Docker image for no gain).

Outputs (all derived from the one filled 1024 square):
| File | Size | Content |
|---|---|---|
| `apple-touch-icon.png` | 180 | filled square, opaque (iOS paints transparency black) |
| `icon-192.png`, `icon-512.png` | 192, 512 | filled square, opaque; `icon-192.png` is also the sign-in logo (shown at about 160-192 px by `docs/design/desktop.md` section 10; the page rounds it with CSS, the file stays square), `icon-512.png` stays available for a larger or 2x-3x use |
| `icon-maskable-512.png` | 512 | the same square crop as `icon-512`, no padding (owner decision): Android's mask cuts only the corners and the subject sits inside the central 80% circle |
| `favicon.png` | 48 | filled square |
Dark/tinted: iOS home-screen web apps take exactly one `apple-touch-icon`; the `appearance` variants of an Xcode asset catalog have no web equivalent as of iOS 18/26, so none is shipped (the iOS set itself ships one file for all three). The artwork is already dark. If the iPhone check shows an ugly auto-tint, a monochrome variant is a later decision.
Approval: F1 produces a contact sheet (each file on light and dark backgrounds, the maskable under circle and squircle masks, `icon-192` at 160 px with CSS rounding as on the sign-in page) for the owner before commit; the extended border must look natural at the corners.
Old `icon.svg` and the three placeholder PNGs are replaced/deleted (rule 9).

## 5. Cover and its placeholder
The UI is `docs/design/desktop.md` section 6: one component `Cover({ src, kind, width, height })` owns the `<img>`, the error fallback and the placeholder; `CoverLink` (cards, detail) wraps it; the table, add results and detail dialog use it too. This change implements `Cover` and the placeholders (the PWA half of the roadmap item); the desktop Media change only consumes it and must not re-implement it.
Assets: only the four `2x` PNGs (160 x 216), copied from `.../Assets.xcassets/Images/draft_book.imageset/book-{w,d}2x.png` and `draft_movie.imageset/movie-{w,d}2x.png` into `frontend/src/assets/covers/` as `book-light.png`, `book-dark.png`, `movie-light.png`, `movie-dark.png`. Light or dark is chosen by one `<picture><source media="(prefers-color-scheme: dark)" srcset=...>` (the theme follows `prefers-color-scheme`; the `data-theme` override is prototype-only). Books use the book image; movies and series use the movie image. Vite hashes them into `assets/` and the plugin precaches them, so placeholders work offline. Applies to every item without a cover or whose image fails, not only drafts. `Cover` replaces the generic placeholder icons in the cover slot; the type icon beside the title stays.

## 6. Service worker (`frontend/src/sw.ts`)
```
precacheAndRoute(self.__WB_MANIFEST); cleanupOutdatedCaches()
navigation:  NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: NAVIGATION_DENYLIST })
covers:      registerRoute(isCover, CacheFirst('covers-v1', CacheableResponse [0,200], Expiration maxEntries 150, maxAge 30 d, purgeOnQuotaError))
message:     SKIP_WAITING -> self.skipWaiting()
// Phase 9 adds `push` and `notificationclick` below this line; Phase 10 adds data routes.
```
Constants shared with tests live in `src/pwa/routes.ts` (`COVER_HOSTS`, `NAVIGATION_DENYLIST`, `isCover`); used by `sw.ts` and its test, so not single-use.
- Navigation denylist: `^/api/`, `^/actuator`, `^/oauth2/`. The `/oauth2/authorization/github` link is a full-page navigation that the server redirects to GitHub; if the SW answered it with `index.html` sign-in would silently break. `/api/v1/auth/github/callback` is under `/api`. `/login` is an SPA route and is served the shell.
- No `clientsClaim`, no automatic `skipWaiting` (update flow, section 7). First install: the page is not controlled until the next load; nothing depends on it.
- Covers: images are `<img referrerpolicy=no-referrer>` without `crossorigin`, so requests are no-cors and responses are opaque (status 0). Open Library sends `access-control-allow-origin: *` but TMDb's image CDN does not, so both are cached opaque: `CacheableResponse` statuses `[0, 200]`. Trade-offs: (a) an opaque error response cannot be told from a success and can be cached for up to 30 days (the `<img onError>` placeholder still shows; accepted, cap by max age); (b) Chrome pads each opaque entry in its quota accounting (roughly 7 MB each), so `maxEntries` is kept at 150 and `purgeOnQuotaError` is on (Safari does not pad); (c) CacheFirst, because a cover URL's bytes do not change. Entries expire by LRU and age; `covers-v1` is versioned so a policy change can drop it.
- Redirects: `covers.openlibrary.org` may 302 to `*.archive.org`; the SW fetches with default `redirect: follow`, the cache key stays the original URL. The CSP must allow the redirect target (section 8).
- Not cached on purpose: avatars (`avatars.githubusercontent.com`; a stale avatar is worse than a re-fetch and the browser HTTP cache already holds it), `/api`, fonts (none), anything else cross-origin. Unmatched requests have no handler and go straight to the network.
- Scope `/`, served from `/sw.js`; no `Service-Worker-Allowed` header needed.
- Push seam (Phase 9): the same `sw.ts` and registration; Phase 9 adds listeners and, in `register.ts`, `registration.pushManager` usage from the Settings switch. `notificationclick` will open/focus a client inside scope `/`. Nothing here must change for that: the file layout above keeps the marked insertion point.

## 7. Update flow
Mechanics: deploy replaces the jar, `sw.js` content changes (new `__WB_MANIFEST` revisions), the browser sees a byte-different script on its next update check, installs it (precaches the new shell in a new cache) and leaves it `waiting` while the old worker still controls open pages.
When the check happens:
- Browsers check on navigation to an in-scope page and about every 24 h at most. An iOS standalone PWA is suspended and resumed, rarely navigated, so on iOS this can mean days. Therefore `register.ts` calls `registration.update()` on `visibilitychange` to visible and on `online`, throttled to once per 30 min (a plain timestamp in memory, not a timer).
- Owner decision 2026-11-20: prompt toast with a Reload button. Waiting worker detected (`workbox-window` `waiting` event): show the existing `Toast` (`tone: 'info'`, action "Reload", longer `durationMs`, 15 s) "A new version is available". Reload posts `SKIP_WAITING`, and on `controlling` the page reloads once. Dismissing or ignoring it is safe: the waiting worker takes over on the next cold launch (all clients closed; on iOS swiping the app away, on desktop closing the last tab).
- Why prompt, not silent auto-reload: a reload discards an open add/edit sheet with typed text. Why not `skipWaiting` + `clientsClaim` without reload: the live page would run old JS against a new precache. Phase 10 (outbox) keeps the prompt unchanged.
- First visit and first install: no controller, no toast.
Known gap (documented, not solved here): a stale shell talking to a newer API for up to a few days. API changes in this project are additive within a deploy window and the shell is replaced at the next launch; a `minClientVersion` handshake is a Phase 10 need (sync is where old clients are dangerous) and is noted in `offline-sync`.
CI version stamping (Phase 6) is not needed: the byte difference of `sw.js` is the trigger.

## 8. Serving from the jar and the CSP
Existing behaviour that already works: `/**` handler with `CacheControl.noCache()` (revalidated by ETag), hashed `/assets/**` immutable one year, SPA fallback refusing `api`/`actuator`, `GET /**` permitAll. Consequences for this change:
- `sw.js`, `manifest.webmanifest` and icons sit in `static/` root: `no-cache` is exactly what a service worker script needs (browsers also bypass the HTTP cache for the SW script by default). Add nothing to `StaticResourcesConfig` unless a test below fails.
- Required checks (tests, task B1): unauthenticated 200 for `/sw.js`, `/manifest.webmanifest`, `/icon-512.png` (manifest and icons are fetched without credentials); `Cache-Control: no-cache` on them; manifest `Content-Type` is `application/manifest+json` (if Spring's `MediaTypeFactory` answers `application/octet-stream`, register the mapping on the resource handler; only then add code); `/sw.js` is the script, not `index.html`; `/api/v1/nope` stays a 404 problem; `/oauth2/authorization/github` is not answered by the fallback.
- Fallback swallowing: a missing `/sw.js` (broken build) would answer `index.html` as `text/html`, which browsers reject as a worker script (registration fails visibly). No extension rule is added (rule 8).
- CSP: none exists today. Add via `SecurityConfig` `headers().contentSecurityPolicy(...)`, one constant, applied to every response:
  `img-src 'self' data: https://covers.openlibrary.org https://archive.org https://*.archive.org https://image.tmdb.org https://avatars.githubusercontent.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
  Why this narrow: `img-src` is what covers need (and the TODO asks); `object-src`, `base-uri`, `frame-ancestors` cannot break a React SPA. A full `script-src`/`style-src`/`connect-src` policy would have to cover Tailwind/React inline `style` attributes and the Vite output and belongs to the Security phase 8 (it will extend this same constant). Notes: CSP `img-src` is also checked against redirect targets, hence `*.archive.org`; `avatars.githubusercontent.com` is needed by the Settings avatar (GitHub avatar URLs are `https://avatars.githubusercontent.com/...`; verify the host stored in `/me` and adjust); `data:` for Vite-inlined small assets. The implementer verifies the real cover redirect hosts with `curl -sIL` on three Open Library ids and a TMDb poster and records the final list in the task report.
  `frame-ancestors 'none'` already has the `X-Frame-Options: DENY` default of Spring Security as a twin; keep both (older browsers).

## 9. Install flow
UI and wording are specified once, in `docs/design/desktop.md` section 11 (and section 10 for the sign-in link): the Settings "App" row (a one-row group between Language and timezone and Account data), the three-step `Sheet` walkthrough "Add RWX to your Home Screen" (iOS/iPadOS), the direct `prompt()` row where `beforeinstallprompt` was captured, and the same text button on the sign-in page. This change does not define a second UI. Owner decision 2026-11-20: hidden when installed.
What this change owns is the logic, in `src/pwa/install.ts` (module-level `beforeinstallprompt` and `appinstalled` capture started in `main.tsx`, exposed through `useSyncExternalStore` as the `useInstall()` of desktop.md task 7; `beforeinstallprompt` can fire before the UI mounts, so a component-level listener would miss it) and a pure `detectInstallMode({ matchMedia, navigator, hasPromptEvent })` returning:
| Result | Condition | UI (desktop.md) |
|---|---|---|
| `installed` | `matchMedia('(display-mode: standalone)').matches` or `navigator.standalone === true` | nothing |
| `prompt` | a `beforeinstallprompt` event is held and not yet used | "Install app" row, tap calls `prompt()` once, then the event is dropped (hidden also after a dismissal and on `appinstalled`) |
| `ios-steps` | UA `iPhone|iPad|iPod`, or `MacIntel` with `maxTouchPoints > 1` (iPadOS desktop mode), not standalone | "Add to Home Screen" row opens the walkthrough |
| `none` | anything else | nothing |
Tests (Vitest + Testing Library; no Playwright in the tree): a `detectInstallMode` table over UA strings (iPhone Safari, iPad desktop-mode UA, Android Chrome, desktop Chrome, Firefox) and standalone by `matchMedia` and `navigator.standalone`; a synthetic `beforeinstallprompt` (with `prompt()` mock) dispatched before and after mount; one `prompt()` call; `appinstalled` hides; rendering of the row and the sheet is covered where the UI is built.
Sign-in page: the page is redesigned at the owner's request (inert sidebar, "sign in is required" panel, large app icon). That page is its own change/task (desktop.md section 10 and task 6). This change only supplies the assets (`icon-192.png`, `icon-512.png`) and the `useInstall()` hook it needs for the install link.

## 10. Check on a real iPhone after the first deploy (owner; not blocking)
1. Add to Home Screen from Safari: the icon is the full-bleed artwork, no black corners, label "RWX"; launch is standalone, no Safari chrome.
2. Sign-in inside the standalone app: tap sign in, GitHub OAuth opens, returns, the user is signed in in the PWA. Highest risk: iOS standalone hands cross-origin navigation to an in-app browser, whose cookie jar may differ from the app's, so the OAuth state/session cookie may not arrive. Record the exact failure; options if it fails are a separate change (do not guess now).
3. Session persists after killing and relaunching the app; after a day.
4. Dark mode: dark placeholder and the dark `theme-color`; safe-area gutters (status bar, home indicator) in standalone; ru and uk.
5. Airplane mode, launch: the shell appears from the SW precache (no iOS "Safari cannot open the page") and shows "Can't reach the server"; covers seen before still show, never-seen ones show the placeholder.
6. Update: deploy a second build, resume the app: toast appears within one resume (or after the 30-minute throttle), Reload applies it; ignoring it, a cold launch has the new version.
7. Settings in standalone: the App row is absent; in Safari (not installed) the "Add to Home Screen" row opens the steps.
8. Add to Home Screen from Chrome/Edge iOS (16.4+) shows the same steps working.
9. Covers: Open Library and TMDb images load under the CSP (no blocked images in the Web Inspector console), after a second launch they come from cache.
10. Storage eviction: after a week unused the app still launches (shell re-downloaded).
Copy this list to `docs/dev-notes.md` (task F8).

## 11. Seam with the desktop and sign-in work (`docs/design/desktop.md`)
Owned here: `Cover` and the four placeholder PNGs, the icons, `useInstall()`/`detectInstallMode`, the service worker with `COVER_HOSTS` and the CSP constant, the update toast. Owned by the desktop Media change: sidebar groups, the shared table, top bar, hover poster, the Settings "App" row and walkthrough `Sheet` UI if it lands first (it consumes `useInstall()`), the sign-in page (needs `icon-192.png`). The hover poster and table thumbnails request the same cover URLs, so they are served from the cover cache with no change. A new image host must extend `COVER_HOSTS` and the CSP constant, both single definitions. The two changes may land in either order; the Settings "App" row and sheet are built by whichever task reaches them first (tasks F5 here, task 7 in desktop.md are the same work: do it once).

## 12. Housekeeping: `MediaError` to `ApiError`
Pure rename, no behaviour change, first task so later ones use the final name: `MediaError`, `MediaErrorKind`, `isMediaError` become `ApiError`, `ApiErrorKind`, `isApiError`, `this.name = 'ApiError'`; the file `frontend/src/features/media/errors.ts` moves to `frontend/src/api/errors.ts` (it is used by settings, reminders and datasource calls, not only media; 11 files import it). Comments saying "MediaError" are updated. Done when `grep -rn "MediaError" frontend/src` is empty, `tsc`, lint and all tests pass.

## 13. Risks and trade-offs
- Opaque caching (section 6): poisoned 30-day entries and Chrome quota padding; small cap, expiry and the `onError` placeholder contain it.
- The crop drops about 12% of the artwork per side (the clapperboard and the key are trimmed at the edges); the owner approves the result before commit.
- A new dev dependency family (`vite-plugin-pwa`, Workbox): approved by the owner 2026-11-20.
- iOS OAuth in standalone (section 10, item 2) can invalidate the install story for iPhone; it cannot be tested before deploy.
