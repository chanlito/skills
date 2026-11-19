// The comments a branch adds or changes, one per line and tagged by what
// they look like, for a reviewer who didn't write them.
//
//   bun scripts/comments.ts                  comments on lines this branch changed
//   bun scripts/comments.ts src/a.ts src/b   every comment in these files or folders
//   bun scripts/comments.ts --json           the same, for scripts
//   bun scripts/comments.ts --only-comments  fail if uncommitted changes touch code
//
// It reads code the way a highlighter does, not a compiler, so a tag says
// where to look and is never a verdict.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { config, glob, root } from './config';
import { changedFiles, output } from './git';
import { tier } from './tier';

export type Comment = {
  /** Its first and last line, counted from 1. */
  line: number;
  end: number;
  /** Where it starts and ends in the source. */
  from: number;
  to: number;
  /** Its words, without the comment markers. */
  text: string;
  /** A doc comment: a block that opens with two stars, or three slashes. */
  doc: boolean;
  /** Nothing else is on its lines. */
  own: boolean;
  block: boolean;
};

export type Syntax = {
  /** What starts a comment that runs to the end of the line. */
  line?: '//' | '--' | '#';
  /** Slash-star blocks. */
  block?: boolean;
  /** HTML comments too. */
  html?: boolean;
  /** Template literals and regular expressions. */
  js?: boolean;
  /** Backtick strings that span lines. */
  raw?: boolean;
  /** Triple-quoted strings. */
  triple?: boolean;
};

const BY_EXTENSION: [string, Syntax][] = [
  ['ts tsx mts cts js jsx mjs cjs', { line: '//', block: true, js: true }],
  ['vue svelte astro html', { line: '//', block: true, js: true, html: true }],
  ['go', { line: '//', block: true, raw: true }],
  [
    'java kt kts swift rs c h cc cpp hpp cs dart php scala scss less',
    { line: '//', block: true },
  ],
  ['css', { block: true }],
  ['sql', { line: '--', block: true }],
  ['py', { line: '#', triple: true }],
  ['rb sh bash zsh fish yml yaml toml tf', { line: '#' }],
];

/** How comments are written in a file, or null when the script can't read it. */
export function syntaxOf(file: string): Syntax | null {
  const name = basename(file);
  if (/^(Dockerfile|Makefile)/.test(name)) return { line: '#' };
  const ext = extname(name).slice(1).toLowerCase();
  return (
    BY_EXTENSION.find(([exts]) => exts.split(' ').includes(ext))?.[1] ?? null
  );
}

const REGEX_AFTER_WORD = new Set(
  'return typeof case in of do else void delete throw new yield await instanceof'.split(
    ' ',
  ),
);

const WORD = 'a word';
const VALUE = 'a string, template or regular expression';

