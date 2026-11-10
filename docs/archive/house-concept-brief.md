# Brief B — Standalone interactive house concepts

Build three playable concepts outside production; this track is independent of app improvements. Completion means three working concepts ready for review, not production integration.

## Workspace

Use `/home/mlewkowicz/household-house-concepts`, separate dependencies/lockfile/build and dev server port 4190. Utilities repository is read-only. Copy approved public avatar pack locally; never depend on renderer changes. Fictional sample tasks/expenses/events/notes; no Supabase.

## Concepts and shared art direction

1. Rotating dollhouse: horizontal drag rotates between named views; walls retract to reveal selected interior.
2. Unfolding house: selected room unfolds walls/roof like a miniature stage, refolds on changing destination.
3. Exploded house: rooms/floors separate vertically; selection comes forward and others fade.

Same characters, scenes, art direction, labels in each. Orthographic/isometric sculptural architecture, pastel materials, soft shadows, warm light, playful scale inspired by Monument Valley; original architecture/props. Existing faces on simple animated bodies; no full-body modeling.

## Shared destinations

- Home: welcoming exterior and housemates; combined personal/assigned feed immediately below, with source labels.
- To-dos: sweeping, dishes, carrying trash.
- Utilities: exposed flowing-water pipes, cartoon poop, character toggling lights.
- Events: projector, couch gathering, board game.
- Bulletin: Rohil’s exaggerated pedestal complaint; scrolling reveals sample board.
- Expenses: groceries, receipt/split vignette.

Every concept exposes every destination. Each selected scene has a readable looping action and interactive response (light, projector, complaint, etc.).

## Technical and interaction contracts

Small TypeScript/Vite/Three.js project, orthographic camera, procedural geometry, DOM controls, pinned dependencies and own lockfile. Follow official https://threejs.org/manual/pages/installation.html and https://threejs.org/docs/pages/WebGLRenderer guidance. Share scene assets and data across concepts.

Concept switcher, labeled destination shortcuts, previous/next, reset-view, pause-motion. Shortcuts usable immediately, even mid-transition. Horizontal gestures affect scene, vertical scroll remains available; keyboard equivalents. Selection updates normal HTML content beneath scene.

Shared interface `mount(container, options)` returns `setSection`, `pause`, `resume`, `destroy`; `onNavigate` reports destination changes. Reduced motion: stable poses/immediate changes. WebGL failure: shortcuts/content usable. Only active animation loop; dispose on switching; pause hidden/offscreen. Target 30fps on throttled mobile, pixel ratio ≤1.5, no expensive post-processing.

## Deliverables and validation

Runnable comparison app; README commands/controls/attribution/limitations; phone and desktop screenshots for each concept; short recorded walkthrough; comparison of visual character, navigation clarity, ordinary task speed, motion comfort, measured performance; recommendation and concrete refinements.

Validate 390×844, desktop, 320px overflow, touch/mouse/keyboard, reduced motion, rapid changes, hidden tabs, unavailable WebGL. Production app continues independently; do not import prototype dependencies.
