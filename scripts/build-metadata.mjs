import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const buildInputs = [
	"src",
	"patches",
	"manifest.json",
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"scripts/build-metadata.mjs",
	"scripts/build.js",
	"tsconfig.json",
	"vite.config.js",
];

async function collectFiles(entryPath) {
	const entryStat = await lstat(entryPath);
	if (entryStat.isSymbolicLink()) {
		throw new Error(`Build inputs must not be symbolic links: ${entryPath}`);
	}

	if (entryStat.isFile()) {
		return [entryPath];
	}

	if (!entryStat.isDirectory()) {
		throw new Error(`Unsupported build input type: ${entryPath}`);
	}

	const entries = await readdir(entryPath, { withFileTypes: true });
	const nestedFiles = await Promise.all(
		entries
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((entry) => collectFiles(path.join(entryPath, entry.name)))
	);
	return nestedFiles.flat();
}

export async function collectBuildInputFiles(projectRoot) {
	const inputFiles = (
		await Promise.all(buildInputs.map((input) => collectFiles(path.join(projectRoot, input))))
	).flat();

	return inputFiles.sort((left, right) => left.localeCompare(right));
}

export async function calculateBuildInputHash(projectRoot) {
	const inputFiles = await collectBuildInputFiles(projectRoot);
	const hash = createHash("sha256");
	hash.update("timekeep-df-build-inputs-v1\0");

	for (const inputFile of inputFiles) {
		const relativePath = path.relative(projectRoot, inputFile).split(path.sep).join("/");
		hash.update(relativePath);
		hash.update("\0");
		hash.update(await readFile(inputFile));
		hash.update("\0");
	}

	return hash.digest("hex");
}
