# Comment review

You're reviewing the comments in a change you didn't write, before its code review. Judge each comment from the code alone. You delete comments and write a report. Every line of code stays exactly as it is, even where you think it should change: say so in a flag, and the author changes it. Leave your deletions uncommitted, because the author checks them against the last commit.

`$SKILL` is the folder this file is in. Run the commands with bun from the repo's root.

## 1. List the comments

```sh
bun $SKILL/scripts/comments.ts           # the branch: comments on lines it changed
bun $SKILL/scripts/comments.ts src/pay   # or the paths you were given
```

Each line is a comment with its file, line and a tag for what it looks like. The tag says where to look. Open each file and read the comment beside its code before you judge it. The script reads code the way a highlighter does, so now and then a listed line is text inside a string or a heredoc: that's code, and it stays. A file marked High handles something costly to get wrong.

## 2. Judge each one

### It stays, under a keep rule

A comment stays only when one of these fits. Name the rule in your report.

| Keep rule  | What it covers                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal`    | Licence and copyright headers.                                                                                                                                                                                        |
| `tool`     | A line a tool reads: formatter, compiler and bundler directives, shebangs, region markers, a migration's statement breaks, and anything the list tags `tool`.                                                         |
| `contract` | A doc comment on something exported for other code or other people: what it promises, its units, what it throws. One that only repeats the name and the types goes.                                                   |
| `outside`  | Why the code does something that looks wrong, when the reason is outside our code: how a vendor, platform, protocol or other system behaves, or a business rule or regulation. True today, on a path that still runs. |
| `link`     | A link to the issue, spec or RFC behind a constraint the code can't express.                                                                                                                                          |
| `config`   | In a config file, why a setting or an entry is there. A list of paths or flags can't explain itself.                                                                                                                  |
| `style`    | A suppression of a rule that is only about style, or is known to misfire, with its reason.                                                                                                                            |

### It goes

Everything else is deleted. The usual cases:

- **Narration:** it says what the next line does, or repeats a name.
- **Banners** and section dividers.
- **Commented-out code.** Git has it.
- **History:** where code moved from, what it used to do, the bug it fixed, an issue's play-by-play, a commit hash, a date, an author.
- **Notes to the reviewer:** "new", "changed", "as requested", "simplified".
- **Dead references:** to a doc, a file or a symbol that doesn't exist.
- **A long defence of odd code.** Delete it and flag the code.

When you're unsure whether a keep rule fits, it goes: git keeps the text, and the PR's diff shows every deletion to the person reviewing. A file marked High is the exception. There, a comment that claims something about how the code must behave, and that you can't prove wrong, stays under the keep rule `high`. Narration and the other usual cases go there too.

### It becomes a flag

A flag means the comment was covering for the code. Name the exact function, variable or line, and say in one line what should change.

| Flag          | When                                                                                                                                      | The comment                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `reshape`     | It explains something surprising that we wrote and could change: a magic number, an odd order, a name that misleads.                      | Delete it.                                            |
| `workaround`  | It excuses a patch: "for now", "hack", "too risky to change", a guard against a state that shouldn't happen.                              | Delete it.                                            |
| `todo`        | TODO or FIXME: work nobody tracks. Say what the work is.                                                                                  | Delete it.                                            |
| `suppression` | It turns off a rule that catches real bugs: a type error, an unhandled promise, a hook's dependencies, a security rule. Look the rule up. | Leave it: the checks need it until the code is fixed. |
| `rule`        | It tells people what to do: "do not remove", "keep in sync", "must run before", "ask someone first".                                      | Leave it, unless it's false.                          |

For a `rule`, read the code around it and follow the symbol it names, then report it as true, false or unproven, with what you checked. A false one is deleted.

To tell `outside` from `reshape`, ask whether we could change our own code so the comment isn't needed. If we could, it's `reshape`. If the reason lives somewhere we can't change, it's `outside`.

Flag only code inside the scope you were given, and say only what the code shows.

## 3. Delete

Delete each comment that goes, whole, with its markers and the empty line it leaves behind. Kept comments stay word for word.

## 4. Report

```
Removed: 14
Kept: 3
  src/pay/charge.ts:12    outside    the gateway rejects a capture without a hold
  src/pay/charge.ts:30    contract   what `charge()` throws
Flags:
  reshape      src/pay/retry.ts:40 `retry()`     3 is the gateway's limit: name it
  rule         src/sync/queue.ts:88 `flush()`    "ack only after flush": true (read `ack()`), nothing enforces it
  suppression  src/pay/total.ts:9 `sum()`        no-floating-promises: the write isn't awaited
Not judged: any file or comment you couldn't read, and why
```

Every listed comment is in exactly one place: removed, kept under a keep rule, flagged, or not judged. A flag says whether its comment was deleted or left.
