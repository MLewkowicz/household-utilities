# Cleanup audit — November 10, 2026

Scope: simplify app copy/layout, reduce agent onboarding clutter, and improve Games entry/return. Existing geography/score work was retained in the combined release. Household records and accounting rules were preserved; fallback snapshots were refreshed from the live source before publication.

## Findings and changes

| Finding | Evidence | Action |
|---|---|---|
| Onboarding documents contradicted each other and current behavior | README, HANDOFF and ROADMAP totaled about 105 KB. The handoff still listed four routes and migrations through 012; later notes described six destinations and much newer schema. | Replaced the chronological narratives with a 3.9 KB README, a handoff pointer, a pending-only roadmap, and focused architecture/behavior/operations references. Prior narratives remain in Git history. |
| Completed plans looked like outstanding requirements | Refresh briefs still proposed Home as a task feed; the events decision sheet described event placement, polls and point-policy choices that are already implemented. | Moved old briefs/event mockup to `docs/archive/`, explicitly marked historical. Kept working task/reaction previews available. |
| Games was discoverable only from Home, and return meant Home | `sky-portal.ts` previously restricted entry to Home. Game chrome hid the app navigation; the score screen hid the game topbar as well. | Added a direct Games shortcut to every feature, a labeled return to the last household route/subview, and a return link on scores. Stored only known local routes in tab-scoped session storage; navigation works when storage is unavailable. Extended the sky journey to all six scenes, using the house renderer for a faceted cloud ascent and preserving scene/feature return context. |
| Repeated copy displaced the task | Bulletin said “Notes from home.” and repeated the pinned count; task lanes repeated generic descriptions; page introductions added large empty gaps. | Shortened labels, kept note counts beside the heading, removed generic lane subtitles and repeated empty-state instructions, and reduced introductory spacing. Preserved errors, offline notices, meaningful form guidance, animations, filters and actions. |
| Performance tooling described a previous landing page | `measure-performance.mjs` opened the default route and waited for Utilities, although the default is now Home; task readiness was also checked through a hidden status element. | Explicitly measure `#utilities` and wait for loaded status regardless of its visibility. Mark old reports historical and document the correct local house target. |
| Only one of four stylesheets was minified | `scripts/build.mjs` transformed `style.css` but only copied the other three. | Minify all four through the existing esbuild dependency before hashing. Navigation-intent preloading includes the new shortcut. |

## Three interactive alternatives

Run `npm run preview:navigation` and open **http://127.0.0.1:4193**. Switch concepts and desktop/phone widths; open Expenses, enter Games, and return. State is disposable and no backend is contacted.

1. **Two worlds:** persistent Household/Games mode switch. Most predictable, but adds a header control.
2. **A pocket of play:** floating dock. Easy phone reach with the existing header; needs care around bottom controls.
3. **The house key:** one launcher for all sections and Games. Less permanent chrome, with an extra tap to choose a destination.

The selected app direction combines an upward 3D cloud journey from all six house scenes with direct feature shortcuts and contextual return. The comparison gallery is a separate prototype, excluded from the published build. It does not implement a second live game or ledger.

## Remaining work, in priority order

1. **Consolidate CSS by component.** `public/style.css` exceeds 100 KB and repeatedly overrides the same selectors, including obsolete topbar/navigation styles and successive task/header layouts. Remove only selectors proven unused across lazy templates, generated markup, dialogs, themes and phone breakpoints; use visual checks per component. Splitting or deleting it wholesale would risk regressions.
2. **Make feature controllers easier to edit.** `chores-client.ts` and `misc-client.ts` combine long HTML templates, event dispatch, forms and mutations. Extract dialogs/renderers in small steps while retaining shared source/loading and mutation contracts. A framework migration is not required for this cleanup.
3. **Measure current house/atlas costs before changing assets.** Historical October numbers predate both features. Direct feature loading already avoids the house and game. Profile first Games entry, repeated entry, low-memory phones and WebGL loss separately; do not equate total asset-directory size with startup download.
4. **Reduce deployment bookkeeping drift.** `publish.mjs` and GitHub Actions maintain overlapping check lists; the direct-push workflow does not run browser tests. Keep documented release commands aligned. `measure-house.mjs` also labels the largest JS chunk as the scene chunk, which can be inaccurate now that atlas data is bundled separately; identify chunks through build metadata before interpreting that size.

## Keep deliberately

- All SQL migrations, revisions, correction tooling, export histories and fallback snapshots. Completed migrations remain necessary for new installs and upgrades.
- Legacy route identifiers (`miscellaneous`, `chores`) and `home.ts` feed logic: these are active compatibility surfaces, not dead code.
- Existing guest split, points preview, notification, identity/theme and reduced-motion behavior. All still have callers or dedicated tests.
- Existing source artwork and private local data. This audit did not delete user assets or sweep ignored folders.

## Verification

- TypeScript check and production build passed; privacy artifact scan passed.
- All 135 unit/database tests and eight Python tests passed. The cleanup preserves domain calculations.
- All 131 browser scenarios passed across the full run and targeted reruns. Updated legacy copy assertions and synchronized two existing house checks with browser frames after media/scroll changes. Coverage includes all six sky entrances, actual 3D ascent/cancellation, phone gestures, exact return routes after reload, and the combined geography release. The normal runner stalled before test output; validation used the same installed Playwright/Chromium with an ignored JS config and a fresh isolated local database.
- Exercised all three prototypes through Expenses → Games → return; checked desktop and phone layouts and page errors. Screenshots are under ignored `.local/audit-previews/`.
- Current local sample: Utilities ready in 1,701 ms, first To-dos entry in 693 ms, 50,481 bytes of initial JavaScript (390 × 844, 4× CPU, 100 ms latency, 750 KB/s). This is a single current observation, not a before/after speed claim; the raw report is `.local/audit-performance.json`.
- Additional stylesheet minification removes about 1 KB of uncompressed CSS in this checkout. The main improvement here is consistent build processing, not a claimed large speedup.
- Active documentation links and `git diff --check` passed. Live schema capabilities passed the release check, and all six sanitized fallback snapshots were refreshed. Real-device performance profiling remains outstanding.

Browser previews and tests use isolated local databases; no live household test data or notifications were created.
