import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  bare,
  sameCode,
  scan,
  syntaxOf,
  tags,
} from '../skills/no-comments/scripts/comments';

const COMMENTS = join(
  import.meta.dir,
  '../skills/no-comments/scripts/comments.ts',
);

const read = (file: string, src: string) => scan(src, syntaxOf(file)!);
const texts = (file: string, src: string) => read(file, src).map((c) => c.text);
const tagged = (file: string, src: string) =>
  read(file, src).map((c) => tags(c).join(','));

test('scan: finds comments, and not what only looks like one', () => {
  const src = [
    "const url = 'https://example.com/a'; // the real one",
    'const re = /\\/\\/[a-z]+/g;',
    'const half = total / 2 / parts;',
    'const text = `a // b ${fn({ c: `// d` })} /* e */`;',
    '/* a block',
    '   on two lines */',
    'const jsx = <a href="//cdn">http://example.com {/* in JSX */}</a>;',
    'const done = <br />; // after a tag',
    "const text = <p>Don't {/* after an apostrophe */}</p>;",
    "const long = 'one \\",
    "two'; // after a string on two lines",
  ].join('\n');
  expect(texts('a.tsx', src)).toEqual([
    'the real one',
    'a block\non two lines',
    'in JSX',
    'after a tag',
    'after an apostrophe',
    'after a string on two lines',
  ]);
  expect(read('a.tsx', src).map((c) => [c.line, c.end])).toEqual([
    [1, 1],
    [5, 6],
    [7, 7],
    [8, 8],
    [9, 9],
    [11, 11],
  ]);
});

test('scan: line comments that follow each other are one comment', () => {
  const src = [
    '// First line,',
    '// second line.',
    'const a = 1; // on its own',
    '// Third.',
    '',
    '/** A doc comment. */',
    'export const b = 2;',
  ].join('\n');
  const found = read('a.ts', src);
  expect(found.map((c) => c.text)).toEqual([
    'First line,\nsecond line.',
    'on its own',
    'Third.',
    'A doc comment.',
  ]);
  expect(found.map((c) => c.doc)).toEqual([false, false, false, true]);
  expect(found[0].end).toBe(2);
});

test('scan: other languages', () => {
  expect(
    texts(
      'a.sh',
      '#!/bin/sh\necho "not # one" ${#items} # count them\n# alone\n',
    ),
  ).toEqual(['!/bin/sh', 'count them', 'alone']);
  expect(texts('a.py', '"""Docs with a # inside."""\nx = 1  # why\n')).toEqual([
    'why',
  ]);
  expect(
    texts('a.sql', "SELECT '--no' AS a; -- yes\n/* and this */\n"),
  ).toEqual(['yes', 'and this']);
  expect(
    texts('a.css', 'a { background: url(//cdn/x.png); } /* tint */'),
  ).toEqual(['tint']);
  expect(texts('a.go', 'var s = `// raw\n// string`\n// real\n')).toEqual([
    'real',
  ]);
  expect(texts('a.html', '<p>Hi</p> <!-- note -->')).toEqual(['note']);
  expect(
    texts('a.scss', 'a { background: url(//cdn/x.png); } // tint'),
  ).toEqual(['tint']);
  expect(
    texts('a.rs', "struct S<'a> { // one lifetime\n  x: &'a str, // field\n}"),
  ).toEqual(['one lifetime', 'field']);
  expect(syntaxOf('notes.md')).toBeNull();
  expect(syntaxOf('Dockerfile.dev')).toEqual({ line: '#' });
});

