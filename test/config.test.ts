import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glob } from '../shared/config';
import { tier } from '../shared/tier';

test('glob: ** matches any folders, or none', () => {
  expect(glob('**/*.md').test('README.md')).toBe(true);
  expect(glob('**/*.md').test('docs/a/b.md')).toBe(true);
  expect(glob('docs/**').test('docs/a/b.ts')).toBe(true);
  expect(glob('worker/**').test('workers/x.ts')).toBe(false);
  expect(glob('*.ts').test('a/b.ts')).toBe(false);
  expect(glob('wrangler.json').test('wranglerXjson')).toBe(false);
});

test('tier: the highest wins, and agent instructions are never Low', () => {
  expect(tier(['README.md']).tier).toBe('Low');
  expect(tier(['README.md', 'src/app.ts']).tier).toBe('Medium');
  expect(tier(['CLAUDE.md']).tier).toBe('Medium');
  expect(tier(['.claude/settings.json']).tier).toBe('High');
  expect(tier(['.claude/commands/x.md']).tier).toBe('Medium');
  expect(tier(['.claude/skills/x/SKILL.md']).tier).toBe('High');
  expect(tier(['docs/a.md', '.github/workflows/ci.yml']).tier).toBe('High');
});

/** What `expr` (over `config()`) gives in a fresh repo holding `files`. */
function configWith(files: Record<string, string>, expr = 'config().commits') {
  const dir = mkdtempSync(join(tmpdir(), 'skills-config-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, name), body);
  const config = join(import.meta.dir, '../shared/config.ts');
  const run = spawnSync(
    'bun',
    [
      '-e',
      `import { config } from '${config}'; console.log(JSON.stringify(${expr}))`,
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  return JSON.parse(run.stdout);
}

test('config: .ts wins over .json, which wins over the old name', () => {
  const ts = `export default {\n  // gitmoji, because the team likes it\n  commits: 'gitmoji',\n};\n`;
  expect(configWith({})).toBe('conventional');
  expect(configWith({ 'show-your-work.json': '{"commits":"any"}' })).toBe(
    'any',
  );
  expect(
    configWith({
      'show-your-work.json': '{"commits":"any"}',
      'skills.config.json': '{"commits":"x"}',
    }),
  ).toBe('x');
  expect(
    configWith({
      'skills.config.json': '{"commits":"x"}',
      'skills.config.ts': ts,
    }),
  ).toBe('gitmoji');
});

test('config: project tiers add to the defaults, unless defaults is false', () => {
  const high = 'config().tiers.high';
  const mine = (tiers: string) => ({
    'skills.config.ts': `export default { tiers: ${tiers} };`,
  });
  const added = configWith(mine(`{ high: ['src/billing/**'] }`), high);
  expect(added).toContain('src/billing/**');
  expect(added).toContain('.github/workflows/**');
  expect(
    configWith(mine(`{ high: ['src/billing/**'], defaults: false }`), high),
  ).toEqual(['src/billing/**']);
});
