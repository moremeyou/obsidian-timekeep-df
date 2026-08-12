// @vitest-environment happy-dom

import moment from "moment";
import { type App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings, type TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";
import { assert } from "@/utils/assert";

import { TimesheetTable } from "./TimesheetTable";

import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

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
		expect(headings).not.toContain("% of Day");
		expect(headings).toEqual(["Activity", "Start", "End", "Duration", "%", "Actions"]);
		expect(component.wrapperEl?.classList.contains("timekeep-df-table-wrapper")).toBe(true);
		const headingElements = component.wrapperEl?.querySelectorAll("th");
		expect(headingElements?.item(0).className).toBe("timekeep-df-head--name");
		expect(headingElements?.item(1).className).toBe("timekeep-df-head--time");
		expect(headingElements?.item(2).className).toBe("timekeep-df-head--time");
		expect(headingElements?.item(3).className).toBe("timekeep-df-head--duration");
		expect(headingElements?.item(4).className).toBe("timekeep-df-head--percent");
		expect(headingElements?.item(5).className).toBe("timekeep-df-head--actions");
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

	it("keeps all rows visible while calculations use the selected calendar window", () => {
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
		expect(rows).toHaveLength(2);
		expect(rows?.item(0).textContent).toContain("Yesterday");
		expect(rows?.item(1).textContent).toContain("Today");
		vi.useRealTimers();
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
							endTime: moment(start),
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
							endTime: moment(start),
							subEntries: null,
						},
					],
				},
				{
					id: 3,
					name: "Next parent",
					startTime: null,
					endTime: null,
					subEntries: [],
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
			startTime: moment(),
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
							endTime: moment(start),
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
