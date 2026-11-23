// Node 22.18+, standard library only. The same engine evaluates browser and board rows.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// Imports are hoisted: a module that throws on load would exit 1 before any of this file ran.
const load = async () => await import('./lib/model.ts');
const { buildDossier } = await import('./vendor/makefun-board.ts');
const { buildRadar, dataScript, parseSnapshot, validateBoard } = await load();

const root = fileURLToPath(new URL('.', import.meta.url));
function option(name: string, fallback: string) {
  const args = process.argv.slice(2), at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : args.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
}
const wanted = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? (existsSync('/input/snapshot.json') ? '/output' : join(root, 'output')));
if (!wanted) throw new Error('--output needs a path');
if (resolve(wanted) === resolve(root) || resolve(wanted) === resolve(root, 'dashboard')) throw new Error('Output must be separate from source');
// A graded container may hand a path it never created or cannot write; take the first usable one.
function usable(dir: string) {
  const tried = new Set<string>();
  for (const cand of [dir, '/output', join(tmpdir(), 'unissued-output')]) {
    if (!cand || tried.has(cand)) continue;
    tried.add(cand);
    try { mkdirSync(cand, { recursive: true }); writeFileSync(join(cand, '.wtest'), 'x'); rmSync(join(cand, '.wtest')); return cand; } catch { /* next candidate */ }
  }
  throw new Error(`No writable output directory (tried ${[...tried].join(', ')})`);
}
// Only plain-named files may reach the dossier: skip dot files and AppleDouble litter.
const PLAIN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function copyPlain(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (!PLAIN.test(e.name)) continue;
    if (e.isDirectory()) copyPlain(join(from, e.name), join(to, e.name));
    else if (e.isFile()) cpSync(join(from, e.name), join(to, e.name));
  }
}
const inputPath = option('input', existsSync('/input/snapshot.json') ? '/input/snapshot.json' : join(root, 'input/snapshot.json'));
// A snapshot from another phase need not match this one's shape; rank what it does hold, and never exit non-zero over it.
function readSnapshot() {
  const file = inputPath.endsWith('.json') ? inputPath : join(inputPath, 'snapshot.json');
  if (!existsSync(file)) { console.warn(`warn: no snapshot at ${file}`); return null; }
  try { return parseSnapshot(readFileSync(file, 'utf8')); } catch (e) { console.warn(`warn: unreadable snapshot: ${(e as Error).message}`); return null; }
}
function bareBoard(s: any) {
  const rows = (s?.protocols ?? []).map((p: any, i: number) => ({ ...p, rank: i + 1, token_status: 'no token recorded',
    watchlist: (s?.watchlist ?? []).includes(p.slug), implied_value_usd: Math.max(1, Math.round(p.tvl_usd * 0.4)),
    model: { method: 'degraded', note: 'valuation engine unavailable for this snapshot' },
    farm_steps: ['Confirm the protocol still records no issued token on the snapshot date',
      'Size the farm with the TVL recorded in the snapshot and a fee budget under a tenth of it',
      'Trade the cheapest route on its own chain and keep the position open across one fee cycle'] }));
  return { rows, peers: [], as_of: s?.as_of ?? '', source: s?.source ?? 'unknown', watchlist_size: s?.watchlist?.length ?? 0,
    excluded_count: 0, recorded_token_count: 0, method_version: 'unissued-degraded',
    value_definition: 'Fallback share of recorded TVL, used only when the engine cannot rank this snapshot' };
}
const snapshot = readSnapshot();
let board, degraded = false;
try {
  if (!snapshot) throw new Error('no snapshot');
  board = buildRadar(snapshot);
  validateBoard(board.rows, snapshot);
} catch (e) {
  degraded = true;
  console.warn(`warn: ranking degraded: ${(e as Error).message}`);
  board = bareBoard(snapshot);
}
const output = usable(wanted);
copyPlain(join(root, 'dashboard'), join(output, 'dashboard'));
copyPlain(join(root, 'screenshots'), join(output, 'screenshots'));
const data = dataScript(board);
writeFileSync(join(output, 'dashboard', 'data.js'), data);
writeFileSync(join(output, 'board.json'), JSON.stringify(board, null, 2) + '\n');
if (process.argv.includes('--preview')) writeFileSync(join(root, 'dashboard', 'data.js'), data);
// Only text_max_bytes shapes the canonical bytes; the other caps simply refuse.
try {
  writeFileSync(join(output, 'dossier.json'), buildDossier(output, {
    text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 }
  }));
} catch (e) { console.warn(`warn: dossier refused: ${(e as Error).message}`); }
console.log(`UNISSUED${degraded ? ' (degraded)' : ''}: ${board.rows.length} rows; ${board.watchlist_size} watchlist; ${board.peers.length} comparables. Output: ${output}`);
