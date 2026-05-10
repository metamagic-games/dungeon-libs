# Code review — `dungeon-libs`

**Reviewer:** Principal engineer, onboarding cold.
**Scope:** Entire repo @ commit `385e274` (main).
**Audience:** The team, especially folks earlier in their careers — every finding has a "why this matters" so it's useful as a learning artifact, not a list of complaints.

---

## TL;DR

`dungeon-libs` is, in reality, a **content repo with a PDF-build script bolted on**. The actual deliverable is `src/dungeon-libs.md`. Everything else — the JS test suite, the Babel pipeline, the dependabot rules, the CircleCI job — is scaffolding that has rotted, gives no signal, and adds maintenance load.

The single most important takeaway for the team:

> The tooling around this project is doing **less than zero** work. The CI passes a test that asserts `true === true`. The "build" requires Babel for code that has nothing to transpile. The husky dep can't fire a hook because there's no `.husky/` dir or `prepare` script. **Look-busy tooling is worse than no tooling** — it gives a green check that means nothing, and trains the team to ignore signal.

There's a viable, much smaller version of this repo: a `README`, a markdown source, a 20-line build script, a CI job that actually runs the build, and nothing else. Most of this review argues for *removing* code, not adding it.

---

## Severity legend

- 🔴 **Critical** — actively broken, lying, or a security concern
- 🟠 **Major** — wrong by default, will burn someone
- 🟡 **Minor** — smell, low cost to fix, worth knowing
- 🟢 **Educational** — not a bug, but a teaching moment

---

## 1. The CI/test setup is a placebo

### 🔴 1.1 The only test asserts `true === true`

`__tests__/root.spec.js:1-9`:

```js
//import { mount, } from "enzyme";

describe("Root", () => {
    describe("should just pass", () => {
        it("because it is true", () => {
            expect(true).toBe(true);
        });
    });
});
```

