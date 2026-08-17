import moment from "moment";
import { expect, it, describe } from "vitest";

import type { TimeEntry } from "./schema";

import { stripTimekeepRuntimeData, TimeEntryGroup } from "./schema";
import {
	updateEntry,
	removeEntry,
	removeActivityTimeWithinWindow,
	removeSubEntry,
	setEntryCollapsed,
	stopRunningEntries,
	stopTimekeep,
} from "./update";
import { getTimekeepViewWindow, TimekeepViewMode } from "./view";

describe("updateEntry", () => {
	it("updating existing entry should succeed", async () => {
		const { entries, entryToUpdate, updatedEntry, expectedEntries } =
			await import("./__fixtures__/manipulating/update_entry/updateEntry");

		const updated = updateEntry(entries, entryToUpdate.id, updatedEntry);
		expect(updated).toEqual(expectedEntries);
	});
});

describe("setEntryCollapsed", () => {
	it("should update group collapse state when set to true", async () => {
		const { input } =
			await import("./__fixtures__/manipulating/collapse/shouldUpdateCollapseTrue");

		const collapsed = setEntryCollapsed(input, true);

		expect(collapsed.subEntries).not.toBeNull();
		expect((collapsed as TimeEntryGroup).collapsed).toBeDefined();
		expect((collapsed as TimeEntryGroup).collapsed).toBe(true);
	});

	it("collapsed state should be undefined when false", async () => {
		const { input } =
			await import("./__fixtures__/manipulating/collapse/shouldUpdateCollapseFalse");
		const collapsed = setEntryCollapsed(input, false);

		expect(collapsed.subEntries).not.toBeNull();
		expect((collapsed as TimeEntryGroup).collapsed).toBeUndefined();
	});

	it("should not set collapse state on single entry", async () => {
		const { input } =
			await import("./__fixtures__/manipulating/collapse/shouldNotCollapseSingleEntry");

		const collapsed = setEntryCollapsed(input, true);

		expect(collapsed.subEntries).toBeNull();
		expect((collapsed as TimeEntryGroup).collapsed).toBeUndefined();
	});
});

describe("stopRunningEntries", () => {
	it("should stop running entries", async () => {
		const { input, endTime, expected } =
			await import("./__fixtures__/manipulating/stopping_entries/stopRunningEntries");

		const output = stopRunningEntries(input, endTime);
		expect(output).toEqual(expected);
	});
});

describe("stopTimekeep", () => {
	it("should stop timekeep running entries", async () => {
		const { input, endTime, expected } =
			await import("./__fixtures__/manipulating/stopping_entries/stopRunningEntriesTimekeep");

		const output = stopTimekeep(input, endTime);
		expect(stripTimekeepRuntimeData(output)).toEqual(stripTimekeepRuntimeData(expected));
	});
});

describe("removeEntry", () => {
	it("remove on single entry should stay same if not target", async () => {
		const { entries, entryToRemove, expectedEntries } =
			await import("./__fixtures__/manipulating/remove_entry/removeSingleEntry");

		const updated = removeEntry(entries, entryToRemove);
		expect(updated).toEqual(expectedEntries);
	});

	it("should be able to remove entry", async () => {
		const { entries, entryToRemove, expectedEntries } =
			await import("./__fixtures__/manipulating/remove_entry/removeEntrySuccess");
		const updated = removeEntry(entries, entryToRemove);
		expect(updated).toEqual(expectedEntries);
	});

	it("should be able to remove nested entry", async () => {
		const { entries, entryToRemove, expectedEntries } =
			await import("./__fixtures__/manipulating/remove_entry/removeNestedEntry");
		const updated = removeEntry(entries, entryToRemove);
		expect(updated).toEqual(expectedEntries);
	});

	it("should collapse groups with only one entry on remove", async () => {
		const { entries, entryToRemove, expectedEntries } =
			await import("./__fixtures__/manipulating/remove_entry/removeEntryCollapse");
		const updated = removeEntry(entries, entryToRemove);
		expect(updated).toEqual(expectedEntries);
	});

	it("should collapse groups with only one entry on remove (single)", async () => {
		const { entries, entryToRemove, expectedEntries } =
			await import("./__fixtures__/manipulating/remove_entry/removeEntryCollapseSingle");
		const updated = removeEntry(entries, entryToRemove);
		expect(updated).toEqual(expectedEntries);
	});

	it("should not collapse folder on empty entries", async () => {
		const { entries, entryToRemove, expectedEntries } =
			await import("./__fixtures__/manipulating/remove_entry/removeEntryFolder");
		const updated = removeEntry(entries, entryToRemove);
		expect(updated).toEqual(expectedEntries);
	});
});

