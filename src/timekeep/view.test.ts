import moment from "moment";
import { describe, expect, it } from "vitest";

import {
	canNavigateTimekeepViewForward,
	createTimekeepViewSnapshot,
	createTimekeepViewState,
	filterTimekeepViewEntries,
	formatBlockNameForView,
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
		[TimekeepViewMode.QUARTER, "2026-07-01", "2026-10-01"],
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

	it("moves Quarter views by complete calendar quarters", () => {
		const state = createTimekeepViewState(
			TimekeepViewMode.QUARTER,
			moment("2026-08-12T14:30:00")
		);
		expect(shiftTimekeepView(state, -1)).toMatchObject({
			mode: TimekeepViewMode.QUARTER,
			anchorDate: "2026-05-12",
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

	it("filters empty rows while retaining parents and clipping export timestamps", () => {
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

		expect(entries).toHaveLength(1);
		expect(entries[0].name).toBe("Crosses midnight");
		expect(entries[0].startTime?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-12 00:00");
		expect(entries[0].endTime?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-12 02:00");
		expect(source.entries[0].subEntries![1].startTime.format("YYYY-MM-DD HH:mm")).toBe(
			"2026-08-11 23:00"
		);
	});

	it("keeps an active zero-age row visible in the current window", () => {
		const currentTime = moment("2026-08-12T12:00:00");
		const entries = filterTimekeepViewEntries(
			[
				{
					id: 1,
					name: "Just started",
					startTime: moment(currentTime),
					endTime: null,
					subEntries: null,
				},
			],
			currentTime,
			getTimekeepViewWindow({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		expect(entries.map((entry) => entry.name)).toEqual(["Just started"]);
	});

	it("keeps one consolidated Activity while ranges reveal the matching Blocks", () => {
		const currentTime = moment("2026-08-12T12:00:00");
		const entries = [
			{
				id: 1,
				name: "Project Management",
				startTime: null,
				endTime: null,
				subEntries: [
					{
						id: 2,
						name: "Block 1",
						startTime: moment("2026-07-15T09:00:00"),
						endTime: moment("2026-07-15T10:00:00"),
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
		const dayEntries = filterTimekeepViewEntries(
			entries,
			currentTime,
			getTimekeepViewWindow({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		const quarterEntries = filterTimekeepViewEntries(
			entries,
			currentTime,
			getTimekeepViewWindow({
				mode: TimekeepViewMode.QUARTER,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);

		expect(dayEntries).toHaveLength(1);
		expect(dayEntries[0].subEntries).toHaveLength(1);
		expect(quarterEntries).toHaveLength(1);
		expect(quarterEntries[0].subEntries).toHaveLength(2);
	});

	it("labels each selected period", () => {
		expect(
			formatTimekeepViewLabel({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		).toBe("10 Aug – 16 Aug 2026");
		expect(
			formatTimekeepViewLabel({
				mode: TimekeepViewMode.QUARTER,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		).toBe("Q3 2026");
	});

	it.each([
		[TimekeepViewMode.DAY, "Block 1 (13:45)"],
		[TimekeepViewMode.WEEK, "Block 1 (Wednesday Afternoon)"],
		[TimekeepViewMode.MONTH, "Block 1 (W33)"],
		[TimekeepViewMode.QUARTER, "Block 1 (August)"],
		[TimekeepViewMode.YEAR, "Block 1 (August)"],
	])("formats display-only Block context for %s", (mode, expected) => {
		const block = {
			id: 1,
			name: "Block 1",
			startTime: moment("2026-08-12T13:45:00"),
			endTime: moment("2026-08-12T14:00:00"),
			subEntries: null,
		};

		expect(formatBlockNameForView(block, mode)).toBe(expected);
		expect(block.name).toBe("Block 1");
	});

	it("uses Morning before noon and Afternoon from noon onward only in Week view", () => {
		const block = {
			id: 1,
			name: "Block 1",
			startTime: moment("2026-08-12T11:59:00"),
			endTime: moment("2026-08-12T12:30:00"),
			subEntries: null,
		};
		expect(formatBlockNameForView(block, TimekeepViewMode.WEEK)).toBe(
			"Block 1 (Wednesday Morning)"
		);
		block.startTime = moment("2026-08-12T12:00:00");
		expect(formatBlockNameForView(block, TimekeepViewMode.WEEK)).toBe(
			"Block 1 (Wednesday Afternoon)"
		);
		expect(formatBlockNameForView(block, TimekeepViewMode.DAY)).toBe("Block 1 (12:00)");
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
		expect(
			getTimekeepViewCapacityHours(
				createTimekeepViewState(TimekeepViewMode.QUARTER, moment("2026-08-12")),
				8,
				5
			)
		).toBe(528);
	});
});
