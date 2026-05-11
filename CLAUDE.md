# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Dungeon Libs is a tabletop roleplaying game ("Dungeons & Dragons meets Mad Libs") based on Skull Wizards by Abbadon. The repo is **not application code** — it is the rulebook source plus a tiny build pipeline that converts the markdown rules into a printable PDF.

The actual product is `src/dungeon-libs.md`. Everything else exists to ship that file.

## Commands

- `npm run build` — converts `src/dungeon-libs.md` to `dungeon-libs-rules.pdf` via `scripts/createRulebooks.js` (uses [handbooker](https://github.com/monolith-games/handbooker), runs through `babel-node`).
- `npm run watch` — re-runs the build whenever `src/` changes.
- `npm run format` — Prettier across `scripts/` and `src/`.
- `npm test` — Jest. Currently a single placeholder spec (`__tests__/root.spec.js`); CI (`.github/workflows/ci.yml`) just runs `npm test`.
- `npm run test:watch` — Jest in watch mode (`--runInBand --bail`).
- Single test: `npx jest <pattern>` (e.g. `npx jest root`).

## Architecture

- `src/dungeon-libs.md` — the rulebook content. This is the source of truth; edits to game rules happen here.
- `scripts/createRulebooks.js` — three-line wrapper that calls `handbooker(input, output, options)` to render the markdown to PDF. Run via `@babel/node` so ES module syntax works without a build step.
- `debug.html` — generated artifact from a previous handbooker run, useful for inspecting how the markdown renders before producing the PDF.
- `*.pdf` is gitignored — the built rulebook is not committed.

There is no application framework, no TypeScript, no bundler. The Jest setup references a `setupTests.js` that doesn't exist in the repo root; if you add real tests, create that file or remove the reference from `package.json`.

## Conventions

- Prettier config (`prettier.config.js`) controls formatting; pre-commit uses `pretty-quick --staged --pattern ./scripts/**` via Husky.
- Tabs for indentation (see existing JS files).
