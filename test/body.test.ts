import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BODY = join(import.meta.dir, '../skills/pr-writing/scripts/body.ts');

const git = (dir: string, ...args: string[]) =>
  spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();

/** A repo on a feature branch, with `config` as its skills.config.ts. */
function repo(config?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-body-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  if (config) writeFileSync(join(dir, 'skills.config.ts'), config);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'feat: start');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'switch', '-qc', 'feat/x');
  return dir;
}

const body = (dir: string) =>
  spawnSync('bun', [BODY], { cwd: dir, encoding: 'utf8' }).stdout;

test('body: no preview set, no Preview line', () => {
  const out = body(repo());
  expect(out).not.toContain('Preview');
  expect(out.startsWith('**Tier:** ')).toBe(true);
});

test('body: a preview set, the branch link at the top', () => {
  const out = body(
    repo(`export default { preview: 'https://{branch}.site.dev/' };\n`),
  );
  expect(out.split('\n')[0]).toBe('**Preview:** https://feat-x.site.dev/');
});
