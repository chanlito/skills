import { expect, test } from 'bun:test';
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
