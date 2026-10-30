// What the check looks for in Khmer text: the typing mistakes that look fine
// on screen but break search and sorting, the style choices a project makes
// in its glossary (numerals, quotes, words to avoid), and words that are new
// to the project, so a person reads those first. Plain functions, no files.

export const COENG = 0x17d2;

type Kind =
  | 'consonant'
  | 'independent'
  | 'vowel'
  | 'sign'
  | 'coeng'
  | 'invisible'
  | 'other';

// Characters you can't see. Zero width spaces are how Word and LibreOffice
// mark Khmer word breaks, but on the web the browser finds the breaks itself,
// and a stray one breaks search and copy-paste.
const INVISIBLE: Record<number, string> = {
  0x200b: 'zero width space',
  0x200c: 'zero width non-joiner',
  0x200d: 'zero width joiner',
  0x2060: 'word joiner',
  0xfeff: 'zero width no-break space',
  0x00ad: 'soft hyphen',
  0x17b4: 'inherent vowel aq (never typed on purpose)',
  0x17b5: 'inherent vowel aa (never typed on purpose)',
};

function kindOf(cp: number): Kind {
  if (cp in INVISIBLE) return 'invisible';
  if (cp >= 0x1780 && cp <= 0x17a2) return 'consonant';
  if (cp >= 0x17a3 && cp <= 0x17b3) return 'independent';
  if (cp >= 0x17b6 && cp <= 0x17c5) return 'vowel';
  if (cp === COENG) return 'coeng';
  if ((cp >= 0x17c6 && cp <= 0x17d1) || cp === 0x17d3 || cp === 0x17dd)
    return 'sign';
  return 'other';
}

const isMark = (cp: number) => {
  const kind = kindOf(cp);
  return kind === 'vowel' || kind === 'sign' || kind === 'coeng';
};
const isLetter = (cp: number) => {
  const kind = kindOf(cp);
  return kind === 'consonant' || kind === 'independent';
};

/** True when the text has any Khmer letter in it. */
export const hasKhmer = (text: string) => /[ក-ឳ]/u.test(text);

// Two vowels typed one after the other that one code point already covers.
const SPLIT_VOWELS: [number, number][] = [
  [0x17c1, 0x17b6], // េ + ា should be ោ
  [0x17c1, 0x17b8], // េ + ី should be ើ
];

export type Issue = {
  /** 1-based line and column (in characters). */
  line: number;
  col: number;
  level: 'error' | 'warning';
  /** The text the issue is about. */
  text: string;
  message: string;
};

/** Problems inside one cluster (a letter with what's stacked and written on it). */
function clusterProblems(chars: number[]): string[] {
  const out: string[] = [];
  if (isMark(chars[0])) {
    out.push(
      'a vowel or sign with no letter under it (typed after a space or a non-Khmer character)',
    );
    return out;
  }
  for (let i = 0; i < chars.length; i++)
    if (chars[i] === COENG && !isLetter(chars[i + 1] ?? 0))
      out.push('a coeng (្) with no consonant after it');
  const vowel = chars.findIndex((cp) => kindOf(cp) === 'vowel');
  if (vowel >= 0 && chars.indexOf(COENG, vowel) > vowel)
    out.push(
      'a vowel typed before the subscript consonant; type the coeng and consonant first',
    );
  for (let i = 1; i < chars.length; i++) {
    const [a, b] = [chars[i - 1], chars[i]];
    if (a === b && isMark(a) && a !== COENG)
      out.push(`the same mark twice (${String.fromCodePoint(a)})`);
    if (SPLIT_VOWELS.some(([x, y]) => x === a && y === b))
      out.push(
        `two vowels where one exists (${String.fromCodePoint(a, b)}); use ${b === 0x17b6 ? 'ោ' : 'ើ'}`,
      );
  }
  return [...new Set(out)];
}

