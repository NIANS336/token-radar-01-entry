# UNISSUED — token launch radar


[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/NIANS336/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/NIANS336/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01  )

A deterministic, offline make.fun token-radar-01 entry. Uses only the sealed `input/snapshot.json`; no installation, API, wallet or network is needed.

## Run

Node 22.18+ (native erasable TypeScript):

```sh
node main.ts
node scripts/validate.ts
```

Open `output/dashboard/index.html` directly from disk. The source dashboard also works after generating its data with `node main.ts --preview`. The program defaults to mounted `/input/snapshot.json` and `/output` in the grader, and repository `input/snapshot.json` and `output/` locally. Override with `--input <file|directory>` and `--output <directory>` or `MAKEFUN_OUTPUT_DIR`.

## Layout

- `main.ts`: input/output orchestration and the kit's `buildDossier` call.
- `lib/model.ts`: candidate selection, comparable construction, compact dashboard data and board validation.
- `dashboard/engine.js`: shared, dependency-free valuation and conditional farm recipes, used by Node and the browser to prevent drift.
- `dashboard/app.js`, `index.html`, `app.css`: offline board, filters, model guide, and addressable protocol details.
- `scripts/validate.ts`: independent contract, arithmetic, parity, screenshot and dossier checks.
- `screenshots/`: actual browser captures; `output/`: generated submission artifacts.
- `NOTES.md`: methodology, assumptions and suggested reading order.

No token recorded is not proof of no token in the world. Model values are hypothetical circulating market capitalizations, not FDV or predicted airdrops. Farm budgets and recipes are conditional assumptions, never confirmed campaigns. See NOTES.md and the in-page method guide.

Rebuilding writes only the selected output directory. `--preview` additionally refreshes `dashboard/data.js` for local development. The vendored dossier builder and starter LICENSE are preserved byte for byte. Local commits only; no publication or competition submission is performed by the entry.

To refresh browser evidence with an installed Chrome: `node main.ts --preview`, `node scripts/capture.ts`, then `node main.ts` and `node scripts/validate.ts`. The capture helper uses only Node standard-library CDP and is never part of the competition runtime. Its offline browser checks cover every protocol detail, plan/value parity, filters, sorting, pagination and a mobile viewport.


---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
