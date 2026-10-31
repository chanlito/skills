---
name: khmer-writing
description: Write or translate Khmer (ខ្មែរ) text that reads like a Cambodian wrote it, following the project's glossary, then check it for typing mistakes and new words before a person reads it. Use whenever writing, translating or editing Khmer UI text, pages or articles.
---

# Khmer writing

Machine-made Khmer usually has the right words in the wrong shape: English sentences carried over word for word, with subjects dropped, a គឺ wherever English has "is", and phrases no Cambodian would say. The person reviewing it then spends their time on rewrites instead of choices. This skill writes from the meaning, follows the project's glossary, and runs a check so the person reads the draft only once the typos are out.

In the commands below, `$SKILL` is this skill's folder (for example `.claude/skills/khmer-writing`). Run them with bun from the repo's root.

## 1. Read the glossary and the lessons

- The glossary (`khmer.glossary` in `skills.config.ts`, `.agents/khmer-glossary.md` by default) holds the project's words and choices: which terms stay in English, numerals, quotes, register, names. Follow it. If there isn't one, copy this skill's `glossary-template.md` there and fill in what you know; leave the rest for the person.
- `bun $SKILL/scripts/lessons.ts` prints what earlier changes taught this skill here. Follow them.

## 2. Write from the meaning

Read the whole English passage, say to yourself what it means, then write that the way a Cambodian would say it to a friend who reads well. Don't translate sentence by sentence.

- **Give every clause its subject.** English drops nouns ("some are live"); Khmer can't: គម្រោងខ្លះ…, not ខ្លះ… on its own.
- **Leave out គឺ** unless you're defining something. "Two are for clients" is ពីរទៀតជាការងារឱ្យអតិថិជន…, not ពីរគឺសម្រាប់….
- **Say what's meant, not what's written.** "Only what I built" means "I only describe what I did": ខ្ញុំគ្រាន់តែរៀបរាប់ពីអ្វីដែលខ្ញុំបានធ្វើ.
- **Prefer verbs to noun piles.** ការធ្វើឱ្យប្រសើរឡើងនៃការអនុវត្ត is a translation; ធ្វើឱ្យលឿនជាងមុន is Khmer.
- **Pick one register and keep it.** ខ្ញុំ, polite but plain, for a personal site; no royal or ministry words (សូមគោរព…, ត្រូវបានអនុវត្ត…) unless the glossary says so. បាន and ត្រូវបាន only where they add meaning, not on every past-tense verb.
- **Keep terms people really use.** Developers in Cambodia say pull request, merge, build, deploy in English. Don't coin a Khmer word that no one would search for; the glossary lists which ones stay in Latin script.
- **Spaces mark phrases, not words.** Khmer runs words together and uses a space where a speaker would pause. Never type zero width spaces on the web; the browser finds word breaks itself.
- **Khmer punctuation:** ។ ends a sentence, ៕ ends a whole text (rare on the web), ៖ before a list or quote, «» for quotes when the glossary says so. No space before ។.
- **No italics.** Khmer has none; use bold for emphasis.
- **Short UI text** names the action like a Khmer app would (រក្សាទុក, បោះបង់, ចូល), not a description of it.
- **Names:** use the spelling in the glossary. A name that isn't there stays in Latin script and goes on the person's list.

## 3. Check it

```sh
bun $SKILL/scripts/check.ts            # files this branch changes
bun $SKILL/scripts/check.ts a.md b.ts  # or these
```

It finds the typing mistakes that look right on screen but break search and sorting (a vowel typed before a subscript, េ + ា for ោ, a mark twice, a coeng with nothing under it, invisible characters), words the glossary says to avoid, and the glossary's numeral, quote and full stop choices. Fix every ✗. Then it lists the Khmer words that are new to the project: not in the base branch, the glossary or the word lists (`khmer.wordlists`). Look at each one again. A new word is often fine, but it's where misspellings and made-up words hide.

A line with `khmer-check: ignore` in it is skipped, for examples of mistakes on purpose. `khmer.ignore` skips whole files.

## 4. Read it back

In a fresh context that hasn't seen the English (a subagent, given only the Khmer), translate the Khmer back into English. Compare it with the source:

- the meaning drifted: rewrite that line;
- the back-translation reads oddly literal ("some are running"): the Khmer is probably shaped like English; rewrite it;
- it matches: keep it.

This catches meaning; it can't tell you whether a Cambodian would say it that way. That's the person's call.

## 5. Hand it over

In the PR (or the reply), under **Wording to check**, list only what needs a native speaker's eye: new words from the check, terms you chose that aren't in the glossary, names, and any line you rewrote in step 4. Give the English next to each. Don't list everything.

## 6. Improve this skill

The glossary is how this skill learns the project's Khmer. Before calling the work done:

- **The person corrected a word or a phrase:** add a glossary row with their word under Khmer, yours under Avoid, and their reason, in the same PR. The check then flags your old word next time.
- **They corrected the shape of a sentence** (a rule, not one word): add it to the glossary's Style notes, in their words, with the before and after.
- **A step here was wrong, slow or missing:** `bun $SKILL/scripts/lessons.ts add "<what to do>" --pr <number>`.
- **A kind of typo got past the check:** add the test to `scripts/khmer.ts` upstream, in chanlito/skills.
- **A lesson or style note turned out wrong:** remove it (`bun $SKILL/scripts/lessons.ts drop <n>` for lessons).

## Settings

`khmer` in `skills.config.ts`, all optional:

- `glossary`: the glossary file (default `.agents/khmer-glossary.md`).
- `numerals`: `"khmer"` (១២៣), `"latin"` (123) or `"any"` (default).
- `quotes`: `"guillemets"` («») or `"any"` (default).
- `wordlists`: files with one known word per line, such as a dictionary list.
- `files`, `ignore`: globs of what to check and what to skip.
- `base`: the branch to compare with, for changed files and known words (top level, shared with the other skills).
