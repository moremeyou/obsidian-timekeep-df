#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculateBuildInputHash, collectBuildInputFiles } from "./build-metadata.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginId = "obsidian-timekeep-df";
const pluginName = "Timekeep DF";
const viewType = "timekeep-df";
const artifacts = ["manifest.json", "main.js", "styles.css"];
const buildIdentifierPattern =
	/\/\*! Timekeep DF build: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z); inputs: ([a-f0-9]{64}) \*\//g;

function usage() {
	console.log(`Usage: node scripts/deploy-df.mjs [options]

Options:
  --build              Run and await a production build before copying
  --vault <path>       Obsidian vault root (also: OBSIDIAN_VAULT)
  --plugin-dir <path>  Exact plugin directory (also: TIMEKEEP_DF_PLUGIN_DIR)
  --help               Show this help

Without an override, the vault defaults to ~/Desktop/dBrain on macOS and
~/dBrain on Windows and Linux.`);
}

function parseArgs(args) {
	const options = {};

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];

		if (argument === "--build") {
			options.build = true;
			continue;
		}

		if (argument === "--help") {
			options.help = true;
			continue;
		}

		if (argument === "--vault" || argument === "--plugin-dir") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for ${argument}.`);
			}

			options[argument === "--vault" ? "vault" : "pluginDir"] = value;
			index += 1;
			continue;
		}

		throw new Error(`Unknown option: ${argument}`);
	}

	if (options.vault && options.pluginDir) {
		throw new Error("Use either --vault or --plugin-dir, not both.");
	}

	return options;
}

function expandHome(value) {
	if (value === "~") {
		return os.homedir();
	}

	if (/^~[\\/]/.test(value)) {
		return path.join(os.homedir(), value.slice(2));
	}

	return value;
}

function defaultVaultPath() {
	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Desktop", "dBrain");
	}

	return path.join(os.homedir(), "dBrain");
}

function envPath(name) {
	if (!Object.prototype.hasOwnProperty.call(process.env, name)) {
		return undefined;
	}

	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} must not be empty.`);
	}

	return value;
}

function resolveDestination(options) {
	const environmentPluginDir = envPath("TIMEKEEP_DF_PLUGIN_DIR");
	const environmentVault = envPath("OBSIDIAN_VAULT");
	if ((options.pluginDir || options.vault) && (environmentPluginDir || environmentVault)) {
		throw new Error("Do not combine command-line and environment destination overrides.");
	}
	if (environmentPluginDir && environmentVault) {
		throw new Error("Set either TIMEKEEP_DF_PLUGIN_DIR or OBSIDIAN_VAULT, not both.");
	}

	const pluginDirOverride = options.pluginDir ?? environmentPluginDir;
	if (pluginDirOverride) {
		return {
			pluginDir: path.resolve(expandHome(pluginDirOverride)),
			vaultDir: null,
		};
	}

	const vaultDir = path.resolve(
		expandHome(options.vault ?? environmentVault ?? defaultVaultPath())
	);

	return {
		pluginDir: path.join(vaultDir, ".obsidian", "plugins", pluginId),
		vaultDir,
	};
}

async function requireFile(filePath, label) {
	let fileStat;
	try {
		fileStat = await lstat(filePath);
	} catch {
		throw new Error(`Missing ${label}: ${filePath}`);
	}

	if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
		throw new Error(`Expected ${label} to be a file: ${filePath}`);
	}

	return fileStat;
}

async function requireDirectory(directoryPath, label) {
	let directoryStat;
	try {
		directoryStat = await stat(directoryPath);
	} catch {
		throw new Error(`${label} not found: ${directoryPath}`);
	}

	if (!directoryStat.isDirectory()) {
		throw new Error(`Expected ${label} to be a directory: ${directoryPath}`);
	}
}
function requirePattern(contents, pattern, label) {
	if (!pattern.test(contents)) {
		throw new Error(`Fork identity check failed: ${label}.`);
	}
}

