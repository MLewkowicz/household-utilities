# Household

A household app for To-dos, Expenses, Events, Bulletin, Utilities and an observatory with eight games. Handwritten TypeScript + esbuild, Supabase RPCs, GitHub Pages. No framework or login; choosing a name is attribution, not authentication.

## Start here

```bash
./setup.sh
./dev.sh
```

Open **http://127.0.0.1:4173**. Development uses local PGlite with sanitized initial bills; local changes do not touch Supabase. `./setup.sh` installs locked npm/Python dependencies and a private Node runtime if needed. Source `scripts/runtime.sh` in bash or zsh when Node is not on your PATH.

## Read only what the task needs

| Reference | When to read |
|---|---|
| [Architecture](docs/architecture.md) | Source map, routes, loading, mutation contracts and checks |
| [Behavior](docs/behavior.md) | Task, event, note and accounting rules |
| [Operations](docs/operations.md) | Imports, backups, migrations, notifications and publishing |
| [Atlas](docs/geography-data.md) | Geography controls, data provenance and rendering |
| [Performance](docs/performance.md) | Reproducible measurements and loading boundaries |
| [Cleanup audit](docs/audit.md) | Findings, implemented cleanup and remaining work |
| [Roadmap](ROADMAP.md) | Unimplemented ideas only |

`docs/archive/` contains superseded design material, not current requirements. Git history retains earlier README and handoff narratives. Update the relevant reference when behavior changes; do not append a new session transcript.

## Development checks

```bash
source scripts/runtime.sh
npm run check
npm test
uv run --frozen python -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run test:browser
uv run --frozen python scripts/check_privacy.py
```

Browser tests use a disposable database on port 4174; set `UTILITIES_BROWSER_PORT` to use a separate port for an isolated checkout. In environments that cannot probe a closed local port, start `PORT=4174 UTILITIES_TEST_DB=1 node scripts/serve.mjs` first and run the checks with `UTILITIES_BROWSER_REUSE_SERVER=1`. If needed, install Chromium with `npx playwright install chromium`. `npm run test:house` uses its separate house configuration. Run focused browser specs during iteration, then the required release checks before publishing.

## Navigation and previews

Home is the animated house; scrolling down opens To-dos. The six household shortcuts open features directly. Scroll upward at the top of any of the six house scenes to rise through modeled clouds into the roommate observatory; the Games button and Page Up offer the same entrance. Escape or Cancel returns immediately. Reduced motion skips the journey, and the map fallback remains usable without WebGL. Feature pages also have a direct Games shortcut. The floating home icon remembers the previous household route and whether you left its house scene or feature page, including after a reload in the same tab; fresh game links return to To-dos.

| Command | Local preview |
|---|---|
| `npm run preview:navigation` | Three interactive Games navigation concepts, port 4193 |
| `npm run preview:todos` | Existing task concepts, port 4192 |
| `npm run preview:reactions` | Character expressions, port 4191 |

Concepts use disposable UI state and never connect to Supabase. They are excluded from `dist/`.

## Preserve these boundaries

- Keep utility balances, expense debts, chore credit, bulletin statistics and game scores separate.
- Preserve IDs, money calculations, existing records, deleted records and append-only revisions. Payment forms record money already sent; they do not transfer it.
- Keep expected versions and retry IDs on mutations. Offline household snapshots are read-only. Geography has a separate score outbox.
- Do not use the live household database for test records. Keep PDFs, addresses, account numbers, source artwork, credentials and private backups out of Git and `dist/`.
- Retain hashed assets, lazy feature loading, legacy/deep links, selected identity, themes, keyboard access and reduced-motion behavior.
- Apply additive database upgrades before publishing dependent UI. Check the schema through `scripts/check-release-schema.mjs`; a migration file does not prove it is installed live.

Publish through the existing `./publish.sh` workflow when requested. See [operations](docs/operations.md) before running it: it exports live snapshots, stages an allowlist, commits and pushes `main`.


Compact cards with household-style model artwork open Geography, Odd One Out, Passport Puzzle, Common Ground, Before or After, How Much-ish, Sudoku and Crossword. The telescope follows a clockwise card ring at a fixed elevation that clears its dome. Games open directly into a board, with person selection in Settings, a floating shortcut for unfinished dailies, and crown/Bitmoji standings.

Practice has ten starter boards per game and a personal calendar of past dailies. Finished boards are crossed out; unfinished boards resume. Geography's trail archive uses the same calendar, and its rotating review planet supports both countries and cities, including population figures. How Much-ish has 90 detailed silhouettes across Classic, Pop culture and Geography, a movable/zoomable grid, and an animated size reveal with optional sound and touch haptics. Each category has ten practice boards; the ranked daily mixes all three. Earlier boards remain in its archive. Sudoku has 180 daily boards and Crossword has 90 original mini boards, with persistent timers that pause away from the board and faster solves ranked first among equal scores. Border Trail keeps the globe and adds 60 worldwide routes with nonrepeating guesses, automatic endpoints and equal scoring in either direction. Passport has 204 contextual clues across 68 countries, covering culture, sport and major history. Apply migrations through `051_active_puzzle_clocks.sql` before releasing this client; local preview installs them automatically. [Architecture](docs/architecture.md) documents the controls and storage. [Online syncing](docs/game-sync.md) describes the existing Wikidata refresh and the new puzzle/photograph catalogs.