/** Splits a line into clusters with where each starts, in characters. */
function clusters(line: string) {
  const out: { chars: number[]; text: string; col: number }[] = [];
  let col = 0;
  let previous = -1;
  const all = [...line];
  for (const [n, char] of all.entries()) {
    const cp = char.codePointAt(0)!;
    const current = out.at(-1);
    const onKhmer =
      current !== undefined &&
      (isLetter(current.chars[0]) || isMark(current.chars[0]));
    // ZWJ and ZWNJ may sit inside a Khmer syllable, before a vowel.
    const joiner =
      (cp === 0x200c || cp === 0x200d) &&
      isMark(all[n + 1]?.codePointAt(0) ?? 0);
    const joins =
      onKhmer && (isMark(cp) || joiner || (previous === COENG && isLetter(cp)));
    if (joins) {
      current!.chars.push(cp);
      current!.text += char;
    } else out.push({ chars: [cp], text: char, col });
    previous = cp;
    col++;
  }
  return out;
}

export type Style = {
  numerals: 'khmer' | 'latin' | 'any';
  quotes: 'guillemets' | 'any';
  /** Words to avoid, each with what to write instead. */
  avoid: Map<string, string>;
  /** The glossary's approved words; an avoided word inside one is fine. */
  approved?: Iterable<string>;
  /** Prose files get the quote and full stop checks; code has its own quotes. */
  prose: boolean;
};

const KHMER_LETTER = /[ក-៝]/u;

/** A line with this in it isn't checked (for examples of mistakes). */
export const IGNORE = 'khmer-check: ignore';

const segmenter = new Intl.Segmenter('km', { granularity: 'word' });

