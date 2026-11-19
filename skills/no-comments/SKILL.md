---
name: no-comments
description: Clear the comments out of a change before it is reviewed. A reviewer who didn't write them deletes what the code already says, and what's left becomes clearer code, a type or a test, or one line about something the code can't say. Use before the code review of a pull request, and when asked to remove, clean up or review comments.
---

# No comments

A comment is a claim nothing checks. It was true the day it was written, then the code moved on. Whoever wrote it is the wrong one to judge it, because an author defends their own comments. So this skill hands a change's comments to a reviewer who has never seen them, with a short list of what may stay. A comment that explained something odd becomes a fix to the code. A comment that stated a rule ("do not remove") becomes a type or a test, because a rule in a comment is a rule nobody enforces.

Run it once the change works and before the **pr-risks** reviews, so they read the code as it will merge.

In the commands below, `$SKILL` is this skill's folder (for example `.claude/skills/no-comments`). Run them with bun from the repo's root.

## 1. Read the lessons

`bun $SKILL/scripts/lessons.ts` prints what earlier changes taught this skill in this project. Follow them.

## 2. List the comments

Commit the change first, so this pass gets a diff of its own. Then:

```sh
bun $SKILL/scripts/comments.ts           # comments on the lines this branch changed
bun $SKILL/scripts/comments.ts src/pay   # or every comment in these files and folders
```

It prints each comment with its file and line, tagged by what it looks like: `suppression`, `rule`, `todo`, `workaround`, `code` (commented out), `banner`, `doc`, `link`, `license`, `tool`, `long`, or `plain`. A tag says where to look; the reviewer still reads the comment. Files that make the change High (the pr-risks tiers) are marked.

The pass covers the comments this branch added or changed. Older comments on lines it didn't touch get a cleanup PR of their own: name the files to run one.

When it lists none, report `Comments: none added` (step 7) and stop here.

## 3. Hand them to a fresh reviewer

Start the reviewer in a fresh context: a subagent that hasn't seen this session, the way pr-risks runs its first review. Give it two things: this skill's `reviewer.md` as its instructions, and the scope (the branch, or the paths you named). It judges each comment from the code, without your reasons for writing it.

`reviewer.md` holds the rules: what stays (the keep rules), what goes, and what becomes a flag. The reviewer deletes comments, leaves the code as it is and its deletions uncommitted, and returns a report: what it removed, what it kept and under which keep rule, and its flags.

## 4. Check its work

```sh
bun $SKILL/scripts/comments.ts --only-comments
```

It fails when more than comments and spacing changed since the last commit, and names the files. Read `git diff` for each one and undo any edit to code. The script reads code the way a highlighter does, so a deleted comment can leave something behind that it takes for a code change, like an empty pair of braces: when the diff shows only comments went, carry on. Then read the report against `reviewer.md`:

- **Kept, and no keep rule fits:** delete it.
- **Deleted, though a keep rule fits** (a licence header, a line a tool reads): put it back.
- **A flag about code outside the change**, or one that claims something the code doesn't show: drop the flag.

When most of the report is wrong, `git restore .` and run one more fresh reviewer, telling it what the first got wrong. When the second is wrong too, restore again, stop, and report that the pass didn't hold (step 7).

Run the project's formatter and commit the deletions on their own, so the person reviewing the PR can read them apart from the change.

## 5. Fix what the flags point at

A flag means the comment was covering for the code. It names the function, variable or line, and its kind:

| Flag          | The comment was                                 | What to do                                                                      |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `reshape`     | explaining something surprising in our own code | Make the code say it: a truer name, a named constant or function, a type.       |
| `workaround`  | excusing a patch over a problem                 | Fix the problem where it starts, and take the patch out.                        |
| `suppression` | turning off a rule that catches real bugs       | Fix what the rule complains about, then delete the suppression.                 |
| `todo`        | work nobody tracks                              | Do it when it's small. Otherwise leave it deleted and list it as open (step 7). |
| `rule`        | telling the next person what to do              | Step 6.                                                                         |

Make each fix the smallest one that leaves nothing to explain, in files the branch already changes. The comment stays deleted. When the real fix is bigger than that, do the part that fits and list the rest as open. In a file that makes the change High, keep to what its tests already cover, such as a rename or an extraction, and list anything more.

These fixes are part of the change: the project's checks (pr-writing) and the reviews (pr-risks) cover them like the rest of it.

## 6. Turn rules into checks

A `rule` flag is a comment that tells people what to do: "do not remove", "keep in sync with", "must run before". The reviewer left it in place and said whether it's true.

1. **Confirm it's still true.** Read the code around it, follow the symbol it names, and read the commit and PR that added it (`git log -S"<a phrase from it>"`). A stale rule is deleted.
2. **Enforce it** with the cheapest thing that fails when the rule is broken, in this order: a type that makes the wrong call not compile, a test named after the rule, a lint rule the project already has. Break the rule once to watch it fail, then delete the comment.
3. **Leave it to a person** when enforcing it takes a new dependency, a new entry in `checks`, or files the branch doesn't touch. Keep the comment, cut to one line, and list it as an unenforced rule (step 7).

A rule you can't confirm either way is deleted and listed as open. In a file that makes the change High it stays, and is listed.

## 7. Report it on the PR

Add one item to the PR's Review section (the pr-writing skill), with the counts, each fix, each rule that became a check, and everything left open. `comments.ts` run again gives the count of what's left.

```md
- [x] Comments: 14 removed, 3 kept (2 `outside`, 1 `contract`). `retryDelay` renamed so its comment could go. "Capture only after a hold" is now the test `captures only after a hold`. Open: `src/sync/queue.ts:88` (ack after flush) is an unenforced rule; the TODO at `src/sync/queue.ts:120` (retry on 429) was removed undone.
```

Open items stay on the PR for the person to decide what happens to them.

## 8. Improve this skill

Before calling the work done, ask what this pass taught:

- **The reviewer removed a comment this project needs**, or the list is full of comments a tool writes: add the pattern to `comments.keep`, or the files to `comments.ignore`, in `skills.config.ts`, under a comment saying why. That's a change to the project, so it goes in the PR. A pattern most projects would want belongs in the defaults upstream, in chanlito/skills.
- **A step here was wrong, slow or missing**, or the script missed or invented a comment: add a lesson with `bun $SKILL/scripts/lessons.ts add "<what to do>" --pr <number>`.
- **A person corrected what stays or goes:** add a lesson, in their words.
- **A lesson is now covered by the config or turned out wrong:** `bun $SKILL/scripts/lessons.ts drop <n>`.

Each lesson is one line about what to do, not the story of what went wrong. Where they're kept depends on `lessons` in `skills.config.ts`: in this clone only (`local`, the default), committed and reviewed in PRs (`commit`), or nowhere (`off`). A fix that would help every project belongs upstream, in chanlito/skills.

## Settings

`skills.config.ts` at the repo root, all optional:

- `base`: the branch to compare with (`origin/main`).
- `comments.ignore`: globs of files whose comments are left alone, added to the defaults (generated and vendored code; see `scripts/config.ts`).
- `comments.keep`: regular expressions for comments a tool or a project rule reads, like `"^i18n:"`. They're listed as `tool` and stay.
- `tiers.high`: which files make a change High (shared with pr-risks). In those, a comment the reviewer can't prove wrong stays.
