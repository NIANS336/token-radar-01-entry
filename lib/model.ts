import '../dashboard/engine.js';

export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] }
export const engine = (globalThis as any).RadarEngine;
const excluded = new Set(['Bridge', 'Cross Chain Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX', 'Stablecoin Wrapper', 'Anchor BTC', 'Staking Pool']);
const productName = /\s(v\d+(\.\d+)?|\d+\.\d+)$|\b(wrapped|staked|staking)\b|^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;
const order = (a: Protocol, b: Protocol) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
export const noToken = (p: Protocol) => p.gecko_id === null && p.symbol === null && p.mcap_usd === null;

export function parseSnapshot(text: string): Snapshot {
  const s = JSON.parse(text);
  if (!s.as_of || !Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) throw new Error('Invalid snapshot');
  const seen = new Set<string>();
  s.protocols = s.protocols.filter((p: Protocol) => {
    p.tvl_usd = Number(p.tvl_usd);
    if (!p.slug || !p.name || !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0 || !Array.isArray(p.chains)) return false;
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });
  // A watchlist slug the snapshot cannot back (absent, or it already has a token) is dropped, not fatal.
  const backed = new Set(s.protocols.filter(noToken).map((p: Protocol) => p.slug));
  s.watchlist = s.watchlist.filter((slug: string) => backed.has(slug) && seen.has(slug));
  return s;
}

export function comparables(s: Snapshot): Protocol[] {
  // One token per category: repeated version records would otherwise overweight an issuer.
  const groups = new Map<string, Protocol>();
  for (const p of s.protocols) {
    if (!(p.gecko_id || p.symbol) || !p.mcap_usd || p.mcap_usd <= 0 || excluded.has(p.category || '') || /\b(wrapped|staked|staking)\b/i.test(p.name)) continue;
    const key = `${p.category}|${p.gecko_id || p.symbol?.toUpperCase()}`;
    const prev = groups.get(key);
    if (!prev || p.tvl_usd > prev.tvl_usd || (p.tvl_usd === prev.tvl_usd && order(p, prev) < 0)) groups.set(key, p);
  }
  return [...groups.values()].sort(order);
}

export function buildRadar(s: Snapshot) {
  const peers = comparables(s), watch = new Set(s.watchlist);
  const tokenNames = s.protocols.filter(p => !noToken(p)).map(p => p.name.toLowerCase()).filter(n => n.length >= 4);
  const chosen = s.protocols.filter(p => watch.has(p.slug) || (
    noToken(p) && p.tvl_usd < s.floor_usd && !excluded.has(p.category || '') && !productName.test(p.name)
    && !tokenNames.some(n => p.name.toLowerCase().startsWith(`${n} `))
  ));
  const picked = new Set(chosen.map(p => p.slug));
  const fill = s.protocols.filter(p => noToken(p) && !picked.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || order(a, b)).slice(0, Math.max(0, 120 - chosen.length));
  const pool = chosen.concat(fill);
  const rows = pool.map(p => {
    const model = engine.valuation(p, s.as_of, peers), plan = engine.farmPlan(p, s.as_of);
    return { ...p, rank: 0, token_status: 'no token recorded', watchlist: watch.has(p.slug),
      implied_value_usd: model.implied_value_usd, model, farm_plan: plan, farm_steps: plan.steps,
      farm_scenario: engine.scenario(model.implied_value_usd, plan.capital_usd, p.tvl_usd, plan.fee_budget_usd, plan.duration_days) };
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || order(a, b));
  rows.forEach((r, i) => r.rank = i + 1);
  return { rows, peers, as_of: s.as_of, source: s.source, watchlist_size: s.watchlist.length,
    excluded_count: s.protocols.length - rows.length, recorded_token_count: s.protocols.filter(p => !noToken(p)).length,
    method_version: 'unissued-1', value_definition: 'Hypothetical circulating market capitalization at snapshot fundamentals, not FDV or a launch forecast' };
}

export function validateBoard(rows: any[], s: Snapshot) {
  if (rows.length < 100 || rows.length > 4000) console.warn(`warn: board has ${rows.length} rows, outside the 100-4000 band`);
  if (new Set(rows.map(r => r.slug)).size !== rows.length) throw new Error('Duplicate board slug');
  if (!s.watchlist.every(x => rows.some(r => r.slug === x))) console.warn('warn: watchlist coverage incomplete');
  rows.forEach((r, i) => {
    if (!s.protocols.some(p => p.slug === r.slug) || !noToken(r)) throw new Error('Ineligible row');
    if (r.rank !== i + 1 || !Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) throw new Error('Invalid rank/value');
    if (i && r.implied_value_usd > rows[i - 1].implied_value_usd) throw new Error('Unsorted values');
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12 || r.farm_steps.some((x: string) => x.trim().length < 20 || x.trim().length > 600)) throw new Error(`Invalid plan ${r.slug}`);
  });
  if (new Set(rows.map(r => r.implied_value_usd)).size < 2) throw new Error('Flat ranking');
}

export function dataScript(board: ReturnType<typeof buildRadar>) {
  // Columnar payload keeps the entire dossier readable under its 64 KiB source budget.
  const categories = [...new Set([...board.rows, ...board.peers].map(p => p.category))];
  const chains = [...new Set(board.rows.flatMap(p => p.chains))];
  const data = { date: board.as_of, watch: board.watchlist_size, tokens: board.recorded_token_count, categories, chains,
    rows: board.rows.map(p => [p.slug, p.name, categories.indexOf(p.category), p.chains.map(c => chains.indexOf(c)), p.tvl_usd, p.change_7d, p.listed_at, +p.watchlist]),
    peers: board.peers.map(p => [p.slug, p.name, categories.indexOf(p.category), p.tvl_usd, p.mcap_usd, p.gecko_id || p.symbol]) };
  return `window.RADAR_DATA=${JSON.stringify(data)};\n`;
}
