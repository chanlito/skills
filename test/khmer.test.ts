import { expect, test } from 'bun:test';
import {
  check,
  readGlossary,
  words,
} from '../skills/khmer-writing/scripts/khmer';

const style = {
  numerals: 'khmer' as const,
  quotes: 'guillemets' as const,
  avoid: new Map([['អ្នកតំណាង', 'ភ្នាក់ងារ AI']]),
  prose: true,
};
const messages = (text: string) => check(text, style).map((i) => i.message);

test('check: clean Khmer has no issues', () => {
  expect(check('សួស្ដី ខ្ញុំឈ្មោះ Chanlito។', style)).toEqual([]);
});

test('check: typing mistakes that look right are errors', () => {
  const found = check('កេាះ កុ្រ សាា', style);
  expect(found.every((i) => i.level === 'error')).toBe(true);
  expect(found.map((i) => i.text)).toEqual(['កេាះ', 'កុ្រ', 'សាា']);
});

test('check: a mark shown on its own in quotes is not a mistake', () => {
  expect(check("const KEYS = ['ប', '្', 'រ'];", style)).toEqual([]);
  expect(check('ក ា', style)[0].message).toContain('no letter under it');
});

test('check: the glossary choices are warnings', () => {
  const found = messages('ខ្ញុំធ្វើការ 10 ឆ្នាំ.\nគាត់ថា "សួស្ដី" ។');
  expect(found.some((m) => m.includes('Latin digits'))).toBe(true);
  expect(found.some((m) => m.includes('full stop'))).toBe(true);
  expect(found.some((m) => m.includes('quotes'))).toBe(true);
  expect(found.some((m) => m.includes('space before'))).toBe(true);
});

test('check: a Khmer word in an English sentence is left alone', () => {
  expect(check('The Khmer word for hello is សួស្ដី.', style)).toEqual([]);
});

test('check: avoided words and ignored lines', () => {
  expect(messages('អ្នកតំណាង')[0]).toContain('ភ្នាក់ងារ AI');
  expect(check('អ្នកតំណាង // khmer-check: ignore', style)).toEqual([]);
});

test('words: splits Khmer into words and skips Latin', () => {
  expect(words('ខ្ញុំជាអ្នកដឹកនាំ TypeScript')).toEqual([
    'ខ្ញុំ',
    'ជា',
    'អ្នកដឹកនាំ',
  ]);
});

test('readGlossary: approved words and words to avoid', () => {
  const { approved, avoid } = readGlossary(
    '| English | Khmer | Avoid |\n| --- | --- | --- |\n| agent | `ភ្នាក់ងារ` AI | អ្នកតំណាង, តំណាង |',
  );
  expect(approved.has('ភ្នាក់ងារ')).toBe(true);
  expect(avoid.get('តំណាង')).toBe('ភ្នាក់ងារ AI');
});

test('check: digits that belong to a name or code are left alone', () => {
  expect(check('អេក្រង់ 4K និងលេខ +855 ហើយ 3D', style)).toEqual([]);
  expect(check('ទំហំ 32 អ៊ីញ', style)[0].text).toBe('32');
});
