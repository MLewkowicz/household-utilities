# Online game catalog

The first online integration uses selected Wikidata facts to build our own Before or After and Passport Puzzle challenges. It does not mirror another game's daily answers. Wikidata's structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Data_access); no API key is needed to read it.

The current catalog contains 167 dated events and 204 reviewed country clues across 68 countries. Passport emphasizes recognizable culture, sport, historical figures and major events: Uruguay hosting and winning the first World Cup, LEGO in Denmark, and Parasite in South Korea. Two contextual clues precede the region and capital hints. Bare old-town names no longer generate new questions. It generates 180 different daily timelines and 90 different five-country daily boards, replacing those games' fourteen-day rotations. Facts recur in different combinations: these are 270 boards, not 270 sets of entirely new facts. The timeline bank balances topics and event usage and never places two events from the same year together. Country boards contain five different destinations. Forty online practice timelines supplement the original timeline bank. Passport uses 27 contextual practice questions across nine destinations, combined into ten five-country starter boards; the daily pool covers the other 59 destinations. Daily and practice use separate imported events and destination groups.

Odd One Out, Common Ground and Geography's Border Trail retain their curated daily catalogs. Word-group puzzles need editorial construction; measurements need explicitly defined dimensions and suitable artwork. Neither is automatically generated from generic trivia questions.

## Fetch and inspect

Load the repository runtime, then run:

```sh
source scripts/runtime.sh
npm run games:sync
```

This fetches selected public subjects in batches, validates dates and locations, and writes a candidate to ignored `.local/game-sync/`. It makes no database writes. `report.json` summarizes coverage, board counts and a content hash; `catalog.json` includes source item IDs, revisions and rejected records with reasons. `release.json` is the validated daily payload; the two game JSON files are practice candidates. A six-hour local response cache reduces repeated upstream calls during editing. Expired cache entries are not used as a fallback for failed requests. `npm run games:sync -- --offline` reproduces the committed catalog without network access.

`online/seeds.json` under `scripts/trivia/` selects relevant subjects and assigns explicit date meanings: launch, discovery, inauguration, publication, founding, or the start of an event. The importer fetches facts, rather than extracting Wikipedia prose or copying someone else's questions. It rejects missing/ambiguous date claims, coarse precision, uncertainty qualifiers, unsupported calendars, current/future years, and conflicting country locations. First publication uses the earliest supported publication year, which can include serial publication. Known edition/discovery/founding ambiguities are excluded or checked against a reviewed date. `dateCheckSources` records the independent sources for those checks. The current run rejects 39 subjects or uses them only in another mode.

Source data can still contain mistakes. Adding a subject means reviewing both its relevance and what its date property actually represents; don't remove exclusions simply to increase counts. Labels are authored from the selection manifest so upstream label changes cannot inject arbitrary wording into cards. Country clue wording is authored in `online/passport-facts.tsv`, with resolved Wikidata subjects and revisions recorded in the snapshot. The sync does not invent prose from upstream labels or descriptions. Editors review each subject’s connection to the destination and the meaning of the claim; resolving a Wikidata item alone is not fact verification. Country outlines, capital names and region hints come from our pinned local atlas. The old landmark records remain as provenance but do not generate Passport clues. The sync does not update geography populations, borders, or historical prose.

## Install a daily release

Online imports require migrations 040 and 041 in addition to earlier migrations. The current client also needs 042–048 for archives, grid games, size questions, contextual Passport clues and public release metadata. Local disposable databases apply them automatically. Migration 040 adds variable-length rotations and a service-role-only import RPC; 041 installs the frozen initial catalog. The initial seed authoring script refuses to overwrite 041. Migration 045 installs the reviewed Passport replacement and updates its starters. Its authoring script also refuses to overwrite the migration. Subsequent refreshes append releases through the RPC and do not rewrite SQL history.

```sh
# Supply these through your environment or secret manager; do not commit values.
# SUPABASE_URL: target project URL
# SUPABASE_SECRET_KEY: target project's secret/service-role key
npm run games:sync:install -- .local/game-sync/release.json
```

The installer deliberately does not read `.env.local`. Anonymous browser credentials cannot import content. Import validation and inserts run in one transaction; incomplete payloads leave the previous release intact. Identical content is a no-op even if upstream revision numbers or fetch timestamps have changed. Each new release gets a fresh version. Existing questions and completed answers are never rewritten.

The first player to start a game pins both its slot and version for the whole household that New York calendar day. A midday refresh therefore cannot give roommates different challenges. The following day selects from the newest release's full rotation. Failed refreshes leave the previous catalog available. Playing does not contact Wikidata; daily games still require our database connection and personal practice progress syncs through the archive, with a local fallback.

## Weekly refresh

