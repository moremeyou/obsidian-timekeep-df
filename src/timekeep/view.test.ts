import moment from "moment";
import { describe, expect, it } from "vitest";

import {
	canNavigateTimekeepViewForward,
	createTimekeepViewSnapshot,
	createTimekeepViewState,
	formatTimekeepViewLabel,
	getTimekeepViewCapacityHours,
	getTimekeepViewWindow,
	shiftTimekeepView,
	TimekeepViewMode,
} from "./view";

describe("timekeep calendar views", () => {
	it.each([
		[TimekeepViewMode.DAY, "2026-08-12", "2026-08-13"],
		[TimekeepViewMode.WEEK, "2026-08-10", "2026-08-17"],
		[TimekeepViewMode.MONTH, "2026-08-01", "2026-09-01"],
		[TimekeepViewMode.YEAR, "2026-01-01", "2027-01-01"],
	])("creates an exclusive %s window", (mode, start, end) => {
		const state = createTimekeepViewState(mode, moment("2026-08-12T14:30:00"));
		const window = getTimekeepViewWindow(state);
		expect(window.start.format("YYYY-MM-DD HH:mm:ss")).toBe(`${start} 00:00:00`);
		expect(window.end.format("YYYY-MM-DD HH:mm:ss")).toBe(`${end} 00:00:00`);
	});

	it("moves by the selected calendar period without changing modes", () => {
		const state = createTimekeepViewState(
			TimekeepViewMode.MONTH,
			moment("2026-03-31T14:30:00")
		);
		expect(shiftTimekeepView(state, -1)).toMatchObject({
			mode: TimekeepViewMode.MONTH,
			anchorDate: "2026-02-28",
			followCurrent: false,
		});
	});

	it("allows forward navigation only until the period containing today", () => {
		const currentTime = moment("2026-08-12T14:30:00");
		expect(
			canNavigateTimekeepViewForward(
				{
					mode: TimekeepViewMode.DAY,
					anchorDate: "2026-08-11",
					followCurrent: false,
				},
				currentTime
			)
		).toBe(true);
		expect(
			canNavigateTimekeepViewForward(
				{
					mode: TimekeepViewMode.DAY,
					anchorDate: "2026-08-12",
					followCurrent: true,
				},
				currentTime
			)
		).toBe(false);
	});

	it("creates an export snapshot with every row and only interval time", () => {
		const source = {
			entries: [
				{
					id: 1,
					name: "Group",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Outside",
							startTime: moment("2026-08-11T09:00:00"),
							endTime: moment("2026-08-11T10:00:00"),
							subEntries: null,
						},
						{
							id: 3,
							name: "Crosses midnight",
							startTime: moment("2026-08-11T23:00:00"),
							endTime: moment("2026-08-12T02:00:00"),
							subEntries: null,
						},
					],
				},
			],
		};
		const snapshot = createTimekeepViewSnapshot(
			source,
			moment("2026-08-12T12:00:00"),
			getTimekeepViewWindow({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		const entries = snapshot.entries[0].subEntries!;

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ startTime: null, endTime: null });
		expect(entries[1].startTime?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-12 00:00");
		expect(entries[1].endTime?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-12 02:00");
		expect(source.entries[0].subEntries![1].startTime.format("YYYY-MM-DD HH:mm")).toBe(
			"2026-08-11 23:00"
		);
	});

	it("labels each selected period", () => {
		expect(
			formatTimekeepViewLabel({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		).toBe("10 Aug – 16 Aug 2026");
	});

	it("uses configured weekdays to calculate period capacity", () => {
		expect(
			getTimekeepViewCapacityHours(
				createTimekeepViewState(TimekeepViewMode.DAY, moment("2026-08-12")),
				8,
				5
			)
		).toBe(8);
		expect(
			getTimekeepViewCapacityHours(
				createTimekeepViewState(TimekeepViewMode.WEEK, moment("2026-08-12")),
				8,
				5
			)
		).toBe(40);
		expect(
			getTimekeepViewCapacityHours(
				createTimekeepViewState(TimekeepViewMode.MONTH, moment("2026-08-12")),
				8,
				5
			)
		).toBe(168);
	});
});
