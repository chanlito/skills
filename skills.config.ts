// This repo's own settings for its skills. Every field is optional; what's
// left out uses the defaults in shared/config.ts.
export default {
  // pr-writing runs these before every push.
  checks: ['bun run format:check', 'bun run check'],
  // Commits on main start with a gitmoji. So does a PR's title, which a
  // squash merge of several commits takes as the commit subject.
  commits: 'gitmoji',
  comments: {
    ignore: [
      // Copies of shared/, made by `bun run sync`: judge the original.
      'skills/*/scripts/config.ts',
      'skills/*/scripts/git.ts',
      'skills/*/scripts/lessons.ts',
      'skills/*/scripts/tier.ts',
    ],
  },
};