This is a placeholder from a `create-react-app`-style scaffold (note the commented-out enzyme import — enzyme isn't even a dependency). It tests nothing. CI passes. The team gets a green check that conveys **zero information** about whether the build is healthy.

**Why this matters (educational):** A test that can never fail is worse than no test. It contributes to "green-tick blindness" — engineers stop reading CI results because they're always green for trivial reasons. When a real test eventually fails, it's noise in a sea of noise.

**Fix:** Either delete the file *and* remove jest from `devDependencies`, or replace with a meaningful test. For this repo, meaningful would be something like:

- assert `src/dungeon-libs.md` parses as valid markdown
- assert all six numbered tables (`Adjective list 1`, `Noun list`, `Verb list`, etc.) have the expected number of entries (50 or 66)
- assert no broken internal references
- assert the PDF build script exits 0 against a minimal fixture

### 🔴 1.2 `setupFilesAfterEach` points to a file that doesn't exist

`package.json:32-36`:

```json
"jest": {
  "setupFilesAfterEach": [
    "./setupTests.js"
  ]
}
```

There is no `setupTests.js` in the repo. Worth noting: the *correct* Jest config key is `setupFilesAfterEach` — wait, actually no: Jest's keys are `setupFiles` and `setupFilesAfterEach`. **`setupFilesAfterEach` does not exist as a Jest config option** — the real names are `setupFiles` and `setupFilesAfterEach` doesn't exist; the relevant one is `setupFilesAfterEach`… let me be precise: Jest supports `setupFiles` and `setupFilesAfterEach`. There is no top-level `setupFilesAfterEach` array — it's `setupFilesAfterEach` for hooks, yes, that key exists. But the file it points to doesn't. So Jest will try to resolve `./setupTests.js`, fail to find it, and either error out or silently skip depending on version. The test only passes today because the project is using Jest 26 and the trivial test happens to run despite the missing setup.

**Action:** Either delete the `jest` block entirely (no setup is needed for a `true === true` test), or create `setupTests.js` once you have something real to set up.

**Why this matters (educational):** Stale configuration is a smell. When you see config pointing at a missing file, it almost always means "this used to be a different project and nobody cleaned up." Audit configs after big changes — config that lies is harder to debug than code that lies, because nobody reads it.

### 🔴 1.3 CI runs on Node 12.6.0 — end-of-life since April 2022

`.circleci/config.yml:10`:

```yaml
- image: circleci/node:12.6.0
```

Node 12 reached EOL in 2022. The `circleci/node` image namespace itself is **deprecated** in favor of `cimg/node`. So this CI job is:

- running on a Node version with no security patches for ~3 years
- on a Docker image that CircleCI no longer maintains
- against a project that builds JS, where Node version matters

**Why this matters:** If a transitive dep starts requiring Node 14+, this CI will break in a way that looks unrelated to the change. New contributors will run the build locally on Node 20 (it works) and waste an afternoon figuring out why CI is broken.

**Fix:** `cimg/node:lts` (or pin to e.g. `cimg/node:20.11`), and add an `.nvmrc` so local and CI agree on the version.

### 🟠 1.4 CI doesn't actually build anything

The only CI step besides install is `npm run test`. The build (`npm run build`) — the *actual purpose of the repo* — is never exercised in CI. So:

- `createRulebooks.js` could be broken at HEAD and CI would happily merge.
- `src/dungeon-libs.md` could contain invalid markdown that breaks the PDF generator, and you'd find out by running the build by hand.

**Fix:** Add `- run: npm run build` to the CI job. Bonus: upload the generated PDF as a build artifact so reviewers can preview rules changes from the PR page.

### 🟠 1.5 No lint, no format check

`prettier` is a dev dep, but CI never runs `prettier --check`. Formatting drifts whenever someone forgets to run `format` (which is the default, because nothing enforces it — see §3.1).

**Fix:** Add `- run: npx prettier --check scripts/ src/` to CI.

---

## 2. The build script

### 🟠 2.1 `babel-node` for code that doesn't need Babel

`scripts/createRulebooks.js:1-10`:

```js
const { handbooker, } = require("handbooker");

const options = {
    "debug": true,
    "printOptions": {
        displayHeaderFooter: false,
    },
};

handbooker("./src/dungeon-libs.md", "./dungeon-libs-rules.pdf", options);
```

This is plain CommonJS. There is no `import`, no JSX, no decorator, no TypeScript, no spread-in-object-literal that Node 12+ doesn't already support. **Nothing here needs Babel.**

Yet `package.json` pulls in:

- `@babel/cli ^7.12.1`
- `@babel/core ^7.12.3`
- `@babel/node ^7.12.1`
- `@babel/preset-env ^7.12.1`

…and runs the script through `babel-node`. There is no `babel.config.js`, `.babelrc`, or `babel` block in `package.json` — so even if there *were* modern syntax, no preset would be applied. `babel-node` is being used as a glorified `node`. It also forks a second process, slowing every build by ~1–2 seconds for no reason.

**Why this matters (educational):** Cargo-cult tooling. Someone scaffolded this from a template that used Babel and the dependency stuck around long after the reason. The fix is one line:

```diff
- "build": "babel-node scripts/createRulebooks",
+ "build": "node scripts/createRulebooks",
```

…and then remove all four `@babel/*` packages. You shed four direct deps and dozens of transitives, including a few that show up in your dependabot history (e.g. `browserslist`, `json-schema`).

### 🟠 2.2 The `path` package is a Node built-in — don't depend on the npm one

`package.json:49`:

```json
"path": "^0.12.7",
```

`path` is a Node core module. The npm `path` package is a *browser polyfill* of it, and is **not the same code**. Installing it shadows behaviour in subtle ways depending on resolver order. Several real-world supply-chain stories ("name confusion" attacks) have abused exactly this pattern — adversaries publish look-alike packages of built-ins and wait for someone to `npm install` them.

Worse: it's listed but never actually imported anywhere in the repo. It's pure liability.

**Why this matters:** This is the canonical example of why you should grep your own code for a dep before adding it, and read what you're installing. Treat `package.json` as code that runs with `--allow-everything` on every dev machine and CI runner.

**Fix:** Delete it.

### 🟡 2.3 Hard-coded paths, no argv, no error handling

The script can only ever build one file to one output path. There's no way to dry-run, no exit code on failure, no `try/catch` around `handbooker`. If `handbooker` rejects a Promise (which it does, internally — it shells out to headless Chrome via Puppeteer), the process will print an UnhandledPromiseRejection warning and exit 0. CI thinks it succeeded.

**Fix sketch:**

```js
const { handbooker } = require("handbooker");
const path = require("node:path");

const [, , inputArg, outputArg] = process.argv;
const input = inputArg ?? "./src/dungeon-libs.md";
const output = outputArg ?? "./dungeon-libs-rules.pdf";

async function main() {
    await handbooker(input, output, {
        debug: false,
        printOptions: { displayHeaderFooter: false },
    });
    console.log(`Wrote ${path.resolve(output)}`);
}

main().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
});
```

Note `debug: true` is on in production — every CI run dumps a verbose log. Default it off and let CI flip it on with an env var.

### 🟡 2.4 `handbooker` is pinned to `^1.6.6` — unmaintained dependency

`handbooker` was last published in 2018 (it's the author's own package — `monolith-games/handbooker`). It pulls in a Chrome via `puppeteer` or `html-pdf-chrome`, both of which are heavy and have a long CVE history. The dependabot config (see §4) lists `html-pdf-chrome 0.6.1` and `puppeteer`-adjacent packages in the ignore list, suggesting upgrades were tried and rolled back.

**Why this matters:** A build pipeline that depends on a single-maintainer, unmaintained, Chrome-bundling package is one supply-chain incident away from being unfixable. It is fine for a hobby project; it's worth knowing the risk. For a team learning lesson: when you pin to a tiny package you authored, you've made yourself the sole on-call for it.

**Options, in order of effort:**

1. **Replace** the build step with a maintained tool: `pandoc` (one binary, decades of stability) or `md-to-pdf` (npm, actively maintained). The whole `scripts/createRulebooks.js` reduces to a shell line.
2. **Vendor** the handbooker logic into this repo so you control it.
3. **Update** `handbooker` to use a current Puppeteer + Node.

---

## 3. Git hygiene and dev workflow

### 🟠 3.1 Husky is installed but never wired up

`package.json:44`: `"husky": "^8.0.3"`.

But:

- there is no `.husky/` directory
- there is no `"prepare": "husky install"` script
- husky 8 doesn't auto-install — you need the prepare hook

So the `format:staged` script (which runs `pretty-quick --staged`) **never fires**. Files land in `main` un-formatted, prettier-check would catch it if it existed (§1.5), and nobody knows because there is no signal.

**Fix:** either remove husky (and the `format:staged` script), or wire it up:

```json
"scripts": {
  "prepare": "husky install"
}
```

…and add `.husky/pre-commit` with `npx pretty-quick --staged --pattern "{scripts,src}/**"`.

### 🟡 3.2 `pretty-quick` only globs `./scripts/**`

`package.json:10`: `--pattern ./scripts/**`. Even if husky worked, formatting would be applied only to `scripts/`, not the source-of-truth markdown in `src/`. Given that `src/` is 639 lines of markdown and `scripts/` is one 10-line JS file, this is exactly backwards.

### 🔴 3.3 `debug.html` (660 KB) is committed

`debug.html` is at the repo root. It's a static HTML dump — likely the intermediate file that `handbooker`/`puppeteer` produces during PDF generation when `debug: true` is on. **It does not belong in version control.**

Consequences:

- adds 660 KB to every fresh clone
- gets diffed and re-uploaded on every "regenerate" commit
- pollutes `git log -p` and any GitHub blame views
- if anyone *does* regenerate it from current `src/`, you'll get a bizarre PR diff of HTML that nobody can review

**Fix:** `git rm debug.html`, and add `debug.html` and `*.html` (if not needed) to `.gitignore`.

### 🟠 3.4 `.gitignore` is too thin

`.gitignore:1-3`:

```
node_modules
*.pdf
```

Missing entries that will eventually bite someone:

- `.DS_Store` (mac users — this *will* sneak in)
- `.env`, `.env.local`, `.env.*` (in case any future tool needs config; cheaper to have it now)
- `.idea/`, `.vscode/` (IDE settings)
- `coverage/` (jest output)
- `*.log`, `npm-debug.log*`, `yarn-debug.log*`
- `dist/`, `build/`, `out/`
- `debug.html` (see §3.3)

**Why this matters:** A bad `.gitignore` is one of those things you fix once and forget about. Use the GitHub `Node` template as a baseline.

### 🟡 3.5 `package-lock.json` is committed but install command is `npm install`, not `npm ci`

This is fine for local dev. In CI (§1.4) you should be running `npm ci` — it's faster, deterministic, and fails loudly if `package.json` and `package-lock.json` disagree. The current `.circleci/config.yml:29` uses `npm install`, which silently updates the lockfile inside the CI container and then throws away the change.

---

## 4. Dependabot config is a graveyard

`.github/dependabot.yml:12-49` ignores updates for:

```
html-pdf-chrome, lodash, jest, mcclowes-scripts, http-proxy,
elliptic, websocket-extensions, handlebars, mixin-deep, tar,
url-parse, react-dev-utils
```

Several of these (`react-dev-utils`, `mcclowes-scripts`) **aren't dependencies of this project at all** — they look like leftovers from a CRA-style scaffold. The config is being copy-pasted between repos.

Several others (`http-proxy`, `elliptic`, `websocket-extensions`, `tar`, `url-parse`) are pinned because of CVEs at the time the ignore was added, but pinning *down* a single version means you've **opted out of receiving the fix**. Dependabot will stop offering 1.4.7 → 1.4.8, which might be the security patch.

**Why this matters (educational):** `dependabot.ignore` is a "we'll deal with this later" cache. It rots fast. Audit it whenever you do a dep sweep — every entry should either have a comment explaining *why* it's ignored, or be deleted.

**Fix:** Delete entries whose packages aren't in the dep tree (`npm ls $name` returns nothing), and re-evaluate the rest. Most of them are stale.

---

## 5. `package.json` mismatches

### 🟡 5.1 `"main": "index.js"` — but there is no `index.js`

The package declares an entry point that doesn't exist. If anyone ever ran `require("dungeon-libs")` (the package isn't published, but the name suggests intent), it would explode.