/** Every issue in a text, line by line. */
export function check(text: string, style: Style): Issue[] {
  const issues: Issue[] = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (!hasKhmer(line) || line.includes(IGNORE)) return;
    const at = (
      col: number,
      level: Issue['level'],
      text: string,
      message: string,
    ) => issues.push({ line: index + 1, col: col + 1, level, text, message });
    const chars = [...line];

    for (const cluster of clusters(line)) {
      const cp = cluster.chars[0];
      if (cp in INVISIBLE && cluster.chars.length === 1) {
        at(
          cluster.col,
          'warning',
          `U+${cp.toString(16).toUpperCase()}`,
          INVISIBLE[cp],
        );
        continue;
      }
      if (!isLetter(cp) && !isMark(cp)) continue;
      // A mark on its own in quotes, or on a dotted circle, is the mark
      // itself being shown or typed, not a mistake.
      const before = chars[cluster.col - 1] ?? '';
      if (isMark(cp) && /['"`‘’“”◌]/.test(before)) continue;
      for (const problem of clusterProblems(cluster.chars))
        at(cluster.col, 'error', cluster.text, problem);
    }

    // Numbers next to Khmer words: the glossary picks one kind.
    const near = (from: number, step: number) => {
      for (
        let i = from, n = 0;
        i >= 0 && i < chars.length && n < 2;
        i += step, n++
      )
        if (chars[i] !== ' ') return KHMER_LETTER.test(chars[i]);
      return false;
    };
    const digits =
      style.numerals === 'khmer'
        ? /[0-9]+/g
        : style.numerals === 'latin'
          ? /[០-៩]+/g
          : null;
    if (digits)
      for (const match of line.matchAll(digits)) {
        const start = [...line.slice(0, match.index)].length;
        const end = start + [...match[0]].length;
        // Part of a name or a code (3D, 4K, +855, v2, 10%) stays as it is.
        const glued =
          /[A-Za-z+#$€%._:/-]/.test(chars[start - 1] ?? '') ||
          /[A-Za-z%_:/-]/.test(chars[end] ?? '') ||
          /[.,]\d/.test(`${chars[end] ?? ''}${chars[end + 1] ?? ''}`);
        if (!glued && (near(start - 1, -1) || near(end, 1)))
          at(
            start,
            'warning',
            match[0],
            style.numerals === 'khmer'
              ? 'Latin digits in Khmer prose; this project writes Khmer numerals (០-៩)'
              : 'Khmer numerals; this project writes Latin digits in Khmer',
          );
      }

    // The prose checks are for Khmer sentences, not a Khmer word quoted in
    // an English or Spanish one.
    const khmerLetters = (line.match(/[\u1780-\u17b3]/gu) ?? []).length;
    const latinLetters = (line.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
    if (style.prose && khmerLetters > latinLetters) {
      for (const match of line.matchAll(/[ក-៝0-9០-៩]\.(?=\s|$)/gu)) {
        // "១. " or "១.២." starting a list item, heading or table cell is
        // numbering, not a sentence.
        if (
          /(?:^|\|)\s*(?:[#>*-]+\s*)*[0-9០-៩]+(?:\.[0-9០-៩]+)*$/.test(
            line.slice(0, match.index! + 1),
          )
        )
          continue;
        at(
          [...line.slice(0, match.index)].length + 1,
          'warning',
          '.',
          'a Latin full stop after Khmer; Khmer ends a sentence with ។',
        );
      }
      if (style.quotes === 'guillemets')
        for (const match of line.matchAll(/["“”](?=[ក-៝])|(?<=[ក-៝។])["“”]/gu))
          at(
            [...line.slice(0, match.index)].length,
            'warning',
            match[0],
            'straight or curly quotes around Khmer; this project uses «»',
          );
    }
    for (const match of line.matchAll(/ +។/g))
      at(
        [...line.slice(0, match.index)].length,
        'warning',
        '␠។',
        'a space before ។',
      );

    for (const [word, instead] of style.avoid) {
      const better = [
        ...instead.split(', ').filter(Boolean),
        ...(style.approved ?? []),
      ].filter((w) => w.length > word.length && w.includes(word));
      for (
        let i = line.indexOf(word);
        i >= 0;
        i = line.indexOf(word, i + word.length)
      ) {
        // Half a syllable (សុ before a vowel), or part of an approved word
        // (ប្រើ in ប្រើប្រាស់), isn't the avoided word.
        const next = line.codePointAt(i + word.length) ?? 0;
        if (isMark(next) || word.endsWith('\u17d2')) continue;
        const inside = better.some((w) => {
          for (let j = line.indexOf(w); j >= 0; j = line.indexOf(w, j + 1))
            if (j <= i && i + word.length <= j + w.length) return true;
          return false;
        });
        if (inside) continue;
        at(
          [...line.slice(0, i)].length,
          'error',
          word,
          `the glossary says to avoid this${instead ? `; write ${instead}` : ''}`,
        );
      }
    }
  });
  return issues;
}

/** The Khmer words in a text, as the browser splits them. */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const part of segmenter.segment(text))
    if (part.isWordLike && hasKhmer(part.segment)) out.push(part.segment);
  return out;
}

/**
 * Reads a Markdown glossary: every table with a Khmer column. Returns the
 * Khmer words it approves, and the words to avoid with what to write instead.
 * Cells can hold several words split by commas or slashes; backticks and
 * bold are ignored.
 */
export function readGlossary(markdown: string) {
  const approved = new Set<string>();
  const avoid = new Map<string, string>();
  let header: string[] | null = null;
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const split = (cell: string) =>
    cell
      .replace(/[`*_]/g, '')
      .split(/[,/、;]/)
      .map((w) => w.trim())
      .filter((w) => w && hasKhmer(w));
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) {
      header = null;
      continue;
    }
    const row = cells(line);
    if (!header) {
      header = row.map((c) => c.toLowerCase());
      continue;
    }
    if (row.every((c) => /^:?-+:?$/.test(c))) continue;
    const khmer = header.findIndex(
      (c) => c.includes('khmer') || c.includes('ខ្មែរ'),
    );
    const not = header.findIndex(
      (c) => c.startsWith('avoid') || /^(not|don.?t)\b/.test(c),
    );
    const use = khmer >= 0 ? split(row[khmer] ?? '') : [];
    for (const word of use) {
      approved.add(word);
      for (const part of words(word)) approved.add(part);
    }
    if (not >= 0)
      for (const word of split(row[not] ?? '')) avoid.set(word, use.join(', '));
  }
  return { approved, avoid };
}
