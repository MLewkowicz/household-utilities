# Performance checks

The [October 20 comparison](archive/performance-2026-10-20.md) is historical. It predates the current house, task lanes and atlas; do not quote its byte counts or timings as current measurements.

## Reproduce locally

```bash
source scripts/runtime.sh
npm run build
PORT=4175 UTILITIES_TEST_DB=1 node scripts/serve.mjs
```

In another shell:

```bash
source scripts/runtime.sh
node scripts/measure-performance.mjs http://127.0.0.1:4175
HOUSE_URL=http://127.0.0.1:4175 npm run measure:house
```

Inspect each measurement script's supported options before changing its target. The general measurement tool only accepts local hosts. Keep new reports in ignored `.local/`, and record viewport, CPU/network settings and build revision when comparing results. Do not turn every measurement run into permanent onboarding documentation.

## Preserve these optimizations

- Direct feature entry avoids house WebGL; dynamic imports isolate the game, atlas and character animation.
- Navigation intent preloads only its target module graph. Initial HTML does not preload every tab.
- Active source reads are deduplicated; mutation invalidation and route versions prevent stale overwrite.
- House/character animation pauses when hidden, offscreen or behind dialogs; reduced motion remains usable.
- Ordinary portraits use small stills. Face layers, reaction thumbnails and detail tiles have bounded caches.
- Atlas close-up terrain loads on demand and disposes unused tiles; graphics failure retains the map quiz.
- Hashed assets prevent cached HTML/CSS/JavaScript mismatches; the push service worker does not cache pages.

Before optimizing, measure the relevant path (direct feature, house entry, first Games entry, return visit). A large repository asset directory is not proof that every page downloads it.