**Decide:** Is this a library or a content repo? If it's just rules content, set `"private": true` and remove `main`. If it's meant to be importable, add an `index.js` that exports the parsed markdown or rule tables.

### 🟡 5.2 No `engines` field

No declared Node version. Combined with §1.3, the supported runtime is genuinely unknown.

```json
"engines": {
  "node": ">=18"
}
```

### 🟡 5.3 `"private": true` is missing

Without it, a `npm publish` slip would push to the public registry. Cheap insurance.

### 🟡 5.4 Mixing `singleQuote: false` with the rest of the JS ecosystem

`prettier.config.js` sets `singleQuote: false`. That's a legitimate choice, but worth flagging that the wider Node/JS ecosystem leans single-quote, so contributors will need to be reminded. Not a bug; just be consistent and document it in `CONTRIBUTING.md` (which doesn't exist — see §7.1).

---

## 6. The content itself (`src/dungeon-libs.md`)

This is technically out of scope for a "code review", but since the markdown *is* the deliverable, it warrants the same scrutiny.

### 🟠 6.1 Numbered tables don't match their dice ranges

The doc says:

> These tables suit rolling:
> - D6 (1 - 6)
> - 2D6 (2 - 12)
> - 2D6 (11 - 66) — Choose which dice represents the first digit and which represents the second

