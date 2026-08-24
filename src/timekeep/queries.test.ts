import moment from "moment";
import { expect, it, describe } from "vitest";

import {
	getEntryById,
	isKeepRunning,
	getPathToEntry,
	isEntryRunning,
	getRunningEntry,
	getEntryDuration,
	getTotalDuration,
	getEntriesNames,
	getStartTime,
	getEntryTimeBounds,
	getMostRecentBlockWithinWindow,
	isEntryWithinWindow,
} from "./queries";
import { TimeEntry } from "./schema";
import { getTimekeepViewWindow, TimekeepViewMode } from "./view";

describe("getEntryById", () => {
	it("find top level entry", async () => {
		const { input, targetEntry, targetEntryId } =
			await import("./__fixtures__/checking/findEntryById");

		const output = getEntryById(targetEntryId, input);
		expect(output).toEqual(targetEntry);
	});

	it("find nested entry", async () => {
		const { input, targetEntry, targetEntryId } =
			await import("./__fixtures__/checking/findEntryByIdNested");

		const output = getEntryById(targetEntryId, input);
		expect(output).toEqual(targetEntry);
	});

	it("find nested entry second element", async () => {
		const { input, targetEntry, targetEntryId } =
			await import("./__fixtures__/checking/findEntryByIdNestedSecond");

		const output = getEntryById(targetEntryId, input);
		expect(output).toEqual(targetEntry);
	});

	it("find entry non existent", async () => {
		const { input, targetEntryId } =
			await import("./__fixtures__/checking/findEntryByIdMissing");

		const output = getEntryById(targetEntryId, input);
		expect(output).toBeUndefined();
	});

	it("find entry non existent nested", async () => {
		const { input, targetEntryId } =
			await import("./__fixtures__/checking/findEntryByIdMissingNested");

		const output = getEntryById(targetEntryId, input);
		expect(output).toBeUndefined();
	});
});

describe("getPathToEntry", () => {
	it("path not found", async () => {
		const { targetEntry, entries, expected } = await import("./__fixtures__/path/pathNotFound");
		const output = getPathToEntry(entries, targetEntry);
		expect(output).toEqual(expected);
	});

	it("top level path found", async () => {
		const { targetEntry, entries, expected } = await import("./__fixtures__/path/pathTopLevel");
		const output = getPathToEntry(entries, targetEntry);
		expect(output).toEqual(expected);
	});

	it("child path found", async () => {
		const { targetEntry, entries, expected } = await import("./__fixtures__/path/pathChild");
		const output = getPathToEntry(entries, targetEntry);
		expect(output).toEqual(expected);
	});

	it("deep child path found", async () => {
		const { targetEntry, entries, expected } =
			await import("./__fixtures__/path/pathDeepChild");
		const output = getPathToEntry(entries, targetEntry);
		expect(output).toEqual(expected);
	});

	it("deep child path not found", async () => {
		const { targetEntry, entries, expected } =
			await import("./__fixtures__/path/pathNotFoundDeep");
		const output = getPathToEntry(entries, targetEntry);
		expect(output).toEqual(expected);
	});

	it("should find running entry path", async () => {
		const { input, runningEntry, path } =
			await import("./__fixtures__/checking/findRunningEntryPath");

		const output = getPathToEntry(input, runningEntry);
		expect(output).toEqual(path);
	});
});

describe("isEntryRunning", () => {
	it("should determine entry running state", async () => {
		const { running, notRunning } = await import("./__fixtures__/checking/runningState");

		expect(isEntryRunning(running)).toBe(true);
		expect(isEntryRunning(notRunning)).toBe(false);
	});

	it("should determine entry running state (nested)", async () => {
		const { runningNested, stoppedNested } =
			await import("./__fixtures__/checking/runningState");

		expect(isEntryRunning(runningNested)).toBe(true);
		expect(isEntryRunning(stoppedNested)).toBe(false);
	});
});

describe("getRunningEntry", () => {
	it("should find running entry", async () => {
		const { input, runningEntry } =
			await import("./__fixtures__/checking/shouldFindRunningEntry");

		const output = getRunningEntry(input);

		expect(output).toBe(runningEntry);
	});

	it("should find nested running entry", async () => {
		const { input, runningEntry } =
			await import("./__fixtures__/checking/shouldFindRunningEntryNested");

		const output = getRunningEntry(input);

		expect(output).toBe(runningEntry);
	});

	it("should not find running entry", async () => {
		const { input } = await import("./__fixtures__/checking/shouldNotFindRunningEntry");

		const output = getRunningEntry(input);

		expect(output).toBe(null);
	});
});

describe("isKeepRunning", () => {
	it("should show keep running", async () => {
		const { input } = await import("./__fixtures__/checking/shouldBeRunning");

		expect(isKeepRunning(input)).toBe(true);
	});

	it("should show keep not running", async () => {
		const { input } = await import("./__fixtures__/checking/shouldNotBeRunning");

		expect(isKeepRunning(input)).toBe(false);
	});
});

