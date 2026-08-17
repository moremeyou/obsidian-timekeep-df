import { describe, expect, it, vi } from "vitest";

import { MockTFile, MockVault } from "@/__mocks__/obsidian";

import { TimesheetFileSaveAdapter } from "./TimesheetFileSaveAdapter";

describe("TimesheetFileSaveAdapter", () => {
	it("refuses an official .timekeep file without modifying it", async () => {
		const content = '{"entries":[]}';
		const vault = new MockVault();
		const file = vault.addFile("official.timekeep", content);
		const modify = vi.spyOn(vault, "modify");
		const adapter = new TimesheetFileSaveAdapter(vault.asVault(), file);

		await expect(adapter.onSave({ entries: [] })).rejects.toThrow(
			"Refusing to save a non-DF standalone file"
		);

		expect(modify).not.toHaveBeenCalled();
		expect((file as unknown as MockTFile)._content).toBe(content);
	});
});
