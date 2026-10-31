// An example skills.config.ts for a web app with an API and a database.
// Copy it to the root of your repo and change the paths to yours. Every
// field is optional; what's left out falls back to the defaults in
// shared/config.ts.
//
// The tier lists add to the defaults, which already cover CI, deploy files,
// secrets, migrations, auth, dependencies and agent config. List only what's
// special to your project, grouped under a comment saying why, so the next
// person can tell whether a new path belongs.
export default {
  // pr-writing runs these before every push, in order.
  checks: ['npm run lint', 'npm test', 'npm run build'],
  commits: 'conventional',
  preview: 'https://{branch}.my-site.pages.dev/',
  tiers: {
    high: [
      // Every request goes through it: CORS, headers, rate limits.
      'src/server.ts',
      // Takes people's money.
      'src/billing/**',
      // Sends email to real people.
      'src/mail/**',
    ],
    medium: [
      // Shared by every page: a mistake shows everywhere.
      'src/components/layout/**',
    ],
    low: [
      // Copy only: nothing runs differently.
      'content/**',
    ],
  },
  lessons: 'commit',
};
