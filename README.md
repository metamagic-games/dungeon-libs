# dungeon-libs

Dungeons & Dragons meets Mad Libs. Based on the game Skull Wizards, developed by Abbadon.

The rules live in [`src/dungeon-libs.md`](src/dungeon-libs.md). The PDF rulebook is generated with [Handbooker](https://github.com/metamagic-games/handbooker).

## Build

```sh
npm install
npm run build      # writes dungeon-libs-rules.pdf
npm run watch      # rebuilds on changes to src/
npm test           # runs jest
npm run format     # prettier-format scripts/ and src/
```
