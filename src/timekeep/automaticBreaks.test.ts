import moment from "moment";
import { describe, expect, it } from "vitest";

import { defaultSettings } from "@/settings";

import type { TimeEntry, Timekeep } from "./schema";

import {
	endAutomaticBreakAtWorkingHoursEnd,
	getWorkingHoursWindow,
	isAfterWorkingHours,
	stopTimekeepWithAutomaticBreak,
} from "./automaticBreaks";

const enabledSettings = {
	...defaultSettings,
	automaticBreaksEnabled: true,
	automaticBreakName: "Break",
	workingHoursStart: "09:00",
	workingHoursEnd: "17:00",
};

const limitedSettings = {
	...enabledSettings,
	limitAutomaticBreaksToWorkingHours: true,
};

function runningActivity(name = "Project", start = "2026-08-17T10:00:00"): Timekeep {
	return {
		entries: [
			{
				id: 1,
				name,
				startTime: moment(start),
				endTime: null,
				subEntries: null,
			},
		],
	};
}

describe("automatic breaks", () => {
	it("does not create a Break while the feature is disabled", () => {
		const now = moment("2026-08-17T12:00:00");
		const output = stopTimekeepWithAutomaticBreak(runningActivity(), now, defaultSettings);

		expect(output.entries).toHaveLength(1);
		expect(output.entries[0].endTime?.isSame(now)).toBe(true);
	});

	it("starts a Break when work is explicitly stopped during working hours", () => {
		const now = moment("2026-08-17T12:00:00");
		const output = stopTimekeepWithAutomaticBreak(runningActivity(), now, enabledSettings);

		expect(output.entries).toHaveLength(2);
		expect(output.entries[0].endTime?.isSame(now)).toBe(true);
		expect(output.entries[1]).toMatchObject({ name: "Break", endTime: null });
		expect(output.entries[1].startTime?.isSame(now)).toBe(true);
	});

	it("reuses the configured Break Activity and starts a new dated Block", () => {
		const previousBreak: TimeEntry = {
			id: 2,
			name: " break ",
			startTime: moment("2026-08-16T12:00:00"),
			endTime: moment("2026-08-16T12:30:00"),
			subEntries: null,
		};
		const input = runningActivity();
		input.entries.push(previousBreak);
		const now = moment("2026-08-17T12:00:00");
		const output = stopTimekeepWithAutomaticBreak(input, now, enabledSettings);

		expect(output.entries).toHaveLength(2);
		expect(output.entries[1].subEntries).toHaveLength(2);
		expect(output.entries[1].subEntries?.at(-1)?.startTime?.isSame(now)).toBe(true);
	});

	it("starts a Break outside working hours when the limiter is disabled", () => {
		const now = moment("2026-08-17T18:00:00");
		const output = stopTimekeepWithAutomaticBreak(runningActivity(), now, enabledSettings);

		expect(output.entries).toHaveLength(2);
		expect(output.entries[0].endTime?.isSame(now)).toBe(true);
		expect(output.entries.at(-1)?.name).toBe("Break");
		expect(output.entries.at(-1)?.endTime).toBeNull();
	});

	it("does not start a Break outside working hours when the limiter is enabled", () => {
		const now = moment("2026-08-17T18:00:00");
		const output = stopTimekeepWithAutomaticBreak(runningActivity(), now, limitedSettings);

		expect(output.entries).toHaveLength(1);
		expect(output.entries[0].endTime?.isSame(now)).toBe(true);
	});

	it("stops a running Break without recursively starting another one", () => {
		const now = moment("2026-08-17T12:30:00");
		const output = stopTimekeepWithAutomaticBreak(
			runningActivity("BREAK", "2026-08-17T12:00:00"),
			now,
			enabledSettings
		);

		expect(output.entries).toHaveLength(1);
		expect(output.entries[0].endTime?.isSame(now)).toBe(true);
	});

	it("caps a running Break at the configured workday end", () => {
		const input = runningActivity("Break", "2026-08-17T16:30:00");
		const output = endAutomaticBreakAtWorkingHoursEnd(
			input,
			moment("2026-08-17T18:15:00"),
			limitedSettings
		);

		expect(output.entries[0].endTime?.format("YYYY-MM-DD HH:mm:ss")).toBe(
			"2026-08-17 17:00:00"
		);
	});

	it("does not cap a running Break when the limiter is disabled", () => {
		const input = runningActivity("Break", "2026-08-17T16:30:00");
		const output = endAutomaticBreakAtWorkingHoursEnd(
			input,
			moment("2026-08-17T18:15:00"),
			enabledSettings
		);

		expect(output).toBe(input);
		expect(output.entries[0].endTime).toBeNull();
	});

	it("supports overnight working-hour windows", () => {
		const settings = {
			...limitedSettings,
			workingHoursStart: "22:00",
			workingHoursEnd: "06:00",
		};
		const window = getWorkingHoursWindow(moment("2026-08-18T02:00:00"), settings);
		expect(window?.start.format("YYYY-MM-DD HH:mm")).toBe("2026-08-17 22:00");
		expect(window?.end.format("YYYY-MM-DD HH:mm")).toBe("2026-08-18 06:00");

		const output = stopTimekeepWithAutomaticBreak(
			runningActivity("Project", "2026-08-18T01:00:00"),
			moment("2026-08-18T02:00:00"),
			settings
		);
		expect(output.entries.at(-1)?.name).toBe("Break");
	});

	it.each([
		["2026-08-18T02:00:00", false],
		["2026-08-18T06:00:00", true],
		["2026-08-18T12:00:00", true],
		["2026-08-18T21:59:00", true],
		["2026-08-18T22:00:00", false],
	])("detects off-hours after an overnight shift at %s", (at, expected) => {
		const settings = {
			...enabledSettings,
			workingHoursStart: "22:00",
			workingHoursEnd: "06:00",
		};

		expect(isAfterWorkingHours(moment(at), settings)).toBe(expected);
	});
});
