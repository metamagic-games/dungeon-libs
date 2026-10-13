# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Dungeon Libs is a tabletop roleplaying game ("Dungeons & Dragons meets Mad Libs") based on Skull Wizards by Abbadon. The repo is **not application code** — it is the rulebook source plus a tiny build pipeline that converts the markdown rules into a printable PDF.

The actual product is `src/dungeon-libs.md`. Everything else exists to ship that file.

## Commands

- `npm run build` — converts `src/dungeon-libs.md` to `dungeon-libs-rules.pdf` via `scripts/createRulebooks.js` (uses [handbooker](https://github.com/monolith-games/handbooker), runs through `babel-node`).
- `npm run watch` — re-runs the build whenever `src/` changes.
- `npm run format` — Prettier across `scripts/` and `src/`.
- `npm test` — Jest. The rulebook build smoke test (`__tests__/root.spec.js`) runs the real Babel/Handbooker pipeline in a temporary directory, checks the rendered HTML, and stubs the Chrome/PDF boundary. CI (`.github/workflows/ci.yml`) runs `npm test`.
- `npm run test:watch` — Jest in watch mode (`--runInBand --bail`).
- Single test: `npx jest <pattern>` (e.g. `npx jest root`).

## Architecture

- `src/dungeon-libs.md` — the rulebook content. This is the source of truth; edits to game rules happen here.
- `scripts/createRulebooks.js` — CommonJS wrapper that calls `handbooker(input, output, options)` to render the markdown to PDF. Run via `@babel/node` for the runtime required by the compiled Handbooker dependency.
- `debug.html` — generated artifact from a previous handbooker run, useful for inspecting how the markdown renders before producing the PDF.
- `*.pdf` is gitignored — the built rulebook is not committed.

There is no application framework, no TypeScript, no bundler. Tests don't launch Chrome or fetch remote assets. Full PDF generation still requires a real browser and is separate from the smoke test.

## Conventions

- Prettier config (`prettier.config.js`) controls formatting; pre-commit uses `pretty-quick --staged --pattern ./scripts/**` via Husky.
- Tabs for indentation (see existing JS files).