export function scan(src: string, s: Syntax): Comment[] {
  const out: Comment[] = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let lastToken = '';
  let tokenBefore = '';
  let lastWord = '';
  const openBracesPerInterpolation: number[] = [];
  let multilineQuote = '';
  let regex = 0;

  const mark = (token: string) => {
    tokenBefore = lastToken;
    lastToken = token;
  };
  const add = (to: number, text: string, doc: boolean, block: boolean) => {
    const raw = src.slice(i, to);
    const lines = raw.split('\n').length - 1;
    const start = src.lastIndexOf('\n', i - 1) + 1;
    const stop = src.indexOf('\n', to);
    const own =
      !src.slice(start, i).trim() && !src.slice(to, stop < 0 ? n : stop).trim();
    out.push({
      line,
      end: line + lines,
      from: i,
      to,
      text: text.trim(),
      doc,
      own,
      block,
    });
    line += lines;
    i = to;
  };
  const until = (close: string, from: number) => {
    const at = src.indexOf(close, from);
    return at < 0 ? n : at + close.length;
  };
  const inside = (raw: string, open: number, close: number) =>
    raw
      .slice(open, raw.length - close)
      .split('\n')
      .map((l) => l.replace(/^\s*\*+ ?/, '').trim())
      .join('\n');
  const skipTemplate = () => {
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        if (src[i + 1] === '\n') line++;
        i += 2;
      } else if (c === '`') {
        i++;
        return;
      } else if (c === '$' && src[i + 1] === '{') {
        i += 2;
        openBracesPerInterpolation.push(0);
        return;
      } else {
        if (c === '\n') line++;
        i++;
      }
    }
  };
  const stringEnd = () => {
    for (let j = i + 1; j < n && src[j] !== '\n'; j++) {
      if (src[j] === '\\') j++;
      else if (src[j] === src[i]) return j + 1;
    }
    return 0;
  };
  const regexEnd = () => {
    const next = src[i + 1];
    // "/>" closes a JSX tag.
    if (next === '>') return 0;
    const can =
      lastToken === WORD
        ? REGEX_AFTER_WORD.has(lastWord)
        : lastToken === '>'
          ? tokenBefore === '='
          : lastToken === '' || '(,=:[!&|?{;+-*%~^'.includes(lastToken);
    if (!can) return 0;
    let inClass = false;
    for (let j = i + 1; j < n && src[j] !== '\n'; j++) {
      const c = src[j];
      if (c === '\\') j++;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        j++;
        while (/[a-z]/.test(src[j] ?? '')) j++;
        return j;
      }
    }
    return 0;
  };

  while (i < n) {
    const c = src[i];
    if (multilineQuote) {
      if (c === '\\') {
        if (src[i + 1] === '\n') line++;
        i += 2;
      } else if (src.startsWith(multilineQuote, i)) {
        i += multilineQuote.length;
        multilineQuote = '';
      } else {
        if (c === '\n') line++;
        i++;
      }
      continue;
    }
    if (c === '\n') {
      line++;
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r') i++;
    else if (
      s.line &&
      src.startsWith(s.line, i) &&
      // "#" in the middle of a word is "${#items}" or a colour, and "//"
      // after a colon or "url(" is an address.
      (s.line === '#'
        ? i === 0 || /\s/.test(src[i - 1])
        : s.line !== '//' ||
          (src[i - 1] !== ':' && src.slice(i - 4, i) !== 'url('))
    ) {
      const newline = src.indexOf('\n', i);
      const to = newline < 0 ? n : newline;
      const raw = src.slice(i, to);
      const doc = /^\/\/\/(?!\/)/.test(raw);
      add(to, raw.slice(s.line.length).replace(/^\/+/, ''), doc, false);
    } else if (s.block && src.startsWith('/*', i)) {
      const to = until('*/', i + 2);
      const raw = src.slice(i, to);
      add(to, inside(raw, 2, 2), /^\/\*\*[^/]/.test(raw), true);
    } else if (s.html && src.startsWith('<!--', i)) {
      const to = until('-->', i + 4);
      add(to, inside(src.slice(i, to), 4, 3), false, true);
    } else if (
      s.triple &&
      (src.startsWith('"""', i) || src.startsWith("'''", i))
    ) {
      multilineQuote = src.slice(i, i + 3);
      i += 3;
      mark(VALUE);
    } else if (c === '"' || c === "'") {
      // An apostrophe in text, or a lifetime, has no closing quote.
      const closed = stringEnd();
      if (closed) line += src.slice(i, closed).split('\n').length - 1;
      i = closed || i + 1;
      mark(closed ? VALUE : c);
    } else if (s.raw && c === '`') {
      multilineQuote = c;
      i++;
      mark(VALUE);
    } else if (s.js && c === '`') {
      i++;
      skipTemplate();
      mark(VALUE);
    } else if (s.js && openBracesPerInterpolation.length && c === '{') {
      openBracesPerInterpolation[openBracesPerInterpolation.length - 1]++;
      i++;
      mark(c);
    } else if (s.js && openBracesPerInterpolation.length && c === '}') {
      i++;
      if (
        openBracesPerInterpolation[openBracesPerInterpolation.length - 1] === 0
      ) {
        openBracesPerInterpolation.pop();
        skipTemplate();
        mark(VALUE);
      } else {
        openBracesPerInterpolation[openBracesPerInterpolation.length - 1]--;
        mark(c);
      }
    } else if (s.js && c === '/' && (regex = regexEnd())) {
      i = regex;
      mark(VALUE);
    } else if (/[\w$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      i = j;
      mark(WORD);
    } else {
      mark(c);
      i++;
    }
  }
  return paragraphs(out);
}

const readByTool = (c: Comment) =>
  TOOL.test(c.text) ||
  SUPPRESSION.test(c.text) ||
  (c.line === 1 && SHEBANG.test(c.text));

function paragraphs(comments: Comment[]) {
  const out: Comment[] = [];
  for (const c of comments) {
    const last = out[out.length - 1];
    if (
      last &&
      !last.block &&
      !c.block &&
      last.own &&
      c.own &&
      last.doc === c.doc &&
      c.line === last.end + 1 &&
      !readByTool(last) &&
      !readByTool(c)
    ) {
      last.end = c.end;
      last.to = c.to;
      last.text = `${last.text}\n${c.text}`.trim();
    } else out.push({ ...c });
  }
  return out;
}

export type Tag =
  | 'tool'
  | 'suppression'
  | 'license'
  | 'doc'
  | 'todo'
  | 'rule'
  | 'workaround'
  | 'link'
  | 'code'
  | 'banner'
  | 'long';

const TOOL =
  /prettier-ignore|^<(reference|amd-)|webpack[A-Z]\w+:|@vite-ignore|[#@]__(PURE|NO_SIDE_EFFECTS)__|^#?(end)?region\b|statement-breakpoint|khmer-check: ignore|@(jsx|jsxImportSource|jsxRuntime|jsxFrag|ts-check|flow|generated|vitest-environment|jest-environment)\b|sourceMappingURL=|^syntax=|-\*-.*-\*-|yaml-language-server:|^cspell:|^eslint-env\b|shellcheck (shell|source)=|^go:(build|generate|embed)\b/;
const SHEBANG = /^!\s*\//;
const SUPPRESSION =
  /eslint-(disable|enable)|@ts-(ignore|expect-error|nocheck)|biome-ignore|oxlint-disable|deno-lint-ignore|stylelint-disable|\bnoqa\b|type:\s*ignore|pylint:\s*disable|rubocop:\s*disable|shellcheck disable=|\bnolint\b|\bnosec\b|NOSONAR|(istanbul|c8|v8) ignore|pragma: no cover|phpcs:(ignore|disable)/;
const LICENSE =
  /copyright\b|spdx-license-identifier|all rights reserved|licensed under|©/i;
const TODO = /\b(TODO|FIXME|XXX)\b|\b(todo|fixme)\s*[:(]/;
const RULE =
  /\b(do not|don't|dont|never|must not|mustn't) (remove|change|touch|delete|edit|move|reorder|rename|modify|call|use|import|run|skip)\b|\bmust (stay|remain|match|come|run|happen|be kept|be called)\b|\bin sync\b|\border matters\b|\bbefore changing\b|\btalk to\b|\bask \w+ before\b/i;
const SHOUT = /\b(IMPORTANT|WARNING|CAREFUL|BEWARE|CAUTION|DANGER)\b/;
const WORKAROUND =
  /\b(workaround|work around|hack|hacky|kludge|for now|temporary|temporarily|quick fix|until we|too risky|should be fine|somehow|not sure why|no idea why|for some reason|just in case|to be safe)/i;
const LINK = /https?:\/\/|#\d+\b|\bRFC ?\d+/;
const DECORATION = /^[-=*#~_+<>|/\s]*$/;
const RULER = /^[-=*#~_]{3}$/;
const ruled = (line: string) =>
  RULER.test(line.slice(0, 3)) || RULER.test(line.slice(-3));
const STATEMENT =
  /^(const|let|var|return|import|export|await|if|for|while|function|class)\b.*[=(){};]/;

function looksLikeCode(text: string) {
  const lines = text.split('\n').filter((l) => l.trim());
  const code = lines.filter(
    (l) =>
      /[;{}]$/.test(l) ||
      STATEMENT.test(l) ||
      /^[\w$.]+\(.*\)$/.test(l) ||
      /^<\/?[A-Za-z][\w.-]*(\s[^>]*)?\/?>$/.test(l),
  );
  return code.length > 0 && code.length * 2 >= lines.length;
}

/** What a comment looks like. None means plain words: read it. */
export function tags(c: Comment, keep: RegExp[] = []): Tag[] {
  const t = c.text;
  const kept = t.split('\n').some((l) => keep.some((re) => re.test(l)));
  if (kept || TOOL.test(t) || (c.line === 1 && SHEBANG.test(t)))
    return ['tool'];
  if (SUPPRESSION.test(t)) return ['suppression'];
  if (c.own && LICENSE.test(t)) return ['license'];
  const found: Tag[] = [];
  if (c.doc) found.push('doc');
  if (TODO.test(t)) found.push('todo');
  if (RULE.test(t) || SHOUT.test(t)) found.push('rule');
  if (WORKAROUND.test(t)) found.push('workaround');
  if (LINK.test(t)) found.push('link');
  if (!c.doc && looksLikeCode(t)) found.push('code');
  if (DECORATION.test(t) || t.split('\n').some(ruled)) found.push('banner');
  if (!c.doc && (t.length > 300 || t.split('\n').length > 5))
    found.push('long');
  return found;
}

const COMMENT = '\u0000';
const ONLY_COMMENTS_IN_BRACES = '\u0001';

/**
 * The code with its comments taken out, and its spacing too, except the
 * indentation of a language that reads it. Braces that hold only comments
 * become a mark, since deleting a JSX comment takes its braces with it.
 */
export function bare(src: string, s: Syntax) {
  let code = '';
  let at = 0;
  for (const c of scan(src, s)) {
    code += src.slice(at, c.from) + COMMENT;
    at = c.to;
  }
  code += src.slice(at);
  if (s.js)
    code = code.replace(
      /\{[\s\u0000]*\u0000[\s\u0000]*\}/g,
      ONLY_COMMENTS_IN_BRACES,
    );
  code = code.replaceAll(COMMENT, '');
  if (s.line === '#')
    return code
      .split('\n')
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .join('\n');
  return code.replace(/\s+/g, '');
}

/** Whether two bare() results are the same code. */
export function sameCode(before: string, now: string) {
  let j = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === ONLY_COMMENTS_IN_BRACES) {
      if (now[j] === ONLY_COMMENTS_IN_BRACES) j++;
      else if (now.startsWith('{}', j)) j += 2;
    } else if (before[i] !== now[j++]) return false;
  }
  return j === now.length;
}

type Listed = {
  file: string;
  line: number;
  end: number;
  tags: Tag[];
  text: string;
  high: boolean;
};

const git = (...args: string[]) =>
  spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root(),
    encoding: 'utf8',
    maxBuffer: 1024 ** 3,
  });
const PLAIN_DIFF = ['--no-ext-diff', '--no-color'];

function movedFrom(since: string) {
  const oldPathOf = new Map<string, string>();
  for (const line of git(
    'diff',
    '--name-status',
    '-M',
    ...PLAIN_DIFF,
    since,
  ).stdout.split('\n')) {
    const [status, from, to] = line.split('\t');
    if (status?.startsWith('R')) oldPathOf.set(to, from);
  }
  return oldPathOf;
}

function changedLines(file: string, since: string, was = file) {
  if (git('cat-file', '-e', `${since}:${was}`).status !== 0) return null;
  const diff = git(
    'diff',
    '-U0',
    ...PLAIN_DIFF,
    `${since}:${was}`,
    `./${file}`,
  ).stdout;
  const ranges: [number, number][] = [];
  for (const m of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count) ranges.push([Number(m[1]), Number(m[1]) + count - 1]);
  }
  return ranges;
}

