import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHECK = join(import.meta.dir, '../skills/pr-writing/scripts/check.ts');
const GIT = join(import.meta.dir, '../shared/git.ts');
const HARNESS = join(import.meta.dir, '../skills/pr-proof/scripts/harness.ts');

const git = (dir: string, ...args: string[]) =>
  spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();

/** A repo with `files` on origin/main and a feature branch checked out. */
function repo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-check-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, name), body);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'feat: start');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'switch', '-qc', 'feat/x');
  return dir;
}

const bun = (dir: string, script: string, ...args: string[]) =>
  spawnSync('bun', [script, ...args], { cwd: dir, encoding: 'utf8' });

const treeHash = (dir: string) =>
  bun(
    dir,
    '-e',
    `import { treeHash } from '${GIT}'; console.log(treeHash())`,
  ).stdout.trim();

test('treeHash: same code, same hash, whatever the commit or the index', () => {
  const dir = repo({ 'a.txt': 'a\n' });
  const start = treeHash(dir);
  expect(start).toMatch(/^[0-9a-f]{40}$/);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'wip');
  git(dir, 'commit', '-q', '--amend', '-m', 'feat: reworded');
  expect(treeHash(dir)).toBe(start);
  writeFileSync(join(dir, 'b.txt'), 'new\n');
  const untracked = treeHash(dir);
  expect(untracked).not.toBe(start);
  // Hashing it doesn't stage it.
  expect(git(dir, 'diff', '--cached', '--name-only')).toBe('');
  git(dir, 'add', 'b.txt');
  expect(treeHash(dir)).toBe(untracked);
});

test('check.ts: quick problems first, and no second run on the same code', () => {
  const runs = join(mkdtempSync(join(tmpdir(), 'skills-runs-')), 'runs');
  const dir = repo({
    'skills.config.json': JSON.stringify({
      checks: [`echo ran >> '${runs}'`],
      lessons: 'off',
    }),
  });
  const count = () =>
    existsSync(runs) ? readFileSync(runs, 'utf8').split('\n').length - 1 : 0;

  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'wip');
  let out = bun(dir, CHECK);
  expect(out.status).toBe(1);
  expect(out.stdout).toContain('commit "wip"');
  expect(out.stdout).toContain('The checks did not run');
  expect(count()).toBe(0);

  git(dir, 'commit', '-q', '--amend', '-m', 'feat: add a');
  out = bun(dir, CHECK);
  expect(out.stdout).toContain('✓ Ready to push.');
  expect(count()).toBe(1);

  out = bun(dir, CHECK);
  expect(out.stdout).toContain('already passed on this exact code');
  expect(out.stdout).toContain('✓ Ready to push.');
  expect(count()).toBe(1);

  bun(dir, CHECK, '--rerun');
  expect(count()).toBe(2);

  writeFileSync(join(dir, 'b.txt'), 'b\n');
  bun(dir, CHECK);
  expect(count()).toBe(3);
});

test('installCommand: a workspace monorepo installs, a single package borrows', () => {
  const at = (files: Record<string, string>) => {
    const dir = repo(files);
    return bun(
      dir,
      '-e',
      `import { installCommand } from '${HARNESS}'; console.log(JSON.stringify(installCommand()))`,
    ).stdout.trim();
  };
  expect(at({ 'package.json': '{}', 'package-lock.json': '{}' })).toBe('""');
  expect(
    at({ 'package.json': '{"workspaces":["apps/*"]}', 'bun.lock': '' }),
  ).toBe('"bun install --frozen-lockfile"');
  expect(
    at({
      'package.json': '{}',
      'pnpm-workspace.yaml': '',
      'pnpm-lock.yaml': '',
    }),
  ).toBe('"pnpm install --frozen-lockfile"');
  expect(
    at({
      'package.json': '{"workspaces":["apps/*"]}',
      'package-lock.json': '{}',
      'skills.config.json': '{"site":{"install":"make deps"}}',
    }),
  ).toBe('"make deps"');
});
