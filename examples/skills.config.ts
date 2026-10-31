// An example skills.config.ts for a web app with an API and a database.
// Copy it to the root of your repo and change the paths to yours. Every
// field is optional; what's left out falls back to the defaults in
// shared/config.ts. Group the paths in each tier under a comment saying why
// they're there, so the next person can tell whether a new path belongs.
export default {
  // pr-writing runs these before every push, in order.
  checks: ['npm run lint', 'npm test', 'npm run build'],
  commits: 'conventional',
  preview: 'https://{branch}.my-site.pages.dev/',
  tiers: {
    // The highest tier any changed file calls for wins.
    high: [
      // CI decides what gets merged and released.
      '.github/workflows/**',
      // How the app is built and run in production.
      'Dockerfile',
      'infra/**',
      // Secrets and runtime settings.
      '**/.env*',
      // A bad migration can lose data.
      '**/migrations/**',
      // Who is signed in and what they can reach.
      'src/auth/**',
      // Dependencies change what code runs everywhere.
      '**/package.json',
      'package-lock.json',
      // This file decides what the skills check.
      'skills.config.ts',
    ],
    medium: [
      // Instructions agents follow on every change: never Low.
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/**',
      '.agents/**',
    ],
    low: [
      // Docs and content only: nothing runs differently.
      '**/*.md',
      'docs/**',
    ],
  },
  lessons: 'commit',
};
