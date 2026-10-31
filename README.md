# skills

Agent skills for shipping changes you can show your work on. They're for Claude Code and any other agent that reads `SKILL.md` skills.

```sh
npx skills add chanlito/skills
```

| Skill             | What it does                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pr-writing**    | Checks a branch before every push (branch name, commit format, your project's checks), then writes the PR from your template: the preview link at the top, a small picture of the change, before and after, and how hard it is to undo.                                                             |
| **pr-proof**      | Screenshots each changed page in every language, light and dark, desktop and phone, before and after, zoomed in on the change, with a ring or an arrow and note only when it's hard to spot. Then it links them in the PR.                                                                          |
| **pr-risks**      | Ranks a change Low, Medium or High from the paths it touches, and says which reviews that tier gets.                                                                                                                                                                                                |
| **khmer-writing** | Writes and translates Khmer from the meaning instead of word for word, follows your project's Khmer glossary, then checks the text for typing mistakes that look right but break search, words the glossary avoids, and words that are new to the project, so a native speaker only reads for tone. |

Take them all, or only the ones you want: `npx skills add chanlito/skills --skill pr-proof`.

## Why

Green checks prove that nothing a test knew about broke. They don't prove the change works. These skills make an agent leave something a person can look at: a contact sheet of the page before and after, zoomed in on the change, a risk tier with its reason, and a PR that puts the preview link where nobody has to look for it.

They grew out of building [chanlito.dev](https://chanlito.dev) with agents. The story behind them is in [The scripts I should have written first](https://chanlito.dev/articles/the-scripts-i-should-have-written-first/).

pr-writing's Summary picture, before-and-after Evidence and Merge danger (the door and the blast radius) are adapted from the [`pr` skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md) in Matt Pocock's [skills](https://github.com/mattpocock/skills) (MIT).

## They get better as you use them

Each skill ends with "Improve this skill". Before it calls a change done, the agent asks what the change taught:

- **A bug got past the checks**: it becomes a check (a script in your project, added to `checks`).
- **Something cost a retry or a workaround**: it becomes a lesson, one dated line about what to do.
- **You corrected how it works**: a lesson, in your words.
- **A lesson is now handled by a check, or turned out wrong**: it's dropped.

Each skill keeps at most 12 lessons, so they turn into checks and steps instead of piling up. Lessons are kept apart from the skill, so `npx skills update` never wipes them. Where they live is up to you:

| `lessons`         | Where                                         | Good for                                                             |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `local` (default) | inside `.git` in this clone; never committed  | trying it out, or when you don't want lesson commits in your history |
| `commit`          | `.agents/lessons/<skill>.md`, reviewed in PRs | teams and cloud agents that start from a fresh clone each time       |
| `off`             | nowhere                                       | when you only want the scripts                                       |

## Setup

The scripts run with [bun](https://bun.sh). pr-proof also needs Playwright and its Chromium:

```sh
bun add -d playwright   # or npm i -D playwright
npx playwright install chromium
```

Then add a `skills.config.ts` at the root of your repo, so each setting can say why it's there. Every field is optional. `skills.config.json` works too, and so does the old name, `show-your-work.json`. A site with English at `/` and French at `/fr/`, deployed per branch:

```ts
export default {
  checks: ['npm run lint', 'npm test', 'npm run build'],
  commits: 'conventional',
  preview: 'https://{branch}.my-site.pages.dev/',
  tiers: {
    // Added to the defaults (CI, deploy, secrets, migrations, auth,
    // dependencies), so only list what's special to this project.
    high: [
      // Takes people's money.
      'src/billing/**',
    ],
  },
  site: {
    build: 'npm run build',
    dist: 'dist',
    pages: ['/', '/pricing/'],
    languages: { default: 'en', prefixed: ['fr'] },
    fakes: { '/api/me': { GET: { name: 'Ada' } } },
  },
  lessons: 'local',
};
```

[`examples/skills.config.ts`](examples/skills.config.ts) is a fuller one, with a comment on why each path is in its tier.

Last, tell your agents to use them, in `AGENTS.md` or `CLAUDE.md`:

```md
Every change goes through the pr-writing, pr-risks and pr-proof skills before its PR.
```

### All the settings

| Setting                           | Default                                                    | What it is                                                                                          |
| --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `base`                            | `origin/main`                                              | What the branch is compared with.                                                                   |
| `checks`                          | `[]`                                                       | Commands that must pass before a push, in order.                                                    |
| `branch.pattern`                  | `type/short-name`                                          | What a branch name should look like (a warning).                                                    |
| `branch.forbid`                   | none                                                       | Branch names that fail the check.                                                                   |
| `commits`                         | `conventional`                                             | `conventional`, `gitmoji` (`✨ feat(scope): message`), `any`, or a regular expression.              |
| `preview`                         | none                                                       | The preview URL, with `{branch}` as the branch name in dashes.                                      |
| `template`                        | `.github/pull_request_template.md`                         | The PR template. pr-writing has its own for when there's none.                                      |
| `tiers.high` / `medium` / `low`   | CI, deploy, secrets, data, auth, deps / agent files / docs | Globs, added to the defaults. The highest tier any file calls for wins; anything not Low is Medium. |
| `tiers.defaults`                  | `true`                                                     | `false` to use only your own lists.                                                                 |
| `tiers.reasons` / `reviews`       | see `shared/config.ts`                                     | The words for each tier.                                                                            |
| `tiers.label`                     | `risk:{tier}`                                              | The PR label, or `""` for none.                                                                     |
| `site.build` / `dist`             | `npm run build` / `dist`                                   | How to build the site and where its pages land.                                                     |
| `site.sources`                    | `src`, `public`, package files                             | What the build reads, to know when to rebuild.                                                      |
| `site.pages`                      | `["/"]`                                                    | What pr-proof shoots when no pages are named.                                                       |
| `site.languages`                  | `{ "default": "en", "prefixed": [] }`                      | Languages served under `/<lang>/`.                                                                  |
| `site.fakes`                      | `{}`                                                       | Made-up JSON for API paths, by method (`*` for any).                                                |
| `site.chromium`                   | `[]`                                                       | Extra Chromium flags.                                                                               |
| `proof.branch`                    | `pr-proof`                                                 | Where screenshots are pushed. Made on first use, with no history of its own.                        |
| `proof.image`                     | `https://raw.githubusercontent.com/{repo}/{branch}/{path}` | The image link. Private repos need `https://github.com/{repo}/blob/{branch}/{path}?raw=true`.       |
| `lessons`                         | `local`                                                    | `local`, `commit` or `off`.                                                                         |
| `lessonsDir` / `maxLessons`       | `.agents/lessons` / `12`                                   | Where committed lessons go, and how many each skill keeps.                                          |
| `khmer.glossary`                  | `.agents/khmer-glossary.md`                                | khmer-writing's glossary. Start from `skills/khmer-writing/glossary-template.md`.                   |
| `khmer.numerals` / `khmer.quotes` | `any` / `any`                                              | `khmer` or `latin` digits in Khmer prose; `guillemets` for «».                                      |
| `khmer.wordlists`                 | `[]`                                                       | Files of known words, one per line.                                                                 |
| `khmer.files` / `khmer.ignore`    | source and content files / `[]`                            | What the Khmer check reads, and what it skips.                                                      |

pr-proof works with anything that builds to static HTML: Astro, Vite, Next.js static export, Eleventy, Hugo. `examples/overflow-check.ts` shows how to write your own page check on its harness.

## Contributing

Each skill is installed on its own, so it carries its own copy of the shared code. Edit `shared/`, then run `bun run sync`. `bun run check` checks the copies match, type-checks and runs the tests.

## License

MIT
