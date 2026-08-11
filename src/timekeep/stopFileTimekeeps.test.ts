import moment from "moment";
import fs from "node:fs/promises";
import { expect, it, describe } from "vitest";

import { MockVault } from "../__mocks__/obsidian";
import { stopFileTimekeeps } from "./stopFileTimekeeps";

describe("stopFileTimekeeps", () => {
	it("nothing should change if the file has no timekeeps", async () => {
		const vault = new MockVault();
		const emptyFile = vault.addFile("empty.md", "");

		const amount = await stopFileTimekeeps(
			vault.asVault(),
			emptyFile,
			moment("2025-11-07T00:31:03.714Z")
		);
		expect(amount).toBe(0);
	});

	it("nothing should change if the file has no running timekeeps", async () => {
		const vault = new MockVault();

		const TEST_MARKDOWN_1_STOPPED = await fs.readFile(
			"src/timekeep/__fixtures__/stop/TEST_MARKDOWN_1_STOPPED.md",
			"utf-8"
		);

		const file1 = vault.addFile("TEST_MARKDOWN_1.md", TEST_MARKDOWN_1_STOPPED);

		const amount = await stopFileTimekeeps(
			vault.asVault(),
			file1,
			moment("2025-11-07T00:31:03.714Z")
		);

		expect(amount).toBe(0);
	});

	it("if the file contains a running timekeep it should be stopped", async () => {
		const vault = new MockVault();

		const TEST_MARKDOWN_1 = await fs.readFile(
			"src/timekeep/__fixtures__/stop/TEST_MARKDOWN_1.md",
			"utf-8"
		);

		const TEST_MARKDOWN_1_STOPPED = await fs.readFile(
			"src/timekeep/__fixtures__/stop/TEST_MARKDOWN_1_STOPPED.md",
			"utf-8"
		);

		const file = vault.addFile("TEST_MARKDOWN_1.md", TEST_MARKDOWN_1);

		const amount = await stopFileTimekeeps(
			vault.asVault(),
			file,
			moment("2025-11-07T00:31:03.714Z")
		);

		const output = await vault.read(file);

		expect(amount).toBe(1);
		expect(output).toBe(TEST_MARKDOWN_1_STOPPED);
	});

	it("if the file more than one running timekeep they should be stopped", async () => {
		const vault = new MockVault();

		const TEST_MARKDOWN_2 = await fs.readFile(
			"src/timekeep/__fixtures__/stop/TEST_MARKDOWN_2.md",
			"utf-8"
		);

		const TEST_MARKDOWN_2_STOPPED = await fs.readFile(
			"src/timekeep/__fixtures__/stop/TEST_MARKDOWN_2_STOPPED.md",
			"utf-8"
		);

		const file = vault.addFile("TEST_MARKDOWN_2.md", TEST_MARKDOWN_2);
		await stopFileTimekeeps(vault.asVault(), file, moment("2025-11-07T00:31:03.714Z"));

		const output = await vault.read(file);
		expect(output).toEqual(TEST_MARKDOWN_2_STOPPED);
	});

	it("stops only the DF block when official and DF blocks share a Markdown file", async () => {
		const officialBlock = [
			"```timekeep",
			'{  "entries": [ { "name": "Official", "startTime": "2025-11-07T00:00:00.000Z", "endTime": null, "subEntries": null } ] }',
			"```",
		].join("\n");
		const dfBlock = [
			"```df-timekeep",
			'{"entries":[{"name":"DF owned","startTime":"2025-11-07T00:00:00.000Z","endTime":null,"subEntries":null}]}',
			"```",
		].join("\n");
		const content = ["Before", officialBlock, "Between", dfBlock, "After"].join("\n");
		const vault = new MockVault();
		const file = vault.addFile("mixed.md", content);

		const amount = await stopFileTimekeeps(
			vault.asVault(),
			file,
			moment("2025-11-07T00:31:03.714Z")
		);

		const expectedDfBlock = [
			"```df-timekeep",
			'{"entries":[{"name":"DF owned","startTime":"2025-11-07T00:00:00.000Z","endTime":"2025-11-07T00:31:03.714Z","subEntries":null}]}',
			"```",
		].join("\n");
		const output = await vault.read(file);

		expect(amount).toBe(1);
		expect(output).toContain(officialBlock);
		expect(output).toBe(
			["Before", officialBlock, "Between", expectedDfBlock, "After"].join("\n")
		);
	});

	it("operation should fail if timekeep data changes before processing occurs", async () => {
		const vault = new MockVault();

		const TEST_MARKDOWN_2 = await fs.readFile(
			"src/timekeep/__fixtures__/stop/TEST_MARKDOWN_2.md",
			"utf-8"
		);

		const file = vault.addFile("TEST_MARKDOWN_2.md", TEST_MARKDOWN_2);

		// Give the valid value back the first time
		vault.read.mockReturnValueOnce(Promise.resolve(TEST_MARKDOWN_2));

		// Provide a different value for the second one
		vault.read.mockReturnValueOnce(Promise.resolve(""));

		await expect(
			stopFileTimekeeps(vault.asVault(), file, moment("2025-11-07T00:31:03.714Z"))
		).rejects.toThrow();
	});
});
