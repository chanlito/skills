// An example of a project's own page check, built on pr-proof's harness:
// it fails when a page scrolls sideways on a phone. Copy it next to your
// code, fix the import to where pr-proof is installed, and add it to
// "checks" in skills.config.ts:
//
//   "checks": ["npm test", "npm run build", "bun scripts/overflow-check.ts"]
//
// chanlito.dev grew a bigger one of these: every line of text on every page
// measured against the notebook rules its design is drawn on.

import {
  build,
  launch,
  open,
  pages,
  pool,
  serve,
} from '../skills/pr-proof/scripts/harness';

build();
const site = await serve();
const browser = await launch({ webgl: false });
const wide: string[] = [];
await pool(pages(), 6, async (path) => {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  try {
    await open(page, site.url + path);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    if (over > 0) wide.push(`${path} scrolls ${over}px sideways at 320px`);
  } finally {
    await page.close();
  }
});
await browser.close();
site.stop();
for (const line of wide) console.log(`✗ ${line}`);
console.log(wide.length ? '' : '✓ No page scrolls sideways at 320px.');
process.exit(wide.length ? 1 : 0);
