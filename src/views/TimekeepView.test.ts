// @vitest-environment happy-dom

import type { App } from "obsidian";

import { describe, expect, it, vi } from "vitest";

import type { TimesheetSaveAdapter } from "@/save/TimesheetSaveAdapter";

import { createMockContainer, MockNotice, MockVault } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import TimekeepView from "./TimekeepView";

import type { TimekeepAutocomplete } from "@/service/autocomplete";

describe("TimekeepView", () => {
	it("identifies Timekeep DF when a failed save is backed up", async () => {
		const vault = new MockVault();
		const view = new TimekeepView(
			createMockContainer(),
			{ vault: vault.asVault() } as App,
			createStore(defaultSettings),
			createStore({}),
			{} as TimekeepAutocomplete,
			createStore(null),
			{
				onLoad: vi.fn(),
				onUnload: vi.fn(),
				onSave: vi.fn().mockRejectedValue(new Error("write failed")),
			}
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await view.onSave();

		expect(MockNotice).toHaveBeenLastCalledWith(
			expect.stringMatching(
				/^Timekeep DF: save failed; backup saved to timekeep-df-write-backup-/
			)
		);
	});

	it("identifies Timekeep DF when both save and backup fail", async () => {
		const vault = new MockVault();
		vault.create.mockRejectedValueOnce(new Error("backup failed"));
		const view = new TimekeepView(
			createMockContainer(),
			{ vault: vault.asVault() } as App,
			createStore(defaultSettings),
			createStore({}),
			{} as TimekeepAutocomplete,
			createStore(null),
			{
				onLoad: vi.fn(),
				onUnload: vi.fn(),
				onSave: vi.fn().mockRejectedValue(new Error("write failed")),
			}
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await view.onSave();

		expect(MockNotice).toHaveBeenLastCalledWith(
			"Timekeep DF: save failed and no backup file could be created"
		);
	});

	it("writes fallback data to a fork-specific backup file", async () => {
		const vault = new MockVault();
		const view = new TimekeepView(
			createMockContainer(),
			{ vault: vault.asVault() } as App,
			createStore(defaultSettings),
			createStore({}),
			{} as TimekeepAutocomplete,
			createStore(null),
			{} as TimesheetSaveAdapter
		);

		const fileName = await view.saveFallback({
			entries: [
				{
					id: 42,
					name: "Test",
					startTime: null,
					endTime: null,
					subEntries: null,
				},
			],
		});

		expect(fileName).toMatch(/^timekeep-df-write-backup-/);
		expect(vault.create).toHaveBeenCalledWith(
			fileName,
			'{"entries":[{"name":"Test","startTime":null,"endTime":null,"subEntries":null}]}'
		);
	});
});