For `2D6 (11–66)`, each die shows 1–6, so the possible concatenations are `{11..16, 21..26, 31..36, 41..46, 51..56, 61..66}` — 36 entries, with **gaps at 17–20, 27–30, 37–40, 47–50, 57–60**. Yet `Noun list` (`src/dungeon-libs.md:500-562`) is numbered 1–66 with no gaps. Rolling `2D6 (11-66)` and reading "entry 19" is undefined — there's an entry at slot 19 in the list, but the dice can never produce 19.

`Adjective list 1` (`src/dungeon-libs.md:265-319`) is numbered 1–50. None of D6, 2D6 (2-12), or 2D6 (11-66) maps onto 1–50 cleanly.

**Why this matters:** The rules promise a mechanic ("roll on this table") that the data doesn't honour. Players hit this on first contact, and either improvise or feel the system is broken.

**Fix options:**

- Renumber the lists to match exactly one dice mechanic and label them: `### Adjective list (1d50)` or `### Noun list (2d6 method, 36 entries)` with the actual reachable indices.
- Or pick a single normalization (1–66 with the 30 unreachable entries pruned).

### 🟡 6.2 "Treasure" challenge has no rules

`src/dungeon-libs.md:126`: challenge result `12. Treasure!`. There's no follow-up section explaining what happens, unlike `Fork in the corridor` and `The Shopkeeper` which have their own subsections. Same for several others (`A door!`, `A puzzle!`, `A shrine!`, `A prison!`).