function list(paths: string[]) {
  const c = config();
  const ignored = c.comments.ignore.map(glob);
  const keep = c.comments.keep.map((re) => new RegExp(re));
  let since = '';
  let files: string[];
  let moved = new Map<string, string>();
  if (paths.length) {
    files = git(
      'ls-files',
      '--full-name',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...paths.map((p) => resolve(p)),
    )
      .stdout.split('\n')
      .filter(Boolean);
    const missing = paths.filter((p) => !existsSync(resolve(p)));
    if (missing.length || !files.length) {
      console.error(
        `No files here match ${(missing.length ? missing : paths).join(', ')}.`,
      );
      process.exit(1);
    }
  } else {
    since = output(['git', 'merge-base', c.base, 'HEAD']);
    if (!since) {
      console.error(
        `Can't find where this branch left ${c.base}. Fetch it, or name the files to read.`,
      );
      process.exit(1);
    }
    files = changedFiles();
    moved = movedFrom(since);
  }
  const listed: Listed[] = [];
  const unread: string[] = [];
  for (const file of [...new Set(files)].sort()) {
    const path = join(root(), file);
    if (!existsSync(path) || ignored.some((re) => re.test(file))) continue;
    const syntax = syntaxOf(file);
    if (!syntax) {
      unread.push(file);
      continue;
    }
    const ranges = since ? changedLines(file, since, moved.get(file)) : null;
    const high = tier([file]).tier === 'High';
    for (const comment of scan(readFileSync(path, 'utf8'), syntax)) {
      if (
        ranges &&
        !ranges.some(([a, b]) => comment.line <= b && comment.end >= a)
      )
        continue;
      listed.push({
        file,
        line: comment.line,
        end: comment.end,
        tags: tags(comment, keep),
        text: comment.text,
        high,
      });
    }
  }
  return { listed, unread, scope: paths.length ? 'files' : 'changed' };
}

