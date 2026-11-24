# Online game catalog

Before or After has 180 daily boards drawn from 104 reviewed events. The 99 primary-source milestones in `scripts/trivia/editorial/milestones.tsv` record the specific event, year, topic, and source. Five additional dates are checked against Wikidata. Each board has five different years, five distinct milestone types, and at least four topics. The scheduler checks the seam between the last day and the first. An event cannot appear twice in fourteen consecutive days. At most one card in seven days can be a bridge opening, book publication, or astronomical discovery.

Common Ground has 30 original four-group boards. Odd One Out has 30 five-round boards, each mixing sound, spelling, phrases, mechanisms, and everyday connections. Both banks are in `scripts/trivia/editorial/`. Word puzzles ship as reviewed releases. Passport continues to use the existing 204 reviewed clues for 68 countries. The games' practice starters and saved plays are independent of these daily packs.

## Weekly fetch and validation

The Monday GitHub job at 09:23 UTC and manual workflow runs execute:

```sh
source scripts/runtime.sh
npm run games:sync
```

The sync reads published Wikidata entity JSON to check the five dates against their reviewed properties. For each Passport clue it requests the English sitelink from the Wikibase REST API and records the item revision. This replaces title searches and full claim downloads for unused landmarks. Primary-source timeline wording and years are editorial inputs. Changes to a selected date or sitelink require review. A failed fetch leaves the installed release available.

The job saves a 30-day artifact. Successful runs contain `release.json`, the checked Wikidata snapshot, and a report with the content hash and counts. On failure, `failure.json` records the last completed item and available request diagnostics, including status, error code and retry delay. To rebuild locally from the committed facts, run `npm run games:sync -- --offline`.

## Installing reviewed releases

Migration 055 installs all three rotations atomically and extends the service-role import RPC with the editorial envelope. Timeline links may point to Wikidata items or exact reviewed primary-source URLs. Passport accepts Wikidata item URLs. Extend the SQL and JavaScript source lists together when adding a primary source. Practice and archived attempts retain their stored questions. A household that already started today's game keeps its pinned version and slot.

For this edition, the migration was authored from the validated release using `node scripts/trivia/editorial/prepare-release.mjs <release.json> <new-migration.sql>`. It refuses to overwrite an existing migration. Review and install through the normal additive database release process. For subsequent editions, use a new migration and update its edition markers.

