# Local loading comparison

Measured October 20, 2026 against an isolated local database with bundled utility seed data and no chores. Chromium, fresh context, 390 × 844 viewport, 4× CPU throttling, 100 ms simulated latency, 750 KB/s download. These are local single-run observations from before the approved character integration, not current production latency guarantees.

| Measurement | Before | After |
|---|---:|---:|
| JavaScript requested during initial utilities view | 137,661 bytes | 28,803 bytes |
| Utilities ready | 1787 ms | 1276 ms |
| First Chores tab ready | 263 ms | 526 ms |
| Full chore dashboard requested at startup | Yes | No |
| Unopened bulletin artwork requested | Yes | No |

Initial JavaScript decreased by 79.1%. First opening Chores now loads its code on demand; the original bundle had already paid that cost at startup. Navigation preloading fetches the selected route's dependencies together without initializing inactive forms. Later visits reuse loaded modules. With a saved identity, a small summary request supplies badge counts; it never blocks the active page.

[Raw baseline](performance-before.json) and [raw result](performance-after.json) include request paths and compressed/uncompressed asset sizes. The table records that earlier build; run the same command below for current startup timings.

Reproduce with the normal build and an isolated server (not the live Supabase configuration):

```bash
source scripts/runtime.sh
npm run build
PORT=4175 UTILITIES_TEST_DB=1 node scripts/serve.mjs
```

In another shell, after the server reports ready:

```bash
source scripts/runtime.sh
node scripts/measure-performance.mjs http://127.0.0.1:4175
```

The measurement command rejects remote hosts. It creates no test records and writes its report to stdout. Native iPhone/Android and real-network timings remain a post-release observation; browser regression tests cover phone-sized layouts, reduced motion, notification links, and cached deployments locally.


## Approved character rendering

Ordinary identity/balance/chore tiles use 128px WebP portraits: 29,316 bytes for all four combined. They do not load the motion renderer or faceplates. The standalone motion export is 19,467 bytes; the app lazily imports the same source through its own hashed chunks only when a bulletin character becomes visible. All four 512px faceplates total 114,160 bytes and are decoded once per author, shared by notes and the editor. These are uncompressed file sizes; the exact app chunk size and network compression vary with the build.

Only visible notes get a canvas. Leaving the viewport, changing sections, closing the editor, or hiding the browser tab destroys their active controllers and cancels pending mounts. While editing, the board pauses behind the dialog. A single shared animation clock caps drawing at 30 fps; static expressions remain available if animation cannot load. Reduced motion renders the chosen temperature once, and the board pause control persists the user's preference locally.

Skin/foreground layers are prepared once per character at the native 512px size and reused. Their two RGBA backing stores use approximately 2 MiB per loaded character (up to 8 MiB for all four), rather than approximately 7.6 MiB per animated note at 1000px. This excludes decoded portraits, visible canvases, and browser overhead. Canvas pixel ratio is capped at 1.7; the steam sprite is also shared.

Browser checks cover the frame-rate cap, no faceplate requests on ordinary tiles, one faceplate request per author across remounts, offscreen/route/tab suspension, reduced motion, pause/resume, failed-image fallbacks, and closing/reopening while artwork is loading. The standalone character checks also exercise all four characters' steam, hearts, temperature reversals, and destruction. No production records were used or changed.
