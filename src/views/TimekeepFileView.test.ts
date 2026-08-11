import { describe, expect, it } from "vitest";

import { MockVault } from "@/__mocks__/obsidian";

import TimekeepFileView from "./TimekeepFileView";

describe("TimekeepFileView", () => {
	it("refuses an official .timekeep file before reading it", async () => {
		const vault = new MockVault();
		const file = vault.addFile("official.timekeep", '{"entries":[]}');

		await expect(
			TimekeepFileView.prototype.onLoadFile.call({} as TimekeepFileView, file)
		).rejects.toThrow("Refusing to open a non-DF standalone file");
		expect(vault.read).not.toHaveBeenCalled();
	});
});
