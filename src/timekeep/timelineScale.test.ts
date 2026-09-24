import moment from "moment";
import { describe, expect, it } from "vitest";

import { defaultSettings } from "@/settings";

import {
	workdayTimelineScale,
	timelineOffset,
	timelineTime,
	timelineTimeVisible,
	timelineIntervalVisible,
	timelineEditWindow,
} from "./timelineScale";
import { createTimekeepViewState, TimekeepViewMode } from "./view";

const hour = 3600_000;
const at = (date: string) => moment(date).valueOf();
const state = (mode = TimekeepViewMode.DAY, date = "2026-08-12") =>
	createTimekeepViewState(mode, moment(date));
const scaleFor = (mode = TimekeepViewMode.DAY, date = "2026-08-12", settings = defaultSettings) =>
	workdayTimelineScale(state(mode, date), settings);

describe("workday timeline scale", () => {
	it("uses configured clock hours regardless of automatic breaks or capacity hours", () => {
		const scale = scaleFor(TimekeepViewMode.DAY, "2026-08-12", {
			...defaultSettings,
			workingHoursStart: "08:30",
			workingHoursEnd: "16:45",
			automaticBreaksEnabled: false,
			totalDailyWorkingHours: 4,
		});
		expect(scale.duration).toBe(8.25 * hour);
		expect(scale.segments).toEqual([
			{ start: at("2026-08-12T08:30"), end: at("2026-08-12T16:45"), offset: 0 },
		]);
	});
	it.each([
		[TimekeepViewMode.DAY, 1],
		[TimekeepViewMode.WEEK, 5],
		[TimekeepViewMode.MONTH, 21],
		[TimekeepViewMode.QUARTER, 66],
		[TimekeepViewMode.YEAR, 261],
	])("scales %s by the number of workdays", (mode, count) => {
		const scale = scaleFor(mode);
		expect(scale.segments).toHaveLength(count);
		expect(scale.duration).toBe(count * 8 * hour);
	});
	it("still shows the selected workday on a weekend in Day mode", () => {
		expect(scaleFor(TimekeepViewMode.DAY, "2026-08-15").segments).toHaveLength(1);
	});
	it("uses the configured number of days from Monday", () => {
		const scale = scaleFor(TimekeepViewMode.WEEK, "2026-08-12", {
			...defaultSettings,
			totalDaysPerWeek: 6,
		});
		expect(scale.segments).toHaveLength(6);
		expect(moment(scale.segments[5].start).isoWeekday()).toBe(6);
	});
	it("collapses nights and makes the adjoining boundary depend on the edited edge", () => {
		const scale = scaleFor(TimekeepViewMode.WEEK);
		expect(timelineOffset(scale, at("2026-08-11T10:00"))).toBe(9 * hour);
		expect(timelineTime(scale, 9 * hour)).toBe(at("2026-08-11T10:00"));
		expect(timelineOffset(scale, at("2026-08-10T22:00"))).toBe(8 * hour);
		expect(timelineTime(scale, 8 * hour, "end")).toBe(at("2026-08-10T17:00"));
		expect(timelineTime(scale, 8 * hour, "start")).toBe(at("2026-08-11T09:00"));
		expect(timelineTime(scale, -hour)).toBe(at("2026-08-10T08:00"));
		expect(timelineTime(scale, 100 * hour)).toBe(at("2026-08-17T05:00"));
	});
	it("omits off-hours intervals while retaining work-hour portions of crossing blocks", () => {
		const scale = scaleFor(TimekeepViewMode.WEEK);
		expect(timelineIntervalVisible(scale, at("2026-08-10T18:00"), at("2026-08-11T08:00"))).toBe(
			false
		);
		expect(timelineIntervalVisible(scale, at("2026-08-10T16:00"), at("2026-08-11T10:00"))).toBe(
			true
		);
		expect(timelineTimeVisible(scale, at("2026-08-11T07:00"))).toBe(false);
		expect(timelineTimeVisible(scale, at("2026-08-11T09:00"))).toBe(true);
	});
	it("anchors overnight workdays to their starting date and includes their next-morning endpoint", () => {
		const view = state();
		const scale = workdayTimelineScale(view, {
			...defaultSettings,
			workingHoursStart: "22:00",
			workingHoursEnd: "06:00",
		});
		expect(scale.duration).toBe(8 * hour);
		expect(timelineTime(scale, 8 * hour)).toBe(at("2026-08-13T06:00"));
		const window = timelineEditWindow(view, scale);
		expect(window.start.valueOf()).toBe(at("2026-08-12T00:00"));
		expect(window.end.valueOf()).toBe(at("2026-08-13T06:00"));
	});
	it.each(["bad", "09:00"])(
		"falls back to default work hours for invalid/equal end %s",
		(end) => {
			const scale = scaleFor(TimekeepViewMode.DAY, "2026-08-12", {
				...defaultSettings,
				workingHoursEnd: end,
			});
			expect(scale.duration).toBe(8 * hour);
		}
	);
	it("preserves local workday hours through spring and autumn clock changes", () => {
		for (const date of ["2026-03-29", "2026-10-25"]) {
			const scale = scaleFor(TimekeepViewMode.WEEK, date, {
				...defaultSettings,
				totalDaysPerWeek: 7,
			});
			for (const segment of scale.segments) {
				expect(moment(segment.start).format("HH:mm")).toBe("09:00");
				expect(moment(segment.end).format("HH:mm")).toBe("17:00");
			}
			expect(scale.duration).toBe(56 * hour);
		}
	});
	it("extends the configured day to cover early starts and late finishes", () => {
		const scale = workdayTimelineScale(state(), defaultSettings, [
			{ start: at("2026-08-12T06:30"), end: at("2026-08-12T07:30") },
			{ start: at("2026-08-12T16:30"), end: at("2026-08-12T19:15") },
		]);
		expect(scale.segments).toEqual([
			{ start: at("2026-08-12T06:30"), end: at("2026-08-12T19:15"), offset: 0 },
		]);
		expect(scale.duration).toBe(12.75 * hour);
	});
	it("adds recorded weekend days to a weekly scale", () => {
		const scale = workdayTimelineScale(state(TimekeepViewMode.WEEK), defaultSettings, [
			{ start: at("2026-08-15T08:00"), end: at("2026-08-15T10:00") },
			{ start: at("2026-08-15T14:00"), end: at("2026-08-15T16:00") },
			{ start: at("2026-08-16T11:00"), end: at("2026-08-16T13:00") },
		]);
		expect(scale.segments).toHaveLength(7);
		expect(scale.segments[5].start).toBe(at("2026-08-15T08:00"));
		expect(scale.segments[5].end).toBe(at("2026-08-15T16:00"));
		expect(scale.segments[6].start).toBe(at("2026-08-16T11:00"));
		expect(scale.duration).toBe(50 * hour);
	});
	it("joins a late overnight finish to its scheduled shift", () => {
		const scale = workdayTimelineScale(
			state(),
			{ ...defaultSettings, workingHoursStart: "22:00", workingHoursEnd: "06:00" },
			[{ start: at("2026-08-12T21:00"), end: at("2026-08-13T07:30") }]
		);
		expect(scale.segments).toEqual([
			{ start: at("2026-08-12T21:00"), end: at("2026-08-13T07:30"), offset: 0 },
		]);
	});
	it("includes only the part of a boundary-crossing block in the selected period", () => {
		const scale = workdayTimelineScale(state(), defaultSettings, [
			{ start: at("2026-08-11T22:00"), end: at("2026-08-12T07:00") },
		]);
		expect(scale.segments[0].start).toBe(at("2026-08-12T00:00"));
		expect(scale.segments[0].end).toBe(at("2026-08-12T17:00"));
	});
});
