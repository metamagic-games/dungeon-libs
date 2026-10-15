const { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } = require("fs");
const { tmpdir } = require("os");
const { join, resolve } = require("path");
const { spawnSync } = require("child_process");

describe("Rulebook build", () => {
	it("renders the rules into styled pages before saving the PDF", () => {
		const directory = mkdtempSync(join(tmpdir(), "dungeon-libs-build-"));
		const capture = join(directory, "render.json");
		try {
			mkdirSync(join(directory, "src"));
			copyFileSync(resolve("src/dungeon-libs.md"), join(directory, "src/dungeon-libs.md"));
			copyFileSync(resolve("package.json"), join(directory, "package.json"));
			symlinkSync(resolve("node_modules"), join(directory, "node_modules"), "dir");
			symlinkSync(resolve("scripts"), join(directory, "scripts"), "dir");
			const result = spawnSync("npm", ["run", "build"], {
				cwd: directory,
				env: {
					...process.env,
					DUNGEON_LIBS_RENDER_CAPTURE: capture,
					NODE_OPTIONS: [
						process.env.NODE_OPTIONS,
						`--require=${JSON.stringify(join(__dirname, "fixtures/capture-pdf.cjs"))}`,
					]
						.filter(Boolean)
						.join(" "),
				},
				encoding: "utf8",
				timeout: 10000,
			});
			if (result.error) throw result.error;
			if (result.status !== 0) throw new Error(`Rulebook build failed: ${result.stderr || result.stdout}`);
			const { html, destination } = JSON.parse(readFileSync(capture, "utf8"));
			const document = new DOMParser().parseFromString(html, "text/html");
			expect(document.querySelector("h1").textContent).toBe("Dungeon Libs");
			expect(Array.from(document.querySelectorAll("h2"), (heading) => heading.textContent)).toEqual([
				"Character Creation",
				"Playing the game",
				"Advanced Play",
				"Credits",
				"Random word tables",
			]);
			expect(document.querySelectorAll(".phb").length).toBeGreaterThan(1);
			expect(document.querySelector("style").textContent.trim()).not.toBe("");
			expect(html).not.toContain("\\page");
			expect(destination).toBe("./dungeon-libs-rules.pdf");
			expect(readFileSync(join(directory, "debug.html"), "utf8")).toBe(html);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
