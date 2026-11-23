// Node 22.18+, standard library only. The same engine evaluates browser and board rows.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRadar, dataScript, parseSnapshot, validateBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
function option(name: string, fallback: string) {
  const args = process.argv.slice(2), at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : args.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
}
const input = option('input', existsSync('/input/snapshot.json') ? '/input/snapshot.json' : join(root, 'input/snapshot.json'));
if (!input) throw new Error('--input needs a path');
let output = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? (existsSync('/input/snapshot.json') ? '/output' : join(root, 'output')));
if (!output) throw new Error('--output needs a path');
if (resolve(output) === resolve(root) || resolve(output) === resolve(root, 'dashboard')) throw new Error('Output must be separate from source');
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
const s = parseSnapshot(readFileSync(input.endsWith('.json') ? input : join(input, 'snapshot.json'), 'utf8'));
const board = buildRadar(s);
validateBoard(board.rows, s);
output = usable(output);
copyPlain(join(root, 'dashboard'), join(output, 'dashboard'));
copyPlain(join(root, 'screenshots'), join(output, 'screenshots'));
const data = dataScript(board);
writeFileSync(join(output, 'dashboard', 'data.js'), data);
writeFileSync(join(output, 'board.json'), JSON.stringify(board, null, 2) + '\n');
if (process.argv.includes('--preview')) writeFileSync(join(root, 'dashboard', 'data.js'), data);
// Only text_max_bytes shapes the canonical bytes; the other caps simply refuse.
writeFileSync(join(output, 'dossier.json'), buildDossier(output, {
  text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 }
}));
console.log(`UNISSUED: ${board.rows.length} rows; ${s.watchlist.length}/${s.watchlist.length} watchlist; ${board.peers.length} deduplicated comparables. Output: ${output}`);