async function verifySourceIdentity() {
	const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
	const packageMetadata = JSON.parse(
		await readFile(path.join(projectRoot, "package.json"), "utf8")
	);
	if (manifest.id !== pluginId || manifest.name !== pluginName) {
		throw new Error(`Fork identity check failed: expected ${pluginId} / ${pluginName}.`);
	}
	if (packageMetadata.name !== pluginId) {
		throw new Error(`Fork identity check failed: package name must be ${pluginId}.`);
	}

	const [mainSource, fileViewSource, registrySource, parserSource, codeblockSource] =
		await Promise.all([
			readFile(path.join(projectRoot, "src", "main.ts"), "utf8"),
			readFile(path.join(projectRoot, "src", "views", "TimekeepFileView.ts"), "utf8"),
			readFile(path.join(projectRoot, "src", "service", "registry.ts"), "utf8"),
			readFile(path.join(projectRoot, "src", "timekeep", "parser.ts"), "utf8"),
			readFile(path.join(projectRoot, "src", "utils", "codeblock.ts"), "utf8"),
		]);

	requirePattern(
		mainSource,
		/registerMarkdownCodeBlockProcessor\(\s*["']timekeep["']/,
		"the Markdown language must remain timekeep"
	);
	requirePattern(
		mainSource,
		/registerView\(\s*["']timekeep-df["']/,
		`registerView must use ${viewType}`
	);
	requirePattern(
		mainSource,
		/registerExtensions\(\s*\[\s*["']timekeep["']\s*\]\s*,\s*["']timekeep-df["']\s*\)/,
		`the .timekeep extension must map to ${viewType}`
	);
	requirePattern(
		fileViewSource,
		/return\s+["']timekeep-df["'];/,
		`TimekeepFileView.getViewType() must return ${viewType}`
	);
	requirePattern(
		registrySource,
		/TimekeepEntryItemType\.FILE\s*\?\s*["']timekeep-df["']\s*:\s*["']markdown["']/,
		`registry file leaf lookup must use ${viewType}`
	);

	if (!parserSource.includes('startsWith("```timekeep")')) {
		throw new Error("Compatibility check failed: parser must recognize ```timekeep blocks.");
	}
	if (!codeblockSource.includes('output += "```timekeep\\n"')) {
		throw new Error("Compatibility check failed: generated blocks must use ```timekeep.");
	}

	return manifest;
}

async function verifyRuntimeWhitelist() {
	const distPath = path.join(projectRoot, "dist");
	const actualEntries = (await readdir(distPath, { withFileTypes: true }))
		.map((entry) => entry.name)
		.sort();
	const expectedEntries = [...artifacts].sort();
	if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
		throw new Error(
			`Unexpected dist contents; expected only ${expectedEntries.join(", ")}, found ${actualEntries.join(", ") || "nothing"}.`
		);
	}
}

async function verifyBuildIsCurrent() {
	await verifyRuntimeWhitelist();
	const inputPaths = await collectBuildInputFiles(projectRoot);
	const inputFiles = await Promise.all(
		inputPaths.map(async (inputPath) => {
			const inputStat = await lstat(inputPath);
			return { path: inputPath, mtimeMs: inputStat.mtimeMs };
		})
	);
	if (inputFiles.length === 0) {
		throw new Error("Could not determine build input timestamps.");
	}

	const artifactStats = await Promise.all(
		artifacts.map(async (artifact) => {
			const artifactPath = path.join(projectRoot, "dist", artifact);
			const artifactStat = await requireFile(
				artifactPath,
				`deployment artifact; run pnpm build first`
			);
			return { path: artifactPath, mtimeMs: artifactStat.mtimeMs };
		})
	);

	const latestInput = inputFiles.reduce((latest, input) =>
		input.mtimeMs > latest.mtimeMs ? input : latest
	);
	const oldestArtifact = artifactStats.reduce((oldest, artifact) =>
		artifact.mtimeMs < oldest.mtimeMs ? artifact : oldest
	);

	if (oldestArtifact.mtimeMs < latestInput.mtimeMs) {
		throw new Error(
			`Build output is older than '${path.relative(projectRoot, latestInput.path)}'. ` +
				"Run pnpm build before copying to the vault plugin folder."
		);
	}
}

async function readBuildIdentifier(filePath) {
	const contents = await readFile(filePath, "utf8");
	const matches = [...contents.matchAll(buildIdentifierPattern)];
	if (matches.length !== 1) {
		throw new Error(`Expected exactly one Timekeep DF build identifier in ${filePath}.`);
	}

	return {
		identifier: matches[0][1],
		inputHash: matches[0][2],
	};
}

async function verifyBuiltIdentity(sourceManifest) {
	const builtManifestPath = path.join(projectRoot, "dist", "manifest.json");
	const builtManifest = JSON.parse(await readFile(builtManifestPath, "utf8"));
	if (
		builtManifest.id !== pluginId ||
		builtManifest.name !== pluginName ||
		builtManifest.version !== sourceManifest.version
	) {
		throw new Error("Built manifest does not match the Timekeep DF source identity/version.");
	}
	const sourceManifestPath = path.join(projectRoot, "manifest.json");
	if ((await sha256(builtManifestPath)) !== (await sha256(sourceManifestPath))) {
		throw new Error("Built manifest is not an exact copy of the source manifest.");
	}

	const builtMainPath = path.join(projectRoot, "dist", "main.js");
	const builtMain = await readFile(builtMainPath, "utf8");
	if (!builtMain.includes(viewType)) {
		throw new Error(`Built main.js does not contain required view type ${viewType}.`);
	}

	const buildMetadata = await readBuildIdentifier(builtMainPath);
	const currentInputHash = await calculateBuildInputHash(projectRoot);
	if (buildMetadata.inputHash !== currentInputHash) {
		throw new Error(
			"Build input fingerprint does not match the current source; run pnpm build first."
		);
	}

	return buildMetadata;
}

async function runProductionBuild() {
	const buildScript = path.join(projectRoot, "scripts", "build.js");
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [buildScript], {
			cwd: projectRoot,
			env: process.env,
			stdio: "inherit",
		});

		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(
					signal
						? `Production build terminated by signal ${signal}.`
						: `Production build failed with exit code ${code}.`
				)
			);
		});
	});
}

function containsOfficialPluginPath(candidatePath) {
	const parts = path
		.resolve(candidatePath)
		.split(path.sep)
		.filter(Boolean)
		.map((part) => part.toLowerCase());

	for (let index = 0; index <= parts.length - 3; index += 1) {
		if (
			parts[index] === ".obsidian" &&
			parts[index + 1] === "plugins" &&
			parts[index + 2] === "timekeep"
		) {
			return true;
		}
	}

	return false;
}

async function canonicalizeProspectivePath(candidatePath) {
	let existingPath = path.resolve(candidatePath);
	const missingParts = [];

	while (true) {
		try {
			const canonicalExistingPath = await realpath(existingPath);
			return path.join(canonicalExistingPath, ...missingParts.reverse());
		} catch (error) {
			if (error?.code !== "ENOENT") {
				throw error;
			}

			const parentPath = path.dirname(existingPath);
			if (parentPath === existingPath) {
				throw new Error(`Could not resolve destination path: ${candidatePath}`);
			}

			missingParts.push(path.basename(existingPath));
			existingPath = parentPath;
		}
	}
}

async function rejectOfficialPluginDestination(pluginDir) {
	const canonicalPluginDir = await canonicalizeProspectivePath(pluginDir);
	if (containsOfficialPluginPath(pluginDir) || containsOfficialPluginPath(canonicalPluginDir)) {
		throw new Error(
			`Refusing to deploy into the official Timekeep plugin directory: ${pluginDir}`
		);
	}
}

function requireForkPluginDirectoryName(pluginDir) {
	if (path.basename(path.resolve(pluginDir)) !== pluginId) {
		throw new Error(`Plugin destination folder must be named ${pluginId}: ${pluginDir}`);
	}
}

async function verifyExistingDestinationIdentity(pluginDir) {
	let pluginDirStat;
	try {
		pluginDirStat = await lstat(pluginDir);
	} catch (error) {
		if (error?.code === "ENOENT") {
			return false;
		}
		throw error;
	}

	if (pluginDirStat.isSymbolicLink() || !pluginDirStat.isDirectory()) {
		throw new Error(`Existing plugin destination is not a regular directory: ${pluginDir}`);
	}

	const manifestPath = path.join(pluginDir, "manifest.json");
	try {
		await requireFile(manifestPath, "existing destination manifest");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
		if (manifest.id !== pluginId || manifest.name !== pluginName) {
			throw new Error(
				`Existing destination manifest is not ${pluginId} / ${pluginName}: ${manifestPath}`
			);
		}
	} catch (error) {
		throw new Error(
			`Existing destination cannot be verified as ${pluginId}; inspect it before deploying: ${error.message}`
		);
	}

	return true;
}

async function requireSafeDestinationArtifacts(pluginDir) {
	for (const artifact of artifacts) {
		const destinationPath = path.join(pluginDir, artifact);
		try {
			const destinationStat = await lstat(destinationPath);
			if (destinationStat.isSymbolicLink() || !destinationStat.isFile()) {
				throw new Error(
					`Refusing to overwrite a non-regular destination artifact: ${destinationPath}`
				);
			}
		} catch (error) {
			if (error?.code !== "ENOENT") {
				throw error;
			}
		}
	}
}

async function sha256(filePath) {
	const contents = await readFile(filePath);
	return createHash("sha256").update(contents).digest("hex");
}

async function copyAndVerify(pluginDir, buildMetadata) {
	const sourcePaths = artifacts.map((artifact) => path.join(projectRoot, "dist", artifact));
	await Promise.all(
		sourcePaths.map((sourcePath) => requireFile(sourcePath, "deployment artifact"))
	);
	await requireSafeDestinationArtifacts(pluginDir);
	const sourceHashes = await Promise.all(sourcePaths.map(sha256));

	console.log(`Deploying ${pluginName} to ${pluginDir}`);
	console.log(`Artifact whitelist: ${artifacts.join(", ")}`);

	for (let index = 0; index < artifacts.length; index += 1) {
		await copyFile(sourcePaths[index], path.join(pluginDir, artifacts[index]));
	}

	for (let index = 0; index < artifacts.length; index += 1) {
		const artifact = artifacts[index];
		const destinationPath = path.join(pluginDir, artifact);
		const deployedHash = await sha256(destinationPath);
		if (deployedHash !== sourceHashes[index]) {
			throw new Error(`SHA-256 mismatch for ${artifact}.`);
		}

		console.log(`${artifact}: source=${sourceHashes[index]} deployed=${deployedHash}`);
	}

	const deployedBuildMetadata = await readBuildIdentifier(path.join(pluginDir, "main.js"));
	if (
		deployedBuildMetadata.identifier !== buildMetadata.identifier ||
		deployedBuildMetadata.inputHash !== buildMetadata.inputHash
	) {
		throw new Error("Deployed Timekeep DF build identifier does not match the source bundle.");
	}

	console.log(`Build identifier: ${deployedBuildMetadata.identifier}`);
	console.log(`Build input SHA-256: ${deployedBuildMetadata.inputHash}`);
	console.log("Timekeep DF deployment verified.");
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		usage();
		return;
	}

	const sourceManifest = await verifySourceIdentity();
	if (options.build) {
		await runProductionBuild();
	}

	await verifyBuildIsCurrent();
	const buildMetadata = await verifyBuiltIdentity(sourceManifest);

	const { pluginDir, vaultDir } = resolveDestination(options);
	requireForkPluginDirectoryName(pluginDir);
	await rejectOfficialPluginDestination(pluginDir);
	if (vaultDir) {
		await requireDirectory(vaultDir, "Vault folder");
		await requireDirectory(path.join(vaultDir, ".obsidian"), ".obsidian folder");
		await requireDirectory(
			path.join(vaultDir, ".obsidian", "plugins"),
			".obsidian/plugins folder"
		);
	}

	const destinationExists = await verifyExistingDestinationIdentity(pluginDir);
	if (!destinationExists) {
		await requireDirectory(path.dirname(pluginDir), "Plugin parent folder");
		await mkdir(pluginDir);
	}
	await rejectOfficialPluginDestination(pluginDir);
	await copyAndVerify(pluginDir, buildMetadata);
}

main().catch((error) => {
	console.error(`Timekeep DF deployment failed: ${error.message}`);
	process.exitCode = 1;
});