test('tags: what each comment looks like', () => {
  const src = [
    '// Copyright (c) 2026 Someone. Licensed under MIT.',
    '',
    '// The next line is laid out by hand.',
    '// prettier-ignore',
    '// eslint-disable-next-line no-console',
    '// @ts-expect-error the types are wrong upstream',
    '/** Returns the total. */',
    'x(); // TODO: retry',
    'y(); // Do not remove: the gateway needs it.',
    'z(); // IMPORTANT keep the two lists in sync',
    'w(); // Workaround for the old driver, fine for now',
    'v(); // See https://example.com/spec and #42',
    '// const old = legacy(order);',
    '',
    '// ---------- helpers ----------',
    'u(); // Charge the card.',
    'export const must = 1; // Commands that must pass, and files never read.',
  ].join('\n');
  expect(tagged('a.ts', src)).toEqual([
    'license',
    '',
    'tool',
    'suppression',
    'suppression',
    'doc',
    'todo',
    'rule',
    'rule',
    'workaround',
    'link',
    'code',
    'banner',
    '',
    '',
  ]);
  const [bang] = read('a.sh', '#!/usr/bin/env bash\n');
  expect(tags(bang)).toEqual(['tool']);
  const [crate] = read('lib.rs', '//! Crate docs.\n');
  expect(tags(crate)).toEqual([]);
  const keep = [/^i18n:/, /^SAFETY:/];
  const kept = (src: string) =>
    read('a.ts', src).map((c) => tags(c, keep).join(','));
  expect(kept('// Shown on the receipt.\n// i18n: label')).toEqual(['tool']);
  expect(
    kept('// SAFETY: the caller owns it,\n// and it outlives us.'),
  ).toEqual(['tool']);
  expect(
    tagged('a.sh', '#!/usr/bin/env bash\n# Loops over the files.\nset -e\n'),
  ).toEqual(['tool', '']);
});

test('bare: the same code with or without its comments', () => {
  const same = (file: string, before: string, now: string) =>
    sameCode(bare(before, syntaxOf(file)!), bare(now, syntaxOf(file)!));
  const withComments = [
    '// Adds.',
    'function add(a: number, b: number) {',
    '  return a + b; /* sum */',
    '}',
    'const el = <p>{/* gone */}hi</p>;',
    'try { add(1, 2); } catch {',
    '  // ignore',
    '}',
  ].join('\n');
  const without =
    'function add(a: number, b: number) { return a + b; }\nconst el = <p>hi</p>;\ntry { add(1, 2); } catch {}';
  expect(same('a.tsx', withComments, without)).toBe(true);
  expect(same('a.tsx', withComments, withComments)).toBe(true);
  expect(same('a.tsx', withComments, without.replace('a + b', 'a - b'))).toBe(
    false,
  );
  expect(same('a.tsx', 'f({});', 'f();')).toBe(false);
  const two =
    'try { f(); } catch {\n  // one\n  // eslint-disable-next-line\n}';
  expect(same('a.tsx', two, two.replace('  // one\n', ''))).toBe(true);
  expect(same('a.tsx', '<p>{/* a */ /* b */}</p>', '<p>{/* b */}</p>')).toBe(
    true,
  );
  expect(same('a.tsx', 'f(); // x', 'f(); g();')).toBe(false);

  const py =
    'def f(a):\n    if a:\n        x()\n        # then y\n        y()\n';
  expect(same('a.py', py, py.replace('        # then y\n', ''))).toBe(true);
  expect(
    same('a.py', py, py.replace('        # then y\n        y()', '    y()')),
  ).toBe(false);
});

const git = (dir: string, ...args: string[]) =>
  spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();
const run = (dir: string, ...args: string[]) =>
  spawnSync('bun', [COMMENTS, ...args], { cwd: dir, encoding: 'utf8' });

function write(dir: string, files: Record<string, string>) {
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
}

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-comments-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'feat: start');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'switch', '-qc', 'feat/x');
  return dir;
}

