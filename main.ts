// Node 22.18+, standard library only. The same engine evaluates browser and board rows.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
const output = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? (existsSync('/input/snapshot.json') ? '/output' : join(root, 'output')));
if (!output) throw new Error('--output needs a path');
if (resolve(output) === resolve(root) || resolve(output) === resolve(root, 'dashboard')) throw new Error('Output must be separate from source');
const s = parseSnapshot(readFileSync(input.endsWith('.json') ? input : join(input, 'snapshot.json'), 'utf8'));
const board = buildRadar(s);
validateBoard(board.rows, s);
mkdirSync(output, { recursive: true });
cpSync(join(root, 'dashboard'), join(output, 'dashboard'), { recursive: true });
cpSync(join(root, 'screenshots'), join(output, 'screenshots'), { recursive: true });
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
