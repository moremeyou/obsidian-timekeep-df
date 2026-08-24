// @vitest-environment happy-dom

import moment from "moment";
import { type App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings, type TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";
import { assert } from "@/utils/assert";

import { TimesheetTable } from "./TimesheetTable";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";
import { shiftTimekeepView, TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetTable", () => {
	let containerEl: HTMLElement;
	let app: App;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let component: TimesheetTable;

	beforeEach(() => {
		containerEl = createMockContainer();
		app = {} as App;
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);
		component = new TimesheetTable(containerEl, app, timekeep, settings);
	});

	it("should load without error", () => {
		expect(() => component.load()).not.toThrow();
		const headings = Array.from(component.wrapperEl?.querySelectorAll("th") ?? []).map(
			(heading) => heading.textContent
		);
		expect(headings).toContain("%");
		expect(headings).not.toContain("Day %");
		expect(headings).toEqual(["", "Activity", "Duration", "%", "Start", "End", ""]);
		expect(component.wrapperEl?.classList.contains("timekeep-df-table-wrapper")).toBe(true);
		const headingElements = component.wrapperEl?.querySelectorAll("th");
		expect(headingElements?.item(0).className).toBe("timekeep-df-head--actions");
		expect(headingElements?.item(1).className).toBe("timekeep-df-head--name");
		expect(headingElements?.item(2).className).toBe("timekeep-df-head--duration");
		expect(headingElements?.item(3).className).toBe("timekeep-df-head--percent");
		expect(headingElements?.item(4).className).toBe("timekeep-df-head--time");
		expect(headingElements?.item(5).className).toBe("timekeep-df-head--time");
		expect(headingElements?.item(6).className).toBe("timekeep-df-head--actions");
		expect(headingElements?.item(0).getAttribute("aria-label")).toBe("Start or stop");
		expect(headingElements?.item(6).getAttribute("aria-label")).toBe("Edit");
	});

	it("should be able to render rows", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: moment(start),
					endTime: moment(start),
					subEntries: null,
				},
			],
		});
		component.load();
	});

	it("shows only rows with duration in the selected calendar window", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-12",
			followCurrent: true,
		});
		component = new TimesheetTable(containerEl, app, timekeep, settings, viewState);
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Yesterday",
					startTime: moment("2026-08-11T09:00:00"),
					endTime: moment("2026-08-11T10:00:00"),
					subEntries: null,
				},
				{
					id: 2,
					name: "Today",
					startTime: moment("2026-08-12T09:00:00"),
					endTime: moment("2026-08-12T10:00:00"),
					subEntries: null,
				},
			],
		});

		component.load();
		const rows = component.wrapperEl?.querySelectorAll("tbody > tr");
		expect(rows).toHaveLength(1);
		expect(rows?.item(0).textContent).toContain("Today");
		expect(component.wrapperEl?.textContent).not.toContain("Yesterday");
		vi.useRealTimers();
	});

	it.each([
		[TimekeepViewMode.DAY, "2026-08-23T09:00:00", "No tracked activities on this day."],
		[TimekeepViewMode.WEEK, "2026-08-18T09:00:00", "No tracked activities in this week."],
		[TimekeepViewMode.MONTH, "2026-07-15T09:00:00", "No tracked activities in this month."],
		[TimekeepViewMode.QUARTER, "2026-04-15T09:00:00", "No tracked activities in this quarter."],
		[TimekeepViewMode.YEAR, "2025-08-12T09:00:00", "No tracked activities in this year."],
	] as const)("rerenders a populated previous %s range", (mode, blockStart, emptyMessage) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-24T12:00:00"));
		const viewState = createStore({
			mode,
			anchorDate: "2026-08-24",
			followCurrent: true,
		});
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Historical Activity",
					collapsed: true,
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Block 1",
							startTime: moment(blockStart),
							endTime: moment(blockStart).add(1, "hour"),
							subEntries: null,
						},
					],
				},
			],
		});
		component = new TimesheetTable(containerEl, app, timekeep, settings, viewState);
		component.load();

		expect(component.wrapperEl?.querySelector(".timekeep-df-empty-row")?.textContent).toBe(
			emptyMessage
		);
		viewState.setState((state) => shiftTimekeepView(state, -1));

		expect(component.wrapperEl?.querySelector(".timekeep-df-empty-row")).toBeNull();
		expect(component.wrapperEl?.textContent).toContain("Historical Activity");
		expect(component.wrapperEl?.querySelectorAll("tbody > tr.timekeep-df-row")).toHaveLength(1);
		vi.useRealTimers();
	});

	it("temporarily shows and edits an empty historical draft, then hides it on cancel", () => {
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		const draftEntry = {
			id: 91,
			name: "Historical Activity",
			startTime: null,
			endTime: null,
			subEntries: null,
		};
		const historicalDraft = createStore<HistoricalActivityDraft | null>({
			activityId: draftEntry.id,
			activityName: draftEntry.name,
			entryId: draftEntry.id,
			entryName: draftEntry.name,
			initialTime: moment("2026-08-11T14:25"),
		});
		timekeep.setState({ entries: [draftEntry] });
		component = new TimesheetTable(
			containerEl,
			app,
			timekeep,
			settings,
			viewState,
			historicalDraft
		);

		component.load();
		expect(component.wrapperEl?.querySelector("form.timekeep-df-editing")).not.toBeNull();
		expect(
			component.wrapperEl?.querySelector<HTMLInputElement>(
				'input[name="timekeep-df-start-date"]'
			)?.value
		).toBe("2026-08-11");
		expect(
			component.wrapperEl?.querySelector<HTMLInputElement>(
				'input[name="timekeep-df-start-native-time"]'
			)?.value
		).toBe("14:25");

		component.wrapperEl?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
		expect(historicalDraft.getState()).toBeNull();
		expect(component.wrapperEl?.querySelectorAll("tbody > tr.timekeep-df-row")).toHaveLength(0);
		expect(component.wrapperEl?.querySelector(".timekeep-df-empty-row")?.textContent).toBe(
			"No tracked activities on this day."
		);
		expect(timekeep.getState().entries).toEqual([]);
	});

	it("reopens a historical draft after parser runtime IDs change", () => {
		const historicalDraft = createStore<HistoricalActivityDraft | null>({
			activityId: 90,
			activityName: "Project Management",
			entryId: 91,
			entryName: "Block 2",
			initialTime: moment("2026-08-11T14:25"),
		});
		timekeep.setState({
			entries: [
				{
					id: 190,
					name: "Project Management",
					collapsed: true,
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 191,
							name: "Block 2",
							startTime: null,
							endTime: null,
							subEntries: null,
						},
					],
				},
			],
		});
		component = new TimesheetTable(
			containerEl,
			app,
			timekeep,
			settings,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-11",
				followCurrent: false,
			}),
			historicalDraft
		);

		component.load();
		expect(component.wrapperEl?.querySelector("form.timekeep-df-editing")).not.toBeNull();
		expect(component.wrapperEl?.querySelectorAll("tbody > tr")).toHaveLength(2);
		expect(
			component.wrapperEl?.querySelector<HTMLInputElement>('form input[name="name"]')?.value
		).toBe("Block 2");
	});

	it("opens the next child Block editor from a historical row plus button", () => {
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		const historicalDraft = createStore<HistoricalActivityDraft | null>(null);
		timekeep.setState({
			entries: [
				{
					id: 90,
					name: "Project Management",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 91,
							name: "Block 1",
							startTime: moment("2026-08-11T09:00"),
							endTime: moment("2026-08-11T10:00"),
							subEntries: null,
						},
					],
				},
			],
		});
		component = new TimesheetTable(
			containerEl,
			app,
			timekeep,
			settings,
			viewState,
			historicalDraft
		);
		component.load();

		component.wrapperEl
			?.querySelector<HTMLButtonElement>('tbody > tr [data-action="add-block"]')
			?.click();

		expect(component.wrapperEl?.querySelector("form.timekeep-df-editing")).not.toBeNull();
		expect(
			component.wrapperEl?.querySelector<HTMLInputElement>('form input[name="name"]')?.value
		).toBe("Block 2");
		expect(timekeep.getState().entries[0].subEntries).toHaveLength(2);
		expect(historicalDraft.getState()?.entryId).toBe(
			timekeep.getState().entries[0].subEntries?.[1].id
		);
	});

	it("should be able to render groups with nested rows", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Test",
							startTime: moment(start),
							endTime: moment(start).add(1, "minute"),
							subEntries: null,
						},
					],
				},
			],
		});
		component.load();

		const rows = component.wrapperEl?.querySelectorAll<HTMLTableRowElement>("tbody > tr");
		expect(rows).toHaveLength(2);
		expect(rows?.item(0).dataset.groupPosition).toBe("start");
		expect(rows?.item(1).dataset.groupPosition).toBe("end");
		expect(rows?.item(0).dataset.groupTone).toBe(rows?.item(1).dataset.groupTone);
	});

	it("alternates the next parent independently of an expanded group's row count", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Expanded",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Part",
							startTime: moment(start),
							endTime: moment(start).add(1, "minute"),
							subEntries: null,
						},
					],
				},
				{
					id: 3,
					name: "Next parent",
					startTime: moment(start),
					endTime: moment(start).add(1, "minute"),
					subEntries: null,
				},
			],
		});
		component.load();

		const rows = component.wrapperEl?.querySelectorAll<HTMLTableRowElement>("tbody > tr");
		expect(rows).toHaveLength(3);
		expect(rows?.item(0).dataset.groupTone).toBe("odd");
		expect(rows?.item(1).dataset.groupTone).toBe("odd");
		expect(rows?.item(2).dataset.groupTone).toBe("even");
		expect(rows?.item(2).dataset.groupPosition).toBeUndefined();
	});

	it("terminates one expanded outline before the next expanded parent", () => {
		const part = (id: number) => ({
			id,
			name: `Part ${id}`,
			startTime: moment().subtract(1, "minute"),
			endTime: moment(),
			subEntries: null,
		});
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "First",
					startTime: null,
					endTime: null,
					subEntries: [part(2)],
				},
				{
					id: 3,
					name: "Second",
					startTime: null,
					endTime: null,
					subEntries: [part(4)],
				},
			],
		});
		component.load();

		const rows = component.wrapperEl?.querySelectorAll<HTMLTableRowElement>("tbody > tr");
		expect(Array.from(rows ?? []).map((row) => row.dataset.groupPosition)).toEqual([
			"start",
			"end",
			"start",
			"end",
		]);
		expect(rows?.item(1).dataset.groupTone).toBe("odd");
		expect(rows?.item(2).dataset.groupTone).toBe("even");
	});

	it("disabling the limitTableSize setting should set maxHeight and overflowY", () => {
		settings.setState({ ...defaultSettings, limitTableSize: false });
		component.load();

		const wrapper = component.wrapperEl;
		assert(wrapper);

		expect(wrapper.style.maxHeight).toBe("");
		expect(wrapper.style.overflowY).toBe("");
	});

	it("should be to re-render on changed timekeep", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Test",
							startTime: moment(start),
							endTime: moment(start).add(1, "minute"),
							subEntries: null,
						},
					],
				},
			],
		});
		const removeChild = vi.spyOn(component, "removeChild");

		component.load();

		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: null,
					endTime: null,
					subEntries: [],
				},
			],
		});

		expect(removeChild).toHaveBeenCalled();
	});
});