`.github/workflows/game-catalog.yml` fetches and validates every Monday at 09:23 UTC, and supports manual runs. It saves a 30-day workflow artifact. Installation is off until the repository variable `GAMES_ONLINE_SYNC` is set to `true`, the `SUPABASE_URL` variable is set, and the `SUPABASE_SECRET_KEY` Actions secret is supplied. Apply the migrations before enabling installation. No workflow or live database was activated as part of the local implementation.

The scheduled job has read-only repository permissions and does not commit code or deploy the website. Database imports update daily games without a client release. Practice banks are bundled for offline play; refreshing those requires reviewing the generated practice files and including them in a normal website release (`passport-puzzle.json` and `before-or-after-online.json`). Updating the ten database starters also requires a new additive migration so existing progress remains readable. Normal builds and tests use the committed snapshot and do not depend on a third-party service.

## Verification

`tests/trivia-online.test.ts` covers rate limits and maxlag, rejected dates, deterministic boards, separate daily/practice facts, database permissions, atomic rollback, idempotent imports, rollout-day consistency, old fourteen-slot cohorts, and retained scores. The existing game tests also exercise imported daily scoring and answer hiding. The import RPC only accepts the two supported game types; a future provider or game integration needs an explicit adapter and validation rules.

## Connections archive research

NYT offers an [official archive](https://thenewyorktimeshelpcenter.helpjuice.com/360011158491-New-York-Times-Games/28525912587924-Connections) for Games/All Access subscribers, starting June 12, 2023. [Connections+ has a dated NYT archive](https://connectionsplus.io/nyt-archive) and a separate [community collection](https://connectionsplus.io/community). [Connectionsgame.org also provides an archive](https://connectionsgame.org/archive/), and [Swellgarfo provides a custom puzzle creator](https://connections.swellgarfo.com/). Their four-by-four group format can be mapped to our existing Common Ground question type.

These are playable archives, not established public bulk-sync interfaces. The inspected pages did not document a supported export API or a reusable puzzle-content license; an open-source solver's software license does not by itself establish reuse rights for its third-party puzzle dataset. No Connections archive has been imported in this change. A Common Ground archive integration should retain the original author, puzzle URL, date and difficulty, validate four disjoint groups of four, and use the same immutable daily-release approach once a suitable feed is established.

## Personal archive and additional games

Each game has ten stable practice starters. The archive adds elapsed New York days, including missed challenges and completed results, and stores progress by household person. Replaying a past board does not alter its ranked result. For Geography the archived mode is Border Trail. Local guests have the starter collection; named players get shared storage and dated history. These are calendar archives of our own daily boards, separate from third-party puzzle archives.

Sudoku and Crossword currently use a bundled original repository, not an external daily feed. `build-grid-puzzles.py` produces 180 Sudoku dailies plus ten practice boards, checking every Sudoku for one solution. It also constructs 90 five-by-five mini crossword dailies plus ten starters from authored clues in `crossword-clues.txt`; every white cell has both an across and down clue. The finite rotations eventually repeat. `prepare-library-seed.mjs` authors migration 043 once. Do not overwrite installed migrations to refresh a catalog.

No NYT crossword, Sudoku or Connections questions are imported. A playable archive or a third-party mirror does not establish a supported, licensed bulk feed. An additional online provider still needs a reviewed source and an explicit adapter, as with the existing Wikidata integration.

Historical How Much-ish v7’s 59 reviewed Commons photographs render only as solid alpha silhouettes. Download candidates and exclusions are in `scripts/trivia/photos/`; fetch with `uv run --with pillow python scripts/trivia/photos/fetch.py`. Review any new image for an isolated photographic object and usable axis before adding it to the approved manifest. `build.mjs` creates a balanced immutable size catalog, with 180 daily boards and ten starter boards. Reference sizes are labeled explicitly and are not claimed to be measurements of the pictured specimen. Photo authors, source pages and licenses appear in answer credits. This import is reviewed, not an unattended weekly art sync. The existing weekly online job continues to cover Before or After and Passport Puzzle only.

## Crossword archive review (2026-11-12)

The [NYT archive](https://www.nytimes.com/crosswords/archive/mini) is publicly discoverable and advertises subscription access. [xd’s public download](https://xd.saul.pw/data) includes 5,633 NYT puzzles dated 1942–1964. Its [MIT license](https://github.com/century-arcade/xd/blob/master/LICENSE) covers the software, and the inspected archive pages did not establish permission to republish the third-party puzzles. No NYT content was imported. The existing original mini puzzles remain active. This follows the requested constraint to use only content with established reuse rights; public accessibility alone was not treated as permission.

Grid timers and ranking ship in migration 046. Size content v9 ships in 047; new comparisons combine familiar objects with planets and fictional vehicles, using cited measurements and original or already licensed profiles. Saved starter questions and previous daily packs are preserved.
