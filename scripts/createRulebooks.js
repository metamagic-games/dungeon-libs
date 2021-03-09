const { handbooker, } = require("handbooker");

const options = {
	"debug": true,
	"printOptions": {
		displayHeaderFooter: false,
	},
};

handbooker("./src/dungeon-libs.md", "./dungeon-libs-rules.pdf", options);