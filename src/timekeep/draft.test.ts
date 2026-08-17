import moment from "moment";
import { describe, expect, it } from "vitest";

import { prepareHistoricalActivityDraft, prepareHistoricalBlockDraft } from "./draft";

import type { TimeEntry } from "@/timekeep/schema";

describe("prepareHistoricalActivityDraft", () => {
	it("uses the autocomplete registry spelling and reuses the same empty Activity", () => {
		const initialTime = moment("2026-08-11T14:37:42");
		const first = prepareHistoricalActivityDraft(
			[],
			"project management",
			["Project Management"],
			initialTime
		);
		const second = prepareHistoricalActivityDraft(
			first.entries,
			"PROJECT MANAGEMENT",
			["Project Management"],
			initialTime
		);

		expect(first.entries).toHaveLength(1);
		expect(first.entries[0]).toMatchObject({
			name: "Project Management",
			startTime: null,
			endTime: null,
			subEntries: null,
		});
		expect(second.entries).toBe(first.entries);
		expect(second.draft.entryId).toBe(first.draft.entryId);
		expect(second.draft.initialTime.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-08-11 14:37:00");
	});

	it("adds a draft Block to an existing Activity without replacing its recorded interval", () => {
		const recordedActivity: TimeEntry = {
			id: 10,
			name: "Project Management",
			startTime: moment("2026-08-10T09:00"),
			endTime: moment("2026-08-10T10:00"),
			subEntries: null,
		};

		const prepared = prepareHistoricalActivityDraft(
			[recordedActivity],
			"Project Management",
			["Project Management"],
			moment("2026-08-11T14:30")
		);
		const activity = prepared.entries[0];

		expect(activity.id).toBe(recordedActivity.id);
		expect(activity.collapsed).toBe(true);
		expect(activity.subEntries).toHaveLength(2);
		expect(activity.subEntries?.[0]).toMatchObject({
			name: "Block 1",
			startTime: recordedActivity.startTime,
			endTime: recordedActivity.endTime,
		});
		expect(activity.subEntries?.[1]).toMatchObject({
			id: prepared.draft.entryId,
			startTime: null,
			endTime: null,
		});
	});

	it("reopens an existing empty Block instead of adding another one", () => {
		const activity: TimeEntry = {
			id: 10,
			name: "Project Management",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 11,
					name: "Block 1",
					startTime: moment("2026-08-10T09:00"),
					endTime: moment("2026-08-10T10:00"),
					subEntries: null,
				},
				{
					id: 12,
					name: "Block 1",
					startTime: null,
					endTime: null,
					subEntries: null,
				},
			],
		};

		const prepared = prepareHistoricalActivityDraft(
			[activity],
			"Project Management",
			["Project Management"],
			moment("2026-08-11T14:30")
		);

		expect(prepared.entries).toEqual([activity]);
		expect(prepared.entries[0].subEntries).toHaveLength(2);
		expect(prepared.draft.entryId).toBe(12);
	});

	it("numbers a requested child Block from siblings on the selected day", () => {
		const activity: TimeEntry = {
			id: 10,
			name: "Project Management",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 11,
					name: "Block 1",
					startTime: moment("2026-08-11T09:00"),
					endTime: moment("2026-08-11T10:00"),
					subEntries: null,
				},
				{
					id: 12,
					name: "Custom name",
					startTime: moment("2026-08-11T11:00"),
					endTime: moment("2026-08-11T12:00"),
					subEntries: null,
				},
				{
					id: 13,
					name: "Block 1",
					startTime: moment("2026-08-10T09:00"),
					endTime: moment("2026-08-10T10:00"),
					subEntries: null,
				},
			],
		};

		const prepared = prepareHistoricalBlockDraft(
			[activity],
			activity.id,
			moment("2026-08-11T14:30")
		);

		expect(prepared?.entries[0].subEntries?.at(-1)?.name).toBe("Block 3");
		expect(prepared?.draft.entryId).toBe(prepared?.entries[0].subEntries?.at(-1)?.id);
	});
});
