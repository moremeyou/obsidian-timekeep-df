// @vitest-environment happy-dom

import type { App } from "obsidian";

import moment from "moment";
import { describe, expect, it, vi } from "vitest";

import type { TimesheetSaveAdapter } from "@/save/TimesheetSaveAdapter";

import { createMockContainer, MockNotice, MockVault } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import TimekeepView from "./TimekeepView";

import { prepareHistoricalBlockDraft } from "@/timekeep/draft";
import type { LoadResult } from "@/timekeep/parser";

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

	it("serializes saves and coalesces rapid updates to the latest state", async () => {
		const vault = new MockVault();
		let releaseFirstSave: VoidFunction = () => {};
		let activeSaves = 0;
		let maximumActiveSaves = 0;
		const firstSavePending = new Promise<void>((resolve) => {
			releaseFirstSave = resolve;
		});
		const onSave = vi.fn(async () => {
			activeSaves += 1;
			maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
			if (onSave.mock.calls.length === 1) await firstSavePending;
			activeSaves -= 1;
		});
		const view = new TimekeepView(
			createMockContainer(),
			{ vault: vault.asVault() } as App,
			createStore(defaultSettings),
			createStore({}),
			{} as TimekeepAutocomplete,
			createStore<LoadResult | null>(null),
			{ onLoad: vi.fn(), onUnload: vi.fn(), onSave }
		);
		const state = (name: string) => ({
			entries: [{ id: 1, name, startTime: null, endTime: null, subEntries: null as null }],
		});

		view.timekeep.setState(state("First"));
		const first = view.onSave();
		view.timekeep.setState(state("Second"));
		void view.onSave();
		view.timekeep.setState(state("Latest"));
		const latest = view.onSave();

		expect(onSave).toHaveBeenCalledOnce();
		releaseFirstSave();
		await Promise.all([first, latest]);

		expect(onSave).toHaveBeenCalledTimes(2);
		expect(maximumActiveSaves).toBe(1);
		expect(onSave.mock.calls[1][0].entries[0].name).toBe("Latest");
	});

	it("does not persist a historical Block until it has a valid interval", async () => {
		const vault = new MockVault();
		const activity = {
			id: 10,
			name: "Project Management",
			startTime: moment("2026-08-10T09:00"),
			endTime: moment("2026-08-10T10:00"),
			subEntries: null,
		};
		const onSave = vi.fn().mockResolvedValue(undefined);
		const view = new TimekeepView(
			createMockContainer(),
			{ vault: vault.asVault() } as App,
			createStore(defaultSettings),
			createStore({}),
			{} as TimekeepAutocomplete,
			createStore<LoadResult | null>({
				success: true,
				timekeep: { entries: [activity] },
			}),
			{ onLoad: vi.fn(), onUnload: vi.fn(), onSave }
		);
		view.onUpdateContent();

		const prepared = prepareHistoricalBlockDraft(
			view.timekeep.getState().entries,
			activity.id,
			moment("2026-08-11T14:25")
		)!;
		view.historicalDraft.setState(prepared.draft);
		view.timekeep.setState({ entries: prepared.entries });
		await view.onSave();

		expect(onSave).not.toHaveBeenCalled();

		const savedEntries = prepared.entries.map((entry) =>
			entry.id === prepared.draft.activityId && entry.subEntries !== null
				? {
						...entry,
						subEntries: entry.subEntries.map((child) =>
							child.id === prepared.draft.entryId
								? {
										...child,
										startTime: moment("2026-08-11T14:25"),
										endTime: moment("2026-08-11T14:30"),
									}
								: child
						),
					}
				: entry
		);
		view.historicalDraft.setState(null);
		view.timekeep.setState({ entries: savedEntries });
		await view.onSave();

		expect(onSave).toHaveBeenCalledOnce();
		expect(onSave.mock.calls[0][0].entries[0].subEntries?.at(-1)?.startTime).not.toBeNull();
	});
});
