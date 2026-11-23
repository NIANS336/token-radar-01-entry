# UNISSUED / reading notes

Start with `output/dashboard/index.html`. It opens directly from disk, without a server. The board has 174 ranked protocols: all 40 watchlist members and 134 extended candidates below the $50M floor. Click Steakhouse Financial to inspect a complete derivation and its six-step Base plan. Then try Lending + Ethereum + Below $50M to see four smaller candidates. Every protocol has a deep-linkable detail page, a sensitivity range, comparable ledger, category-specific plan and adjustable farm economics.

## Evidence boundary

The only data source is `input/snapshot.json`, dated 2026-11-14: 758 protocol records, of which 342 have all three token fields null. A blank token record does **not** establish that no token exists. We never assert a campaign, reward entitlement, launch date, supported deposit asset, contract address or live fee quote. `listed_at` is the beginning of DefiLlama tracking, not protocol inception or proof of time without a token. Every value is a hypothetical **circulating market-cap proxy** conditional on an independent issuer launching with comparable economics; it is not FDV or a launch forecast. The same limitations apply to required watchlist names, including products that might share a parent token.

## Candidate selection and recorded tokens

`lib/model.ts:buildRadar` preserves the full watchlist. Extension requires null CoinGecko ID, symbol and market cap, and TVL below $50M. Exclude Bridge, Cross Chain Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX, Stablecoin Wrapper, Anchor BTC and Staking Pool. Also exclude terminal version markers, whole words wrapped/staked/staking, exchange name prefixes, and names prefixed by a token-recorded protocol's complete name (minimum four characters). The source lacks parent IDs, so this is a conservative name screen, not an identity oracle. Unknown parent relationships remain a prominent limitation. No ranked record has a token ID, ticker or market cap in the input.

416 token-recorded/inconsistent-token-field records are kept outside the ranking. Those records with a token ID or ticker and a positive market cap supply potential comparables. Apply the category exclusion list and wrapped/staked/staking name screen, then deduplicate category + CoinGecko ID (uppercase ticker fallback), keeping the largest TVL record, slug breaking ties. This yields 87 comparables. Deduplication is within category: a token reused across categories can still appear more than once. No hand-selected protocol valuation or curated multiple enters the model.

## Value model and ranking

`dashboard/engine.js:valuation` runs in both Node and the browser.

1. Compute observed market cap / TVL for all retained comparables and the matching category subset. Quantiles use linear interpolation at index `(n−1)q` after sorting ratios.
2. Let `w = category_peer_count / (category_peer_count + 5)`. Geometrically blend category and global medians: `M = clamp(exp(w ln(category_median) + (1−w) ln(global_median)), 0.05, 5)`. If the category has no peers, use the global median. The five-peer prior and ratio bounds are stated assumptions to reduce sparse-category/outlier influence.
3. `G = 1 + clamp(change_7d, −50, 50) / 200`. Missing growth uses zero change. This caps the weekly multiplier at 0.75–1.25, not a forward growth forecast.
4. `A = 0.65 + 0.35 × min(tracking_age_days, 730) / 730`. Unknown tracking age uses 0.80. Older observations modestly improve the maturity proxy without suggesting a launch is more probable.
5. `implied_value_usd = max(1, round(TVL × M × G × A × 0.70))`. The 30% transfer haircut is assumed: token rights and initial float are unobserved. Output stores exact factors and inputs; displayed multipliers round for readability.
6. Low replaces median ratios with Q1 and halves the resulting rounded value; high uses Q3 and multiplies by 1.5. Other factors stay fixed. These are sensitivity stresses, not confidence bounds or probabilities.
7. Rank base values descending, slug ascending on ties. User table sorting does not alter canonical board ranks.

The full comparable ledger is visible in Method & assumptions. Each detail shows its own category peers (all can be expanded), their raw market caps/TVLs, count, weight and fallback. TVL is neither revenue nor token cash flow. Curator assets and cross-protocol TVL may overlap; ratios can compare different economic rights. These limitations motivate the shrinkage, haircut and broad stress range, but do not make the proxy an intrinsic value.

## Farm recipes and economics

`farmPlan` chooses among vault/curator, credit/CDP, exchange, derivatives/basis, gated/RWA, staking, stablecoin, prediction and research routes. It names the protocol and its first snapshot chain. This chain is a deterministic planning convention, not evidence of cheapest gas or native deployment. Assets and functions must be verified before any pilot. No recipe invents points, prescribes leverage, or assumes USDC support.

The assumed pilot capital ceiling is $200, and $0 for gated or research routes. A plan runs 60 days if tracking age is missing or under 180 days; otherwise 30. Its gas ceiling is $40 on Ethereum or $12 on another first chain, with $8 extra for exchange/derivatives/prediction fees and slippage. These figures are budgets and stop conditions, not measured costs or protocol minimums. The six steps cover issuer/campaign checks, category-specific participation and redemption tests, transaction quote checks, weekly monitoring, exit/documentation, and a conditional post-launch claim review. Every row includes the same plan text as its rendered detail.

The calculator is an illustrative allocation scenario, **not expected return**:

`gross = implied_cap × assumed_pool_share × capital / (snapshot_TVL + capital) × days / 90 × eligibility`

Default pool share is 5%; the hypothetical season is 90 days. It assumes rewards are worth 5% of the modeled *circulating-cap value*, not 5% of total token supply. No supply or emission schedule exists in the snapshot. The capital-time denominator uses static TVL as a proxy; it assumes one eligible position, immediate liquid rewards, and no vesting or price movement. Fees and assumed 5% annual capital opportunity cost are deducted for net. Eligibility zero yields gross zero. Principal loss, actual campaign rules or price/vesting effects can dominate. Many modeled pilots are below assumed costs; the page shows that result instead of implying every protocol is worth farming.

## Reproduction and verification

- `node main.ts` exits 0 and writes `output/board.json`, `output/dashboard/`, `output/screenshots/`, and canonical `output/dossier.json`.
- `node scripts/validate.ts` checks input provenance, complete coverage, row/rank/step contracts, independent valuation arithmetic, browser payload parity, no network APIs/URLs in page sources, source byte budget, screenshot caps, immutable vendor/LICENSE, exact `buildDossier` bytes and two fresh builds with identical file hashes.
- `node main.ts --preview` refreshes the source dashboard's compact data as well as output.
- `node scripts/capture.ts` is a **development-only** standard-library CDP client for an installed Chrome (set `CHROME_BIN` outside macOS). It disables browser network connectivity, opens the actual `output/dashboard/index.html` from disk, checks sorting, all filters, empty results, pagination, allocation sensitivity, all 174 detail routes, exact rendered plan/value parity, mobile page overflow and console exceptions. It regenerates the three PNGs from that actual page. Then rerun `node main.ts` to include them in the dossier.

All three screenshots are freshly captured, not starter images or generated mockups: 1440×1200 board, Steakhouse detail, and Lending/Ethereum/small-TVL filtered board. Dashboard source is under 64 KiB, and the dossier includes every source file. No runtime dependencies, installation, fonts, CDN, API requests or browser are required for the competition program. Native erasable TypeScript runs on Node 22.18+. The bundled library and starter LICENSE are byte-identical to the kit. This work is committed locally, without push or submission; competition transcript/account checks are separate from these local artifact checks.
