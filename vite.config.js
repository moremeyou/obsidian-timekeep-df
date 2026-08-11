import { builtinModules } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

import { calculateBuildInputHash } from "./scripts/build-metadata.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(async (env) => {
	const productionBuildMetadata =
		env.mode === "production"
			? {
					identifier: new Date().toISOString(),
					inputHash: await calculateBuildInputHash(__dirname),
				}
			: null;

	return {
		plugins: productionBuildMetadata
			? [
					{
						name: "timekeep-df-build-banner",
						generateBundle(_options, bundle) {
							const mainChunk = bundle["main.js"];
							if (!mainChunk || mainChunk.type !== "chunk") {
								throw new Error(
									"Unable to add the Timekeep DF build identifier to main.js"
								);
							}

							mainChunk.code =
								`/*! Timekeep DF build: ${productionBuildMetadata.identifier}; ` +
								`inputs: ${productionBuildMetadata.inputHash} */\n` +
								mainChunk.code;
						},
					},
				]
			: [],
		build: {
			outDir: "dist",
			sourcemap: env.mode === "production" ? false : "inline",
			target: "es2018",
			minify: env.mode === "production",
			lib: {
				entry: "src/main.ts",
				formats: ["cjs"],
				fileName: () => "main.js",
			},
			rolldownOptions: {
				input: {
					main: path.resolve(__dirname, "src/main.ts"),
					styles: path.resolve(__dirname, "src/styles.css"),
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtinModules,
				],
				output: {
					exports: "auto",
				},
			},
			//
			cssCodeSplit: true,
			// Inline all assets (.ttf ...etc)
			assetsInlineLimit: Infinity,
		},

		resolve: {
			alias: {
				"@": path.resolve(__dirname, "src"),
				pdfmake: "pdfmake/build/pdfmake",
				...(env.mode === "test"
					? {
							// Test stub overrides
							obsidian: path.resolve(__dirname, "src", "__mocks__", "obsidianStub"),
							electron: path.resolve(__dirname, "src", "__mocks__", "electronStub"),
						}
					: {}),
			},
		},

		test: {
			setupFiles: [
				path.resolve(__dirname, "src", "__mocks__", "setupObsidianMocks.ts"),
				path.resolve(__dirname, "src", "__mocks__", "setupMocks.ts"),
			],
			coverage: {
				// Exclude mocks and fixtures from coverage
				exclude: [
					"**/__mocks__/**",
					"**/__fixtures__/**",
					"*.ttf",
					"**/components/**/index.ts",
				],
			},
			env: {
				// Consistent test timezone
				TZ: "Pacific/Auckland",
			},
		},
	};
});
