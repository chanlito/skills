// Checks Khmer text before a person reads it.
//
//   bun scripts/check.ts               files this branch changes
//   bun scripts/check.ts a.md b.ts     these files instead
//   bun scripts/check.ts --all         every file with Khmer in it
//
// Errors (exit 1): typing mistakes that look right but break search, and
// words the glossary says to avoid. Warnings: invisible characters, and the
// glossary's numeral, quote and full stop choices. Then it lists the Khmer
// words that are new to the project (not in the base branch, the glossary or
// the word lists), so the person checks those spellings first.
//
// Settings come from "khmer" in show-your-work.json.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, glob, root } from './config';
import { changedFiles, output } from './git';
import { check, hasKhmer, readGlossary, words } from './khmer';

const args = process.argv.slice(2);
const all = args.includes('--all');
const named = args.filter((a) => !a.startsWith('--'));
const { base, khmer } = config();
const top = root();
// The glossary and this skill are full of wrong Khmer on purpose.
const self = relative(
  top,
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
);
const skip = [...khmer.ignore, khmer.glossary, `${self}/**`];
const matches = (file: string) =>
  khmer.files.some((g) => glob(g).test(file)) &&
  !skip.some((g) => glob(g).test(file));
const read = (file: string) => {
  const path = resolve(top, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const tracked = output(['git', '-c', 'core.quotePath=false', 'ls-files'], top)
  .split('\n')
  .filter(Boolean);
const missing = named.filter((file) => !existsSync(resolve(file)));
if (missing.length) {
  console.error(`Not found: ${missing.join(', ')}`);
  process.exit(2);
}
const files = (
  named.length
    ? named.map((f) => relative(top, resolve(f)))
    : (all ? tracked : changedFiles()).filter(matches)
).filter((file) => hasKhmer(read(file)));

const glossaryText = read(khmer.glossary);
const glossary = readGlossary(glossaryText);

// Words the project already uses: every Khmer word on the base branch, the
// glossary's approved words, and any word lists.
const known = new Set(glossary.approved);
const onBase = output(
  ['git', '-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', base],
  top,
)
  .split('\n')
  .filter((file) => file && matches(file));
const blobs = spawnSync('git', ['cat-file', '--batch'], {
  cwd: top,
  input: onBase.map((file) => `${base}:${file}`).join('\n'),
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
}).stdout;
for (const word of words(blobs ?? '')) known.add(word);
for (const list of khmer.wordlists)
  for (const word of read(list).split('\n'))
    if (word.trim()) known.add(word.trim());

if (!glossaryText)
  console.log(
    `No glossary at ${khmer.glossary}. Start one from the skill's glossary-template.md.\n`,
  );
if (!files.length) {
  console.log('No Khmer in the files to check.');
  process.exit(0);
}

let errors = 0;
let warnings = 0;
const fresh = new Map<string, string>();
for (const file of files) {
  const text = read(file);
  const issues = check(text, {
    numerals: khmer.numerals,
    quotes: khmer.quotes,
    avoid: glossary.avoid,
    approved: glossary.approved,
    prose: /\.(md|mdx|txt)$/.test(file),
  });
  if (issues.length) console.log(file);
  for (const issue of issues) {
    issue.level === 'error' ? errors++ : warnings++;
    const mark = issue.level === 'error' ? '✗' : '!';
    console.log(
      `  ${mark} ${issue.line}:${issue.col}  ${issue.text}  ${issue.message}`,
    );
  }
  text.split('\n').forEach((line, i) => {
    for (const word of words(line))
      if (!known.has(word) && !fresh.has(word))
        fresh.set(word, `${file}:${i + 1}`);
  });
}

if (fresh.size) {
  console.log(
    `\nNew to this project (${fresh.size}): check these spellings first.`,
  );
  for (const [word, where] of fresh) console.log(`  ${word}  ${where}`);
}
console.log(
  `\n${files.length} file${files.length === 1 ? '' : 's'}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${fresh.size} new word${fresh.size === 1 ? '' : 's'}.`,
);
process.exit(errors ? 1 : 0);
