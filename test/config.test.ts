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
  expect(tier(['.claude/skills/x/SKILL.md']).tier).toBe('Medium');
  expect(tier(['docs/a.md', '.github/workflows/ci.yml']).tier).toBe('High');
});

/** The `commits` setting the scripts see in a fresh repo holding `files`. */
function commitsWith(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-config-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, name), body);
  const config = join(import.meta.dir, '../shared/config.ts');
  const run = spawnSync(
    'bun',
    ['-e', `import { config } from '${config}'; console.log(config().commits)`],
    { cwd: dir, encoding: 'utf8' },
  );
  return run.stdout.trim();
}

test('config: .ts wins over .json, which wins over the old name', () => {
  const ts = `export default {\n  // gitmoji, because the team likes it\n  commits: 'gitmoji',\n};\n`;
  expect(commitsWith({})).toBe('conventional');
  expect(commitsWith({ 'show-your-work.json': '{"commits":"any"}' })).toBe(
    'any',
  );
  expect(
    commitsWith({
      'show-your-work.json': '{"commits":"any"}',
      'skills.config.json': '{"commits":"x"}',
    }),
  ).toBe('x');
  expect(
    commitsWith({
      'skills.config.json': '{"commits":"x"}',
      'skills.config.ts': ts,
    }),
  ).toBe('gitmoji');
});