function print({ listed, unread, scope }: ReturnType<typeof list>) {
  const where =
    scope === 'changed' ? 'on lines this branch changed' : 'in these files';
  if (!listed.length) console.log(`No comments ${where}.`);
  let file = '';
  const counts = new Map<string, number>();
  for (const c of listed) {
    if (c.file !== file) {
      file = c.file;
      console.log(
        `\n${file}${c.high ? ' (High: prove a claim before removing it)' : ''}`,
      );
    }
    const kinds = c.tags.length ? c.tags : ['plain'];
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    const [first, ...rest] = c.text.split('\n');
    const shown = first.length > 96 ? `${first.slice(0, 95)}…` : first;
    const lines = c.end > c.line ? `${c.line}-${c.end}` : `${c.line}`;
    console.log(
      `  ${lines.padEnd(9)} ${kinds.join(',').padEnd(12)} ${shown}${rest.length ? ` (+${rest.length} lines)` : ''}`,
    );
  }
  if (listed.length) {
    const files = new Set(listed.map((c) => c.file)).size;
    const kinds = [...counts].map(([k, n]) => `${n} ${k}`).join(', ');
    console.log(
      `\n${listed.length} comment${listed.length === 1 ? '' : 's'} ${where}, in ${files} file${files === 1 ? '' : 's'}: ${kinds}.`,
    );
  }
  if (unread.length)
    console.log(
      `Not read (a kind of file this script doesn't know): ${unread.join(', ')}`,
    );
}

