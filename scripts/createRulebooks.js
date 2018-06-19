const { handbooker, } = require("handbooker");

const options = {
	"debug": true,
	"style": "./node_modules/handbooker/lib/styles/homebrewery-styles.css",
	"printOptions": {
		displayHeaderFooter: false,
	},
};

handbooker("./dungeon-libs.md", "./dungeon-libs-rules.pdf", options);