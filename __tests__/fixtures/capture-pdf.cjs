const { writeFileSync } = require("fs");
const Module = require("module");

// Only replace the browser boundary; the real Handbooker renderer still runs.
const load = Module._load;
Module._load = function (request) {
	if (request === "html-pdf-chrome") {
		return {
			create: async (html) => ({
				toFile: async (destination) => {
					writeFileSync(process.env.DUNGEON_LIBS_RENDER_CAPTURE, JSON.stringify({ html, destination }));
				},
			}),
		};
	}
	return load.apply(this, arguments);
};