function onlyComments() {
  const changed = [
    ...git(
      'diff',
      '--name-only',
      '--no-renames',
      ...PLAIN_DIFF,
      'HEAD',
    ).stdout.split('\n'),
    ...git(
      'ls-files',
      '--others',
      '--exclude-standard',
      '--full-name',
    ).stdout.split('\n'),
  ].filter(Boolean);
  if (!changed.length) {
    console.log('Nothing has changed since the last commit.');
    return;
  }
  const touched: string[] = [];
  let before = 0;
  let after = 0;
  for (const file of [...new Set(changed)]) {
    const old = git('show', `HEAD:${file}`);
    const path = join(root(), file);
    if (old.status !== 0 || !existsSync(path)) {
      touched.push(`${file} (added or deleted)`);
      continue;
    }
    const now = readFileSync(path, 'utf8');
    const syntax = syntaxOf(file);
    if (!syntax) {
      touched.push(`${file} (a kind of file this script doesn't know)`);
      continue;
    }
    before += scan(old.stdout, syntax).length;
    after += scan(now, syntax).length;
    if (!sameCode(bare(old.stdout, syntax), bare(now, syntax)))
      touched.push(file);
  }
  if (touched.length) {
    console.log('✗ More than comments changed since the last commit:');
    for (const f of touched) console.log(`  ${f}`);
    console.log(
      'Read `git diff` for each. A deleted comment can leave an empty pair of braces or a moved line that this script takes for a code change.',
    );
    process.exit(1);
  }
  console.log(
    `✓ Only comments changed since the last commit: ${before} before, ${after} now.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('comments.ts')) {
  const args = process.argv.slice(2);
  const unknown = args.find(
    (a) => a.startsWith('-') && a !== '--json' && a !== '--only-comments',
  );
  if (unknown) {
    console.error(
      `Unknown option ${unknown}. Usage: comments.ts [--json] [paths], or comments.ts --only-comments`,
    );
    process.exit(1);
  }
  if (args.includes('--only-comments')) onlyComments();
  else {
    const found = list(args.filter((a) => a !== '--json'));
    if (args.includes('--json')) console.log(JSON.stringify(found));
    else print(found);
  }
}