describe("getEntryDuration", () => {
	it("should get entry duration", async () => {
		const { input, currentTime, durationMs } =
			await import("./__fixtures__/duration/shouldGetEntryDuration");

		const output = getEntryDuration(input, currentTime);

		expect(output).toBe(durationMs);
	});

	it("duration of non started entry should be zero", async () => {
		const { input, currentTime, durationMs } =
			await import("./__fixtures__/duration/nonStartedZeroDuration");

		const output = getEntryDuration(input, currentTime);

		expect(output).toBe(durationMs);
	});

	it("duration should include children", async () => {
		const { input, currentTime, expected } =
			await import("./__fixtures__/duration/durationIncludeChildren");

		const output = getEntryDuration(input, currentTime);

		expect(output).toBe(expected);
	});

	it("duration should use current as end for unfinished entries", async () => {
		const { input, endTime, durationMs } =
			await import("./__fixtures__/duration/currentEndUnfinished");

		const output = getEntryDuration(input, endTime);

		expect(output).toBe(durationMs);
	});

	it("clips a session crossing midnight to the selected day", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Overnight",
			startTime: moment("2026-08-11T23:00:00"),
			endTime: moment("2026-08-12T02:00:00"),
			subEntries: null,
		};
		const window = getTimekeepViewWindow({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-12",
			followCurrent: false,
		});

		expect(getEntryDuration(entry, moment("2026-08-12T12:00:00"), window)).toBe(
			2 * 60 * 60 * 1000
		);
		expect(getEntryTimeBounds(entry, moment("2026-08-12T12:00:00"), window)).toEqual({
			startTime: window.start,
			endTime: entry.endTime,
		});
	});

	it("shows unstarted templates only for the current window", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Template",
			startTime: null,
			endTime: null,
			subEntries: null,
		};
		const window = getTimekeepViewWindow({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-12",
			followCurrent: true,
		});

		expect(isEntryWithinWindow(entry, moment("2026-08-12T12:00:00"), window, true)).toBe(true);
		expect(isEntryWithinWindow(entry, moment("2026-08-12T12:00:00"), window, false)).toBe(
			false
		);
	});
});

describe("getMostRecentBlockWithinWindow", () => {
	it("returns the latest overlapping leaf without considering later out-of-range Blocks", () => {
		const activity: TimeEntry = {
			id: 1,
			name: "Activity",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Morning",
					startTime: moment("2026-08-12T09:00"),
					endTime: moment("2026-08-12T10:00"),
					subEntries: null,
				},
				{
					id: 3,
					name: "Afternoon",
					startTime: moment("2026-08-12T14:00"),
					endTime: moment("2026-08-12T15:00"),
					subEntries: null,
				},
				{
					id: 4,
					name: "Tomorrow",
					startTime: moment("2026-08-13T16:00"),
					endTime: moment("2026-08-13T17:00"),
					subEntries: null,
				},
			],
		};

		expect(
			getMostRecentBlockWithinWindow(
				activity,
				moment("2026-08-12T18:00"),
				getTimekeepViewWindow({
					mode: TimekeepViewMode.DAY,
					anchorDate: "2026-08-12",
					followCurrent: false,
				})
			)?.id
		).toBe(3);
	});
});

describe("getEntryTimeBounds", () => {
	it("recursively derives the earliest start and latest completed end", () => {
		const early = moment("2026-08-11T08:00:00");
		const late = moment("2026-08-12T17:00:00");
		const entry: TimeEntry = {
			id: 1,
			name: "Group",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Nested",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 3,
							name: "Part",
							startTime: early,
							endTime: moment(early).add(1, "hour"),
							subEntries: null,
						},
					],
				},
				{
					id: 4,
					name: "Part",
					startTime: moment(late).subtract(1, "hour"),
					endTime: late,
					subEntries: null,
				},
			],
		};

		expect(getEntryTimeBounds(entry, moment())).toEqual({ startTime: early, endTime: late });
	});

	it("uses current time as the derived end of a running descendant", () => {
		const startTime = moment("2026-08-12T09:00:00");
		const currentTime = moment("2026-08-12T11:30:00");
		const entry: TimeEntry = {
			id: 1,
			name: "Group",
			startTime: null,
			endTime: null,
			subEntries: [{ id: 2, name: "Part", startTime, endTime: null, subEntries: null }],
		};

		expect(getEntryTimeBounds(entry, currentTime)).toEqual({ startTime, endTime: currentTime });
	});
});

describe("getTotalDuration", () => {
	it("should get total duration", async () => {
		const { input, currentTime, expected } =
			await import("./__fixtures__/duration/totalDuration");

		const output = getTotalDuration(input, currentTime);

		expect(output).toBe(expected);
	});
});

describe("getEntriesNames", () => {
	it("empty list should return no names", () => {
		const input: TimeEntry[] = [];
		const expected: string[] = [];

		const output = new Set<string>();

		getEntriesNames(input, output);

		// Sort output for consistent result
		const outputSet = Array.from(output).sort();
		expect(outputSet).toEqual(expected);
	});

	it("should return all names from a flat list", async () => {
		const { input, expected } = await import("./__fixtures__/names/flatNames");

		const output = new Set<string>();

		getEntriesNames(input, output);

		// Sort output for consistent result
		const outputSet = Array.from(output).sort();
		expect(outputSet).toEqual(expected);
	});

	it("should return all names including names from nested entries", async () => {
		const { input, expected } = await import("./__fixtures__/names/nestedNames");

		const output = new Set<string>();
		getEntriesNames(input, output);

		// Sort output for consistent result
		const outputSet = Array.from(output).sort();
		expect(outputSet).toEqual(expected);
	});
});

describe("getStartTime", () => {
	it("should pick the earliest start time", async () => {
		const { entry, output } = await import("./__fixtures__/startTime/earlyStartTime");

		expect(getStartTime(entry, false)).toEqual(output);
	});
});
