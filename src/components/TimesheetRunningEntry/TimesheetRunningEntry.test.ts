// @vitest-environment happy-dom

import moment from "moment";
import { beforeEach, it, describe, expect, afterEach } from "vitest";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { TimesheetRunningEntry } from "./TimesheetRunningEntry";
import { TimesheetRunningEntryEditing } from "./TimesheetRunningEntryEditing";
import { TimesheetRunningEntryEmpty } from "./TimesheetRunningEntryEmpty";
import { TimesheetRunningEntryViewing } from "./TimesheetRunningEntryViewing";

import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetRunningEntry", () => {
	let containerEl: HTMLElement;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let component: TimesheetRunningEntry;

	beforeEach(() => {
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);
	});

	afterEach(() => {
		if (component) component.unload();
	});

	it("should load without error", () => {
		component = new TimesheetRunningEntry(containerEl, timekeep, settings);
		component.load();
	});

	it("should show a clear empty current-Activity state without a running entry", () => {
		component = new TimesheetRunningEntry(containerEl, timekeep, settings);
		component.load();
		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryEmpty);
		expect(containerEl.textContent).toBe("Get to work!");
		expect(containerEl.querySelectorAll("button")).toHaveLength(0);
	});

	it("tells the user to stop when the selected range is over capacity and nothing is running", () => {
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		settings.setState({ ...defaultSettings, totalDailyWorkingHours: 8 });
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Long day",
					startTime: moment("2026-08-11T08:00"),
					endTime: moment("2026-08-11T17:00"),
					subEntries: null,
				},
			],
		});
		component = new TimesheetRunningEntry(containerEl, timekeep, settings, viewState);
		component.load();

		expect(containerEl.textContent).toBe("Stop working!");
		settings.setState({ ...settings.getState(), totalDailyWorkingHours: 10 });
		expect(containerEl.textContent).toBe("Get to work!");
	});

	it("should be TimesheetStartRunning when theres a running entry", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: moment(start),
					endTime: null,
					subEntries: null,
				},
			],
		});

		component = new TimesheetRunningEntry(containerEl, timekeep, settings);
		component.load();

		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryViewing);
	});

	it("should be TimesheetStartEditing when theres a running entry and edit is pressed", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: moment(start),
					endTime: null,
					subEntries: null,
				},
			],
		});

		component = new TimesheetRunningEntry(containerEl, timekeep, settings);
		component.load();

		const content = component.getContent() as TimesheetRunningEntryViewing;
		content.onStartEditing();

		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryEditing);
	});

	it("timekeep updates when editing should update the running entry", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: moment(start),
					endTime: null,
					subEntries: null,
				},
			],
		});

		component = new TimesheetRunningEntry(containerEl, timekeep, settings);
		component.load();

		const content = component.getContent() as TimesheetRunningEntryViewing;
		content.onStartEditing();

		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryEditing);

		timekeep.setState(timekeep.getState());

		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryEditing);
	});

	it("after a timekeep update when editing if theres no more current entry should return to empty component state", () => {
		const start = moment();
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Test",
					startTime: moment(start),
					endTime: null,
					subEntries: null,
				},
			],
		});

		component = new TimesheetRunningEntry(containerEl, timekeep, settings);
		component.load();

		const content = component.getContent() as TimesheetRunningEntryViewing;
		content.onStartEditing();

		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryEditing);

		timekeep.setState({ entries: [] });

		expect(component.getContent()).toBeInstanceOf(TimesheetRunningEntryEmpty);
	});
});
