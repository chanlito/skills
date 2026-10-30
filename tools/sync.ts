// Copies shared/ into every skill's scripts/, since each skill is installed
// on its own and has to carry what it uses.
//
//   bun run sync           copy
//   bun run sync --check   fail if any copy differs (for CI)

import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const check = process.argv.includes('--check');
const shared = readdirSync('shared').filter((f) => f.endsWith('.ts'));
let stale = 0;
for (const skill of readdirSync('skills')) {
  const dir = join('skills', skill, 'scripts');
  if (!existsSync(dir)) continue;
  for (const file of shared) {
    const from = join('shared', file);
    const to = join(dir, file);
    const same =
      existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8');
    if (same) continue;
    if (check) {
      console.error(`${to} differs from ${from}: run bun run sync`);
      stale++;
    } else copyFileSync(from, to);
  }
}
process.exit(stale ? 1 : 0);