describe("removeActivityTimeWithinWindow", () => {
	it.each([
		[TimekeepViewMode.DAY, "2026-08-12", "2026-08-12T09:00:00", "2026-08-11T09:00:00"],
		[TimekeepViewMode.WEEK, "2026-08-12", "2026-08-10T09:00:00", "2026-08-09T09:00:00"],
		[TimekeepViewMode.MONTH, "2026-08-12", "2026-08-01T09:00:00", "2026-07-31T09:00:00"],
		[TimekeepViewMode.QUARTER, "2026-08-12", "2026-07-01T09:00:00", "2026-06-30T09:00:00"],
		[TimekeepViewMode.YEAR, "2026-08-12", "2026-01-01T09:00:00", "2025-12-31T09:00:00"],
	])("respects exclusive %s boundaries", (mode, anchorDate, inside, outside) => {
		const entries: TimeEntry[] = [
			{
				id: 1,
				name: "Activity",
				startTime: null,
				endTime: null,
				subEntries: [
					{
						id: 2,
						name: "Outside",
						startTime: moment(outside),
						endTime: moment(outside).add(1, "hour"),
						subEntries: null,
					},
					{
						id: 3,
						name: "Inside",
						startTime: moment(inside),
						endTime: moment(inside).add(1, "hour"),
						subEntries: null,
					},
				],
			},
		];
		const output = removeActivityTimeWithinWindow(
			entries,
			1,
			moment("2026-08-12T12:00:00"),
			getTimekeepViewWindow({ mode, anchorDate, followCurrent: false })
		);

		expect(output[0].subEntries?.map((entry) => entry.id)).toEqual([2]);
	});

	it("removes only Blocks inside the selected Day and preserves the Activity", () => {
		const entries: TimeEntry[] = [
			{
				id: 1,
				name: "Project Management",
				startTime: null,
				endTime: null,
				collapsed: false,
				subEntries: [
					{
						id: 2,
						name: "Block 1",
						startTime: moment("2026-08-11T09:00:00"),
						endTime: moment("2026-08-11T10:00:00"),
						subEntries: null,
					},
					{
						id: 3,
						name: "Block 1",
						startTime: moment("2026-08-12T09:00:00"),
						endTime: moment("2026-08-12T10:00:00"),
						subEntries: null,
					},
				],
			},
		];

		const output = removeActivityTimeWithinWindow(entries, 1, moment("2026-08-12T12:00:00"), {
			start: moment("2026-08-12T00:00:00"),
			end: moment("2026-08-13T00:00:00"),
		});

		expect(output[0].collapsed).toBe(true);
		expect(output[0].subEntries?.map((entry) => entry.id)).toEqual([2]);
	});

	it("splits a Block spanning the entire selected range without losing outside time", () => {
		const entries: TimeEntry[] = [
			{
				id: 1,
				name: "Long Activity",
				startTime: moment("2026-08-11T23:00:00"),
				endTime: moment("2026-08-13T01:00:00"),
				subEntries: null,
			},
		];
		const output = removeActivityTimeWithinWindow(entries, 1, moment("2026-08-13T12:00:00"), {
			start: moment("2026-08-12T00:00:00"),
			end: moment("2026-08-13T00:00:00"),
		});

		expect(output[0].subEntries).toHaveLength(2);
		expect(output[0].subEntries?.[0].endTime?.format("YYYY-MM-DD HH:mm")).toBe(
			"2026-08-12 00:00"
		);
		expect(output[0].subEntries?.[1].startTime?.format("YYYY-MM-DD HH:mm")).toBe(
			"2026-08-13 00:00"
		);
	});

	it("keeps an empty collapsed Activity after its only Block is removed", () => {
		const output = removeActivityTimeWithinWindow(
			[
				{
					id: 1,
					name: "Activity",
					startTime: moment("2026-08-12T09:00:00"),
					endTime: moment("2026-08-12T10:00:00"),
					subEntries: null,
				},
			],
			1,
			moment("2026-08-12T12:00:00"),
			{
				start: moment("2026-08-12T00:00:00"),
				end: moment("2026-08-13T00:00:00"),
			}
		);

		expect(output[0]).toMatchObject({
			name: "Activity",
			collapsed: true,
			startTime: null,
			endTime: null,
			subEntries: [],
		});
	});

	it("removes a running Block from the current range without affecting other dates", () => {
		const output = removeActivityTimeWithinWindow(
			[
				{
					id: 1,
					name: "Activity",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Earlier",
							startTime: moment("2026-08-11T09:00:00"),
							endTime: moment("2026-08-11T10:00:00"),
							subEntries: null,
						},
						{
							id: 3,
							name: "Running",
							startTime: moment("2026-08-12T09:00:00"),
							endTime: null,
							subEntries: null,
						},
					],
				},
			],
			1,
			moment("2026-08-12T12:00:00"),
			{
				start: moment("2026-08-12T00:00:00"),
				end: moment("2026-08-13T00:00:00"),
			}
		);

		expect(output[0].subEntries?.map((entry) => entry.id)).toEqual([2]);
	});
});

describe("removeSubEntry", () => {
	it("attempting to remove sub entry on non group should do nothing", async () => {
		const { parent, entryToRemove } =
			await import("./__fixtures__/manipulating/remove_entry/removeEntry");
		const output = removeSubEntry(parent, entryToRemove);
		expect(output).toEqual(parent);
	});
});