The weekly workflow installs online timelines and Passport only when the repository variable `GAMES_ONLINE_SYNC` is `true`, with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` supplied. The equivalent manual install is `npm run games:sync:install -- .local/game-sync/release.json`. The installer reads those two credentials from its environment. Identical question payloads are idempotent across revision or fetch-time changes. Existing frozen migrations retain their original format.

## Connections archive research

NYT offers an [official archive](https://thenewyorktimeshelpcenter.helpjuice.com/360011158491-New-York-Times-Games/28525912587924-Connections) for Games/All Access subscribers, starting June 12, 2023. [Connections+ has a dated NYT archive](https://connectionsplus.io/nyt-archive) and a separate [community collection](https://connectionsplus.io/community). [Connectionsgame.org also provides an archive](https://connectionsgame.org/archive/), and [Swellgarfo provides a custom puzzle creator](https://connections.swellgarfo.com/). Their four-by-four group format can be mapped to our existing Common Ground question type.

These are playable archives, not established public bulk-sync interfaces. The inspected pages did not document a supported export API or a reusable puzzle-content license; an open-source solver's software license does not by itself establish reuse rights for its third-party puzzle dataset. No Connections archive has been imported in this change. A Common Ground archive integration should retain the original author, puzzle URL, date and difficulty, validate four disjoint groups of four, and use the same immutable daily-release approach once a suitable feed is established.

## Personal archive and additional games

Games retain ten stable practice starters, except How Much-ish, which has thirty new boards in each of its three categories after its requested history reset. The archive adds elapsed New York days, including missed challenges and completed results, and stores progress by household person. Replaying a past board does not alter its ranked result. For Geography the archived mode is Border Trail. Local guests have the starter collection; named players get shared storage and dated history. These are calendar archives of our own daily boards, separate from third-party puzzle archives.

Sudoku and Crossword currently use a bundled original repository, not an external daily feed. `build-grid-puzzles.py` produces 180 Sudoku dailies plus ten practice boards, checking every Sudoku for one solution. It also constructs 90 five-by-five mini crossword dailies plus ten starters from authored clues in `crossword-clues.txt`; every white cell has both an across and down clue. The finite rotations eventually repeat. `prepare-library-seed.mjs` authors migration 043 once. Do not overwrite installed migrations to refresh a catalog.

No NYT crossword, Sudoku or Connections questions are imported. A playable archive or a third-party mirror does not establish a supported, licensed bulk feed. An additional online provider still needs a reviewed source and an explicit adapter, as with the existing Wikidata integration.

The historical How Much-ish photograph and schematic catalogs are retired. Their installed SQL migrations remain unchanged; do not run their old artwork generators against the current catalog. The existing weekly online job continues to cover Before or After and Passport Puzzle only.

## Crossword archive review (2026-11-12)

The [NYT archive](https://www.nytimes.com/crosswords/archive/mini) is publicly discoverable and advertises subscription access. [xd’s public download](https://xd.saul.pw/data) includes 5,633 NYT puzzles dated 1942–1964. Its [MIT license](https://github.com/century-arcade/xd/blob/master/LICENSE) covers the software, and the inspected archive pages did not establish permission to republish the third-party puzzles. No NYT content was imported. The existing original mini puzzles remain active. This follows the requested constraint to use only content with established reuse rights; public accessibility alone was not treated as permission.

Grid timers and ranking ship in migration 046, with pause/resume in 051. How Much-ish’s current catalog and authorized reset ship in 052 as described below.


## How Much-ish catalog

The v11 rebuild uses a reviewed snapshot of [Magnitudle’s public archive](https://magnitudle.com/archive?filter=all&mode=size_it_up_regular) as its silhouette and measurement source, with new question pairings and the household score model. It contains 110 Classic objects, 55 Pop culture characters/props and 135 geographic outlines. `scripts/size-art/catalog-manifest.json` records each response URL and hash, shape hash, source, rights statement and calibration. Profiles explicitly marked Owned were excluded. AI-generated profiles retain the “no ownership claimed” provenance statement separately from licenses. Natural Earth and geoBoundaries attribution is retained; geoBoundaries outlines use its upstream CC BY 4.0 license. Credits identify adapted silhouettes and retain the source license, including CC BY-SA where applicable.

To reproduce the snapshot, run `node scripts/size-art/import-catalog.mjs`; it caches raw responses in ignored `.local/how-much-rework/catalog/` and refuses changed upstream hashes. Generated files are `src/size-catalog.json` (validation), `src/size-catalog/{category}.json` (lazy runtime chunks), `src/trivia/size-collections.json`, and `scripts/trivia/size-daily-v11.json`. `node scripts/trivia/build-size-v11.mjs` authors migration 052 before its first installation. This import is separate from the weekly Wikidata job. The 180 daily boards each include all three categories; practice has thirty separate five-round boards per category. All 1,350 comparison pairs are distinct and every silhouette is used.

Migration 052 is an explicitly requested, destructive reset of How Much-ish only. It deletes all prior attempts, scores, archive progress, starter packs and daily packs, including today's board. It starts the new archive at installation, rejects stale clients and mismatched saved questions, and leaves other games intact. Its marker prevents configure from rerunning it. Apply it once with `./configure.sh` before deploying this client. Future catalog refreshes require a new migration; never rerun or edit an installed reset.

The November variety refresh uses `python scripts/trivia/refresh-variety.py` followed by `node scripts/trivia/refresh-online-variety.mjs` to prepare migration 054 from the frozen source catalog. These authoring scripts must not be rerun to overwrite a migration after it has shipped; later refreshes need a new migration. The ten new starter boards have distinct Odd One Out questions, Passport destinations, and timeline events. Existing saved boards retain their original questions. Online timelines limit books and launches to one card on every third board; other boards focus on history, institutions, discoveries, and landmarks.

Migrations 053–054 add outline-first Passport, immediate 50-point hint/mistake penalties (scores can be negative), historical leaderboards, and all-time averages. Trivia averages include completed daily challenges; Geography averages use each player's best completed round per played day. Unplayed days are excluded. Apply migrations through `./configure.sh` before publishing the matching frontend.
