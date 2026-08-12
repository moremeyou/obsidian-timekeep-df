// @vitest-environment happy-dom

import moment from "moment";
import { App } from "obsidian";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings, TimekeepSettings } from "@/settings";
import { createStore, Store } from "@/store";

import { TimesheetRowContent } from "./TimesheetRowContent";

import { defaultTimekeep, TimeEntry, Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetRowContent", () => {
	const start = moment();

	const entry: TimeEntry = {
		id: 1,
		name: "Test",
		startTime: moment(start),
		endTime: null,
		subEntries: null,
	};

	let containerEl: HTMLElement;
	let app: App;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let onBeginEditing: Mock<() => void>;

	beforeEach(() => {
		app = {} as App;
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);

		onBeginEditing = vi.fn();
	});

	it("should load without error", () => {
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-11",
				followCurrent: false,
			})
		);
		component.load();
	});

	it("shows completed row timestamps without seconds", () => {
		const completedEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T09:10:22"),
			endTime: moment("2026-08-11T10:11:33"),
			subEntries: null,
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			completedEntry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-time");
		expect(times?.item(0).textContent).toBe("09:10");
		expect(times?.item(1).textContent).toBe("10:11");
	});

	it("shows a group's earliest descendant start and latest descendant end", () => {
		const groupEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Part 1",
					startTime: moment("2026-08-11T09:10:22"),
					endTime: moment("2026-08-11T10:11:33"),
					subEntries: null,
				},
				{
					id: 3,
					name: "Part 2",
					startTime: moment("2026-08-12T13:12:44"),
					endTime: moment("2026-08-12T14:13:55"),
					subEntries: null,
				},
			],
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			groupEntry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("09:10");
		expect(times?.item(1).textContent).toBe("14:13");
	});

	it("omits timestamp seconds and keeps a live end time for a running Part row", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T14:13:59"));
		const runningEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-12T13:12:44"),
			endTime: null,
			subEntries: null,
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			runningEntry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("13:12");
		expect(times?.item(1).textContent).toBe("14:13");
		vi.advanceTimersByTime(1000);
		expect(times?.item(1).textContent).toBe("14:14");
		component.unload();
		vi.useRealTimers();
	});

	it("omits timestamp seconds and keeps a live latest end for an active parent Block row", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T14:13:59"));
		const activeGroup: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Part 1",
					startTime: moment("2026-08-11T09:10:22"),
					endTime: moment("2026-08-11T10:11:33"),
					subEntries: null,
				},
				{
					id: 3,
					name: "Part 2",
					startTime: moment("2026-08-12T13:12:44"),
					endTime: null,
					subEntries: null,
				},
			],
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			activeGroup,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("09:10");
		expect(times?.item(1).textContent).toBe("14:13");
		vi.advanceTimersByTime(1000);
		expect(times?.item(1).textContent).toBe("14:14");
		component.unload();
		vi.useRealTimers();
	});

	it("folder row should have a folder icon", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		component.load();

		const icon = component.wrapperEl?.querySelector(".timekeep-df-folder-icon");
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(SVGElement);
	});

	it("folder row or groups should be collapsible", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};

		const collapsed: TimeEntry = {
			id: entry.id,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
			collapsed: true,
		};

		timekeep.setState({ entries: [entry] });

		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		const onToggleCollapse = vi.spyOn(component, "onToggleCollapsed");

		component.load();

		const icon = component.wrapperEl?.querySelector(".timekeep-df-collapse-icon");
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(SVGElement);

		(icon as SVGElement).dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: false,
			})
		);

		expect(onToggleCollapse).toHaveBeenCalled();

		const timekeepState: Timekeep = timekeep.getState();
		expect(timekeepState.entries[0]).toEqual(collapsed);
	});

	it("folder row or groups should be expandable", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
			collapsed: true,
		};

		const expanded: TimeEntry = {
			id: entry.id,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};

		timekeep.setState({ entries: [entry] });

		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		const onToggleCollapse = vi.spyOn(component, "onToggleCollapsed");

		component.load();

		const icon = component.wrapperEl?.querySelector(".timekeep-df-collapse-icon");
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(SVGElement);

		(icon as SVGElement).dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: false,
			})
		);

		expect(onToggleCollapse).toHaveBeenCalled();

		const timekeepState: Timekeep = timekeep.getState();
		expect(timekeepState.entries[0]).toEqual(expanded);
	});

	it("item should be able to be started from clicking the start icon", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};

		timekeep.setState({ entries: [entry] });

		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		const onClickStart = vi.spyOn(component, "onClickStart");

		component.load();

		const icon = component.wrapperEl?.querySelector('.timekeep-df-action[data-action="start"]');
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(HTMLButtonElement);
		expect(icon?.classList.contains("timekeep-df-icon-button")).toBe(true);

		(icon as SVGElement).dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: false,
			})
		);

		expect(onClickStart).toHaveBeenCalled();
	});

	it("toggles a running Part row action to Stop", () => {
		vi.useFakeTimers();
		const endTime = moment("2026-08-12T15:00:00");
		vi.setSystemTime(endTime.toDate());
		const runningPart: TimeEntry = {
			id: 1,
			name: "Running Part",
			startTime: moment("2026-08-12T14:00:00"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningPart] });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			runningPart,
			0,
			onBeginEditing
		);
		const onClickStop = vi.spyOn(component, "onClickStop");
		component.load();

		const stopButton = component.wrapperEl?.querySelector<HTMLButtonElement>(
			'.timekeep-df-action[data-action="stop"]'
		);
		expect(stopButton?.title).toBe("Stop");
		expect(stopButton?.classList.contains("timekeep-df-icon-button")).toBe(true);
		stopButton?.click();

		expect(onClickStop).toHaveBeenCalledOnce();
		expect(timekeep.getState().entries[0].endTime?.toISOString()).toBe(endTime.toISOString());
		component.unload();
		vi.useRealTimers();
	});

	it("stops the running descendant from its parent Block row", () => {
		vi.useFakeTimers();
		const endTime = moment("2026-08-12T15:00:00");
		vi.setSystemTime(endTime.toDate());
		const parent: TimeEntry = {
			id: 1,
			name: "Parent",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Running Part",
					startTime: moment("2026-08-12T14:00:00"),
					endTime: null,
					subEntries: null,
				},
			],
		};
		timekeep.setState({ entries: [parent] });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			parent,
			0,
			onBeginEditing
		);
		component.load();

		component.wrapperEl
			?.querySelector<HTMLButtonElement>('.timekeep-df-action[data-action="stop"]')
			?.click();

		const stoppedPart = timekeep.getState().entries[0].subEntries?.[0];
		expect(stoppedPart?.endTime?.toISOString()).toBe(endTime.toISOString());
		component.unload();
		vi.useRealTimers();
	});
});
