// @vitest-environment happy-dom

import moment from "moment";
import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings, type TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";

import { TimesheetRunningEntryViewing } from "./TimesheetRunningEntryViewing";

import { defaultTimekeep, type TimeEntry, type Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetRunningEntry", () => {
	let containerEl: HTMLElement;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let onStartEditing: VoidFunction;
	let component: TimesheetRunningEntryViewing;

	const start = moment();
	const entry: TimeEntry = {
		id: 1,
		name: "Group",
		startTime: null,
		endTime: null,
		subEntries: [
			{
				id: 2,
				name: "Test",
				startTime: moment(start),
				endTime: null,
				subEntries: null,
			},
		],
	};

	beforeEach(() => {
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);
		onStartEditing = vi.fn();
	});

	afterEach(() => {
		if (component) component.unload();
		vi.useRealTimers();
	});

	it("should load without error", () => {
		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			entry,
			onStartEditing
		);
		component.load();
		expect(
			Array.from(component.wrapperEl?.querySelectorAll("button") ?? []).every((button) =>
				button.classList.contains("timekeep-df-icon-button")
			)
		).toBe(true);
		expect(
			component.wrapperEl?.querySelector(".timekeep-df-current-activity__actions")
		).not.toBeNull();
		expect(
			component.wrapperEl?.querySelector('[aria-label="Edit current Activity"]')
		).toBeNull();
		expect(component.wrapperEl?.querySelectorAll("button")).toHaveLength(1);
	});

	it("leaves live Duration to the adjacent counters card", () => {
		const runningEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T09:10:22"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningEntry] });
		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			runningEntry,
			onStartEditing
		);
		component.load();

		expect(component.wrapperEl?.textContent).not.toContain("Started");
		expect(component.wrapperEl?.textContent).not.toContain("09:10");
		expect(component.wrapperEl?.textContent).not.toContain("Duration");
	});

	it("should be able to stop the entry", () => {
		const start = moment();
		const end = moment().add(1, "hour");
		vi.setSystemTime(end.toDate());

		const id = 1;

		timekeep.setState({
			entries: [
				{
					id,
					name: "Test",
					startTime: moment(start),
					endTime: null,
					subEntries: null,
				},
			],
		});

		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			entry,
			onStartEditing
		);

		const onStop = vi.spyOn(component, "onStop");

		component.load();

		const formEl = component.wrapperEl;
		expect(formEl).not.toBeNull();
		(formEl as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: true })
		);

		expect(onStop).toHaveBeenCalled();

		expect(timekeep.getState()).toEqual({
			entries: [
				{
					id,
					name: "Test",
					startTime: moment(start),
					endTime: moment(end),
					subEntries: null,
				},
			],
		});
	});

	it("starts the configured Break after an explicit stop during working hours", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-17T12:00:00"));
		settings.setState({
			...defaultSettings,
			automaticBreaksEnabled: true,
			workingHoursStart: "09:00",
			workingHoursEnd: "17:00",
		});
		const runningEntry: TimeEntry = {
			id: 1,
			name: "Project",
			startTime: moment("2026-08-17T10:00:00"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningEntry] });
		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			runningEntry,
			onStartEditing
		);
		component.load();

		(component.wrapperEl as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: true })
		);

		expect(timekeep.getState().entries.at(-1)?.name).toBe("Break");
		expect(timekeep.getState().entries.at(-1)?.endTime).toBeNull();
	});

	it("makes the Activity and Block path immediately clear", () => {
		vi.useFakeTimers();
		const start = moment("2026-08-12T10:00:00");
		const end = moment("2026-08-12T11:05:45");
		vi.setSystemTime(end.toDate());

		const entry = {
			id: 3,
			name: "Test",
			startTime: moment(start),
			endTime: null,
			subEntries: null,
		};

		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Outer",
					startTime: null,
					endTime: null,
					subEntries: [
						{
							id: 2,
							name: "Inner",
							startTime: null,
							endTime: null,
							subEntries: [entry],
						},
					],
				},
			],
		});

		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			entry,
			onStartEditing
		);

		component.load();

		expect(
			component.wrapperEl?.querySelector(".timekeep-df-current-activity__name")?.textContent
		).toBe("Outer");
		expect(
			component.wrapperEl?.querySelector(".timekeep-df-current-activity__block-path")
				?.textContent
		).toBe("Inner › Test");
		expect(
			component.wrapperEl?.querySelector(".timekeep-df-current-activity__block")?.textContent
		).toBe("Inner › Test");
		expect(
			component.wrapperEl?.querySelector(".timekeep-df-current-activity__actions")
		).not.toBeNull();
	});

	it("hides Block context for a top-level running Activity", () => {
		const runningEntry: TimeEntry = {
			id: 1,
			name: "Research",
			startTime: moment("2026-08-12T09:00:00"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningEntry] });
		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			runningEntry,
			onStartEditing
		);
		component.load();

		expect(
			component.wrapperEl?.querySelector<HTMLElement>(".timekeep-df-current-activity__block")
				?.hidden
		).toBe(true);
	});

	it("disables Stop and preserves the running entry outside the current range", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
		const runningEntry: TimeEntry = {
			id: 1,
			name: "Research",
			startTime: moment("2026-08-12T09:00:00"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningEntry] });
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		component = new TimesheetRunningEntryViewing(
			containerEl,
			timekeep,
			settings,
			runningEntry,
			onStartEditing,
			viewState
		);
		component.load();

		const stopButton = component.wrapperEl?.querySelector<HTMLButtonElement>(
			'[aria-label="Stop current Activity"]'
		);
		expect(stopButton?.disabled).toBe(true);
		component.onStop(new SubmitEvent("submit"));
		expect(timekeep.getState().entries[0].endTime).toBeNull();

		viewState.setState({ ...viewState.getState(), anchorDate: "2026-08-12" });
		expect(stopButton?.disabled).toBe(false);
	});
});