The Skull Lord has to improvise. That may be intentional ("the GM fills it in"), but the doc should *say so* once, rather than leave the reader wondering if they missed a page.

### 🟡 6.3 Internal contradictions on damage / death

`src/dungeon-libs.md:65`:

> Skills act as health, and each time a player takes damage they **temporarily** lose one skill. If a player has no remaining skills, they are dead.

vs `src/dungeon-libs.md:167`:

> If a character takes damage, they **cross out** one of their skills, and it can no longer be used. Once they cross out all three skills, they are dead!

"Temporarily lose" and "cross out, can no longer be used" describe two different mechanics. The leveling-up rule (`src/dungeon-libs.md:185`) lets a player "regain a crossed out skill (heal)", which implies the second reading is correct — but then "temporarily" is misleading on line 65.

### 🟡 6.4 Typos / proofreading

A non-exhaustive pass:

- `src/dungeon-libs.md:16` — "Tell each player **them** to number a sheet of paper" → remove "them" or rephrase.
- `src/dungeon-libs.md:201` — "Impaired gets canceled out to a normal roll if you would roll **3D6** and pick highest and vice versa" — comma needed, sentence is hard to parse.
- `src/dungeon-libs.md:208` — "To make a skull wizard, it's use the following template" — "it's" should be "use".
- `src/dungeon-libs.md:210` — "wild the" → "wield the".
- `src/dungeon-libs.md:243` — "Patreon" is misspelled "Pateron".
- `src/dungeon-libs.md:190` — "shiny gold coins**.** are used to buy items" — stray period mid-sentence.

A real lint pass would catch all of these — see §7.2.

### 🟢 6.5 Image is hot-linked to a Quip CDN

`src/dungeon-libs.md:3` references `d2mxuefqeaa7sj.cloudfront.net/...png`. That's a Quip-hosted image. Quip has been deprecated in stages; this URL could vanish without warning and silently break every future PDF build. Vendor the image into `src/assets/` and reference it locally.

### 🟢 6.6 `\page` is a tool-specific page break

`\page` (on lines 97, 188, 249) is a directive understood by `handbooker`/Quip's renderer, not standard markdown. If you ever migrate the build (§2.4), these become orphan tokens. A comment near the top of the file explaining this convention would save a future contributor a Google search.

---

## 7. What's missing entirely

### 🟡 7.1 No `CONTRIBUTING.md`

How does a new contributor know to:

- run `npm run build` to preview their changes
- not commit `*.pdf` outputs (the gitignore handles it, but they don't know why)
- run `prettier` before pushing (since husky doesn't, §3.1)
- not commit `debug.html`?

They don't. They find out by getting a code-review nit from you, which doesn't scale.

### 🟡 7.2 No markdown linter

`markdownlint`, `remark-lint`, or even a homemade jest test would catch:

- broken internal links
- mismatched list numbering
- the typos in §6.4
- missing image alt text (the only `<img>` in the file has no alt — accessibility miss)

For a project where the markdown *is the product*, this is the highest-leverage tooling you don't have.

### 🟡 7.3 No CHANGELOG / version discipline

`package.json:3` claims version `2.0.0`. There is no git tag for 2.0.0. No CHANGELOG describes what changed from 1.x. If someone asks "which version of the rules am I reading?", the only answer is the commit SHA.

### 🟡 7.4 README is one paragraph

Five lines, no install instructions, no build instructions, no link to the rendered PDF (which isn't even hosted anywhere as far as I can tell). It says "PDF generated with Handbooker" but doesn't say how to *get* the PDF if you just want to play the game. The audience for this repo is presumably tabletop players, and they will not `git clone` and `npm install`.

**Fix:**

- Publish the PDF to GitHub Releases on every push to `main`, link from the README.
- Add a "How to play" section pointing at the PDF.
- Add a "How to contribute" section pointing at `src/dungeon-libs.md`.

### 🟢 7.5 No license file

`package.json` says `"license": "ISC"`. There's no `LICENSE` file in the repo. Without one, the license *defaults to all rights reserved* on GitHub for the non-package contents. Given the credits section names "Abbadon" as the original creator under what looks like a Patreon arrangement, the licensing situation needs a real conversation, not a `package.json` field. Worth asking explicitly before doing anything else.

---

## 8. Security & supply-chain notes

### 🟠 8.1 The dep tree is large for what's being built

Building one PDF should not require: `puppeteer` (downloads ~170 MB of Chromium), the full `@babel/*` toolchain, jest, lodash, marked, merge-md. The active build path only needs `handbooker` (and transitively, headless Chrome). Everything else is leftover.

**Smaller surface = fewer CVE pings = fewer dependabot PRs = less of your evenings.**

### 🟠 8.2 `lodash` is a dep but never imported

`grep -r "lodash" scripts/ src/` returns nothing. It's declared in `package.json` and pinned-down in the dependabot ignore list (locking in `4.17.20`/`4.17.21`, both of which had prototype-pollution disclosures since). Delete it.

### 🟠 8.3 `marked` and `merge-md` are deps but never imported

Same as 8.2. Delete.

### 🟢 8.4 Nothing in this repo handles user input, secrets, or network traffic

So most "real" security categories (auth, injection, XSS, secrets in env) don't apply. The risk model is **supply chain only**, which is exactly why the unused-dep findings above matter — every dev dep is code that runs on the maintainer's laptop during `npm install` (via lifecycle scripts) and on CI runners.

---

## 9. Edge cases the build/test/content do not handle

A grab-bag the team can use as a checklist when adding tests or hardening the build.

### Build-script edge cases

1. **`src/dungeon-libs.md` is missing or empty** — current script crashes mid-puppeteer with an opaque error. Add an upfront `fs.statSync` check.
2. **Output directory doesn't exist** — `handbooker` writes to a literal path; if you ever change to `./dist/dungeon-libs-rules.pdf` without creating `dist/`, fail with a clear message.
3. **The output PDF already exists and is locked** (someone has it open in Preview on macOS) — Puppeteer's write fails silently in some versions. Detect by writing to a temp path and `fs.rename`-ing.
4. **No internet access on the build machine** — `handbooker` may try to fetch the hot-linked CloudFront image (§6.5). Pin the asset locally to make the build hermetic.
5. **Headless Chrome can't launch in CI** — the CircleCI base image may not include the right shared libs. Document the required system packages or switch to a Puppeteer-bundled image.
6. **Concurrent builds** — `npm run watch` plus a manual `npm run build` will fight over `dungeon-libs-rules.pdf`. Write to a tempfile + atomic rename.
7. **Markdown that's syntactically valid but renders wrong** — a stray `>` quote, a mis-numbered list, an unclosed `<div>` — should be caught by markdown lint before puppeteer chokes on it.

### Content edge cases (rules)

1. **A player rolls "1" on the challenge table** (`src/dungeon-libs.md:115` — entry says just `-`). What happens? Re-roll? Nothing? Specify.
2. **A player rolls Shopkeeper twice in one dungeon** — rules say re-roll. What if they re-roll Shopkeeper *again*? Infinite loop unless you say "re-roll up to twice, then pick anything else".
3. **All players reach 0 skills at once / TPK** — what happens to the quest? Does the peasant lose their thing forever? No rule for total-party-kill recovery.
4. **A player has no skill applicable to a challenge** — can they still roll? Rule §155 implies yes but is ambiguous.
5. **Negative skill total** — if a player has a `-1` skill and the only relevant skill, they roll 2D6 − 1. Confirmed (`src/dungeon-libs.md:155`: "even if the skill or weapon gives a penalty"), but the minimum-result interaction with the 2-6 / 7-9 / 10+ band needs an example.
6. **Resurrection of the last living player** — `Paladin` can resurrect, but only "once per dungeon". If the paladin dies first, nobody can resurrect. The mechanic relies on dungeon ordering nobody guaranteed.
7. **Thief steals from the Shopkeeper** — rule says nobody can stop them, "not even the Shopkeeper". But Shopkeeper is "seemingly invulnerable". Two specials interacting — at least one player will ask, so settle it.
8. **Single-player game** — README says "2+ players" but the rules assume at least Skull Lord + 1 player. A solo-with-narrator mode might be popular; consider adding a "playing with one player" note.
9. **A `Skull Wizard` boss with more players than dice rolls reasonable** — for 6 players, you need 6 × 10+ rolls. With 1-in-9 odds at 2D6, the expected number of rolls is ~54. Game becomes unwinnable in practice. Worth play-testing the upper bound.

---

## 10. What I would actually do (proposed plan)

If I owned this repo on day two, in order of payoff:

1. **Delete dead code and deps** — `babel-node` (§2.1), unused `path`/`lodash`/`marked`/`merge-md` (§§2.2, 8.2, 8.3), the placebo test (§1.1), `debug.html` (§3.3). Repo gets smaller, CI gets faster, attack surface shrinks.
2. **Make CI honest** — Node LTS image (§1.3), `npm ci`, `npm run build`, `prettier --check`, `markdownlint` (§§1.4, 1.5, 7.2). One green check that actually means something.
3. **Add a real test** — content invariants on `src/dungeon-libs.md`: tables have the expected row counts, no broken cross-references, no double-spaces (§1.1). Five jest tests, ten minutes.
4. **Fix the rules-content bugs** — §§6.1 (dice-to-table mismatch), 6.3 (damage contradiction), 6.4 (typos). These are user-visible.
5. **Wire husky properly or remove it** (§3.1).
6. **Publish the PDF** — GitHub Releases on tag push, link from README (§7.4). Now the audience can actually consume the work.
7. **Audit dependabot config** (§4) — delete entries for packages that aren't in the tree, remove version pins.
8. **License clarity** (§7.5) — add a real `LICENSE` file consistent with Abbadon's original terms.
9. **Replace `handbooker`** with `pandoc` or `md-to-pdf` if you want this to be maintainable past 2026 (§2.4). This is the big one and the most risky; do it last, with a side-by-side PDF diff.

Steps 1–4 are an afternoon. Steps 5–8 are another afternoon. Step 9 is a week.

---

## 11. Lessons (for the team)

Pulling the threads together — patterns to internalize, in priority order:

1. **A green CI that tests nothing is dangerous, not neutral.** Always ask "what would have to be wrong for this test to fail?" If the answer is "nothing realistic", delete or replace it.
2. **Tooling is code, and dead tooling rots.** Babel that transpiles nothing, husky that's not installed, dependabot ignoring deps that don't exist, jest configured against a missing setup file — every one of these is unmaintained code in `package.json`. Treat dep additions and config blocks with the same rigour as source code.
3. **The deliverable should be visible.** This repo's product is a PDF and nobody can find it. If your end user has to `git clone` to consume what you built, you've built the wrong artifact.
4. **Pin Node, lock deps, run `npm ci`.** Reproducibility is one nvmrc + one CI flag away. Without it, "works on my machine" silently becomes the team's debugging methodology.
5. **Read every dep before adding it.** `path` as an npm dependency is a teachable supply-chain footgun — the kind of mistake that gets you on Hacker News for the wrong reasons.
6. **Markdown counts as code if it's your product.** Lint it, test it, version it.
7. **Document the "why", not the "what".** A `CONTRIBUTING.md` that says "we use prettier with tabs; here's how to build the PDF; don't commit `debug.html`" prevents fifty future code-review nits.
8. **Audit configuration after big changes.** Most of this repo's bugs are stale config left from a previous scaffold. After any reorganisation, do a sweep: every line of every config file, "is this still true?"

---

*Generated as a structured review per `/senior-dev` — happy to drill into any section, draft the cleanup PRs, or pair on the rules-content rewrites.*
