import type { MarkdownPostProcessorContext } from "obsidian";

import { describe, expect, it, vi } from "vitest";

import { MockTFile, MockVault } from "@/__mocks__/obsidian";

import { TimesheetMarkdownSaveAdapter } from "./TimesheetMarkdownSaveAdapter";

describe("TimesheetMarkdownSaveAdapter", () => {
	it("refuses to overwrite malformed tracker data", async () => {
		const malformedContent = ["```df-timekeep", "{", "```"].join("\n");
		const vault = new MockVault();
		const file = vault.addFile("malformed.md", malformedContent);
		Object.assign(vault, {
			getFileByPath: vi.fn(() => file),
		});
		const context = {
			sourcePath: file.path,
			getSectionInfo: vi.fn(() => ({
				lineStart: 0,
				lineEnd: 2,
				text: malformedContent,
			})),
		} as unknown as MarkdownPostProcessorContext;
		const adapter = new TimesheetMarkdownSaveAdapter(
			vault.asVault(),
			{} as HTMLElement,
			context
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(adapter.onSave({ entries: [] })).rejects.toThrow(
			"Refusing to overwrite invalid timekeep data"
		);

		expect(vault.write).not.toHaveBeenCalled();
		expect((file as unknown as MockTFile)._content).toBe(malformedContent);
	});

	it("refuses a stale position that now points at an official fence without writing", async () => {
		const officialContent = ["```timekeep", '{"entries":[]}', "```"].join("\n");
		const vault = new MockVault();
		const file = vault.addFile("mixed.md", officialContent);
		Object.assign(vault, {
			getFileByPath: vi.fn(() => file),
		});
		const context = {
			sourcePath: file.path,
			getSectionInfo: vi.fn(() => ({
				lineStart: 0,
				lineEnd: 2,
				text: officialContent,
			})),
		} as unknown as MarkdownPostProcessorContext;
		const adapter = new TimesheetMarkdownSaveAdapter(
			vault.asVault(),
			{} as HTMLElement,
			context
		);

		await expect(adapter.onSave({ entries: [] })).rejects.toThrow(
			"Content timekeep out of sync"
		);

		expect(vault.process).toHaveBeenCalledOnce();
		expect(vault.write).not.toHaveBeenCalled();
		expect((file as unknown as MockTFile)._content).toBe(officialContent);
	});
});