test('comments.ts: lists only what the branch changed, by config', () => {
  const dir = repo({
    'skills.config.json': JSON.stringify({
      tiers: { high: ['src/billing/**'] },
      comments: { ignore: ['src/api/**'], keep: ['^i18n:'] },
      lessons: 'off',
    }),
    'src/a.ts': '// Old comment.\nexport const a = 1;\n',
  });
  write(dir, {
    'src/a.ts':
      '// Old comment.\nexport const a = 1;\n// New comment.\nexport const b = 2; // i18n: label\n',
    'src/billing/charge.ts': '// Do not remove the hold.\nhold();\n',
    'src/api/client.ts': '// Written by a tool.\n',
    'src/generated/types.ts': '// Also written by a tool.\n',
    'notes.md': '<!-- not read -->\n',
  });
  git(dir, 'add', 'src/a.ts');
  git(dir, 'commit', '-qm', 'feat: more');

  const out = run(dir).stdout;
  expect(out).not.toContain('Old comment');
  expect(out).toContain('New comment.');
  expect(out).toMatch(/tool\s+i18n: label/);
  expect(out).toContain('src/billing/charge.ts (High');
  expect(out).toMatch(/rule\s+Do not remove the hold\./);
  expect(out).not.toContain('Written by a tool');
  expect(out).not.toContain('written by a tool');
  expect(out).toContain('3 comments on lines this branch changed, in 2 files');
  expect(out).toContain('Not read');

  const named = run(dir, 'src/a.ts', '--json');
  const { listed } = JSON.parse(named.stdout);
  expect(listed.map((c: { text: string }) => c.text)).toEqual([
    'Old comment.',
    'New comment.',
    'i18n: label',
  ]);
  expect(run(dir, 'src').stdout).toContain('in these files');

  const typo = run(dir, 'src/nope.ts');
  expect(typo.status).toBe(1);
  expect(typo.stderr).toContain('No files here match');
  const half = run(dir, 'src/a.ts', 'src/nope.ts');
  expect(half.status).toBe(1);
  expect(half.stderr).toContain('No files here match src/nope.ts.');
  expect(run(dir, '--help').status).toBe(1);
});

test('comments.ts: a moved file lists only the comments added to it', () => {
  const dir = repo({
    'skills.config.json': JSON.stringify({ lessons: 'off' }),
    'src/a.ts':
      '// Old one.\nexport const a = 1;\n// Old two.\nexport const b = 2;\n',
  });
  git(dir, 'mv', 'src/a.ts', 'src/b.ts');
  write(dir, {
    'src/b.ts':
      '// Old one.\nexport const a = 1;\n// Old two.\nexport const b = 2;\n// New.\n',
  });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'refactor: move a');
  git(dir, 'config', 'color.ui', 'always');
  const out = run(dir).stdout;
  expect(out).toContain('New.');
  expect(out).not.toContain('Old');
  expect(out).toContain('1 comment on lines this branch changed, in 1 file');
});

test('comments.ts: a file named like a git option is read as a file', () => {
  const dir = repo({
    'skills.config.json': JSON.stringify({ lessons: 'off' }),
    '--output=kept.ts': 'export const a = 1;\n',
    'kept.ts': 'export const kept = 1;\n',
  });
  write(dir, { '--output=kept.ts': '// New.\nexport const a = 1;\n' });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'feat: more');
  const out = run(dir).stdout;
  expect(readFileSync(join(dir, 'kept.ts'), 'utf8')).toBe(
    'export const kept = 1;\n',
  );
  expect(out).toContain('New.');
  expect(out).toContain('1 comment on lines this branch changed, in 1 file');
});

test('comments.ts --only-comments: passes on comments, fails on code', () => {
  const dir = repo({
    'a.ts': '// Adds one.\nexport const inc = (n: number) => n + 1; // sum\n',
  });
  expect(run(dir, '--only-comments').stdout).toContain('Nothing has changed');

  write(dir, { 'a.ts': 'export const inc = (n: number) =>\n  n + 1;\n' });
  let out = run(dir, '--only-comments');
  expect(out.status).toBe(0);
  expect(out.stdout).toContain('✓ Only comments changed');
  expect(out.stdout).toContain('2 before, 0 now');

  write(dir, { 'a.ts': 'export const inc = (n: number) => n + 2;\n' });
  out = run(dir, '--only-comments');
  expect(out.status).toBe(1);
  expect(out.stdout).toContain('a.ts');

  git(dir, 'checkout', '-q', 'a.ts');
  write(dir, { 'b.ts': 'export const b = 1;\n' });
  out = run(dir, '--only-comments');
  expect(out.status).toBe(1);
  expect(out.stdout).toContain('b.ts (added or deleted)');
});
