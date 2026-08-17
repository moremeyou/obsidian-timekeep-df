// @vitest-environment happy-dom

import moment from "moment";
import { describe, it, expect, vi, beforeEach, afterEach, assert } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings, TimekeepSettings } from "@/settings";
import { createStore, Store } from "@/store";

import { TimesheetCounters } from "./TimesheetCounters";
import { TimesheetTimer } from "./TimesheetTimer";

import * as queries from "@/timekeep/queries";
import { defaultTimekeep, Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetCounters", () => {
	let container: HTMLElement;
	let settingsStore: Store<TimekeepSettings>;
	let timekeepStore: Store<Timekeep>;
	let component: TimesheetCounters;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		container = createMockContainer();
		settingsStore = createStore({ ...defaultSettings });
		timekeepStore = createStore(defaultTimekeep());

		component = new TimesheetCounters(container, settingsStore, timekeepStore);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should initialize the selected-period total on load", () => {
		component.load();

		expect(component.wrapperEl).toBeInstanceOf(HTMLDivElement);
		expect(component.wrapperEl?.className).toBe("timekeep-df-timers");

		expect(component.durationTimer).toBeInstanceOf(TimesheetTimer);
		expect(component.totalTimer).toBeInstanceOf(TimesheetTimer);
		expect(
			Array.from(component.wrapperEl?.querySelectorAll(".timekeep-df-timer-label") ?? []).map(
				(label) => label.textContent
			)
		).toEqual(["Duration", "Day total"]);
	});

	it("should call updateTimers on load", () => {
		const spy = vi.spyOn(component, "updateTimers");

		component.load();

		expect(spy).toHaveBeenCalled();
	});

	it("should set timer values using the selected-period total duration", () => {
		component.load();

		assert(component.totalTimer);
		assert(component.durationTimer);

		const totalSetValues = vi.spyOn(component.totalTimer, "setValues");
		const durationSetValues = vi.spyOn(component.durationTimer, "setValues");

		component.onUpdate();

		expect(totalSetValues).toHaveBeenCalledWith("0.0h", "");
		expect(durationSetValues).toHaveBeenCalledWith("00:00:00", "");
		expect(component.wrapperEl?.getAttribute("data-capacity-state")).toBe("empty");
	});

	it("should schedule interval if keep is running", () => {
		vi.spyOn(queries, "isKeepRunning")
			//
			.mockReturnValue(true);

		const registerSpy = vi.spyOn(component, "registerInterval");

		component.load();

		expect(component.currentContentInterval).toBeDefined();
		expect(registerSpy).toHaveBeenCalledWith(component.currentContentInterval);
	});

	it("should clear existing interval before scheduling new one", () => {
		const isKeepRunning = vi.spyOn(queries, "isKeepRunning").mockReturnValue(false);

		const fakeIntervalID = 1000;
		component.currentContentInterval = fakeIntervalID;
		const clearSpy = vi.spyOn(global, "clearInterval");

		isKeepRunning.mockReturnValue(true);
		component.load();

		expect(clearSpy).toHaveBeenCalledWith(fakeIntervalID);
	});

	it("should keep the selected-period total live while an entry is running", () => {
		const start = moment("2026-08-12T10:00:00");
		const oneHourLater = moment(start).add(1, "hour");

		vi.useFakeTimers();
		vi.setSystemTime(oneHourLater.toDate());
		component = new TimesheetCounters(
			container,
			settingsStore,
			timekeepStore,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);

		component.load();

		assert(component.totalTimer);
		assert(component.durationTimer);

		const totalSetValues = vi.spyOn(component.totalTimer, "setValues");
		const durationSetValues = vi.spyOn(component.durationTimer, "setValues");

		timekeepStore.setState({
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

		expect(totalSetValues).toHaveBeenCalledWith("1h 0s", "");
		expect(durationSetValues).toHaveBeenCalledWith("01:00:00", "");
	});

	it("caps an automatic Break at the configured working-hours end", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-17T18:00:00"));
		settingsStore.setState({
			...defaultSettings,
			automaticBreaksEnabled: true,
			workingHoursStart: "09:00",
			workingHoursEnd: "17:00",
		});
		timekeepStore.setState({
			entries: [
				{
					id: 1,
					name: "Break",
					startTime: moment("2026-08-17T16:30:00"),
					endTime: null,
					subEntries: null,
				},
			],
		});
		component.load();

		expect(timekeepStore.getState().entries[0].endTime?.format("YYYY-MM-DD HH:mm")).toBe(
			"2026-08-17 17:00"
		);
	});

	it("should show total duration as the sum of all entry durations", () => {
		const start = moment("2026-08-12T10:00:00");
		const oneHourLater = moment(start).add(1, "hour");

		vi.useFakeTimers();
		vi.setSystemTime(oneHourLater.toDate());
		component = new TimesheetCounters(
			container,
			settingsStore,
			timekeepStore,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);

		component.load();

		assert(component.totalTimer);

		const totalSetValues = vi.spyOn(component.totalTimer, "setValues");

		timekeepStore.setState({
			entries: [
				// 1h elapsed entry
				{
					id: 1,
					name: "Test",
					startTime: moment(start),
					endTime: null,
					subEntries: null,
				},
				// 2h entry
				{
					id: 2,
					name: "Test",
					startTime: moment(start).subtract(1, "hour"),
					endTime: moment(oneHourLater),
					subEntries: null,
				},
			],
		});

		expect(totalSetValues).toHaveBeenCalledWith("3h 0s", "");
	});

	it("toggles the range total and capacity between including and excluding Break", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-17T18:00:00"));
		settingsStore.setState({
			...defaultSettings,
			automaticBreakName: "Break",
			totalDailyWorkingHours: 2.25,
		});
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-17",
			followCurrent: true,
			includeBreaksInTotal: true,
		});
		timekeepStore.setState({
			entries: [
				{
					id: 1,
					name: "Project",
					startTime: moment("2026-08-17T10:00:00"),
					endTime: moment("2026-08-17T12:00:00"),
					subEntries: null,
				},
				{
					id: 2,
					name: " break ",
					startTime: moment("2026-08-17T12:00:00"),
					endTime: moment("2026-08-17T12:30:00"),
					subEntries: null,
				},
			],
		});
		component = new TimesheetCounters(container, settingsStore, timekeepStore, viewState);
		component.load();

		const totalValue = component.totalTimer?.wrapperEl?.querySelector(
			".timekeep-df-timer-value"
		);
		const totalMode = component.totalTimer?.wrapperEl?.querySelector(
			".timekeep-df-timer-value-small"
		);
		expect(totalValue?.textContent).toBe("2h 30m 0s");
		expect(totalMode?.hidden).toBe(true);
		expect(component.wrapperEl?.getAttribute("data-capacity-state")).toBe("over");
		expect(component.wrapperEl?.getAttribute("aria-pressed")).toBe("false");

		component.wrapperEl?.click();

		expect(viewState.getState().includeBreaksInTotal).toBe(false);
		expect(totalValue?.textContent).toBe("2h 0s");
		expect(totalMode?.hidden).toBe(true);
		expect(component.wrapperEl?.getAttribute("data-capacity-state")).toBe("within");
		expect(component.wrapperEl?.getAttribute("aria-pressed")).toBe("true");
		expect(component.wrapperEl?.getAttribute("aria-label")).toContain("excludes Break");

		component.wrapperEl?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
		);
		expect(viewState.getState().includeBreaksInTotal).toBe(true);
		expect(totalValue?.textContent).toBe("2h 30m 0s");
	});

	it("labels the total for the selected calendar range", () => {
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-12",
			followCurrent: true,
		});
		component = new TimesheetCounters(container, settingsStore, timekeepStore, viewState);
		component.load();

		const label = component.totalTimer?.wrapperEl?.querySelector(".timekeep-df-timer-label");
		expect(label?.textContent).toBe("Day total");

		viewState.setState({ ...viewState.getState(), mode: TimekeepViewMode.WEEK });
		expect(label?.textContent).toBe("Week total");

		viewState.setState({ ...viewState.getState(), mode: TimekeepViewMode.QUARTER });
		expect(label?.textContent).toBe("Quarter total");
	});

	it("marks a non-zero total within capacity green and an over-capacity total red", () => {
		vi.useFakeTimers();
		vi.setSystemTime(moment("2026-08-12T18:00:00").toDate());
		settingsStore.setState({ ...defaultSettings, totalDailyWorkingHours: 8 });
		component = new TimesheetCounters(
			container,
			settingsStore,
			timekeepStore,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		component.load();

		const timer = component.wrapperEl;
		timekeepStore.setState({
			entries: [
				{
					id: 1,
					name: "Within",
					startTime: moment("2026-08-12T10:00:00"),
					endTime: moment("2026-08-12T18:00:00"),
					subEntries: null,
				},
			],
		});
		expect(timer?.getAttribute("data-capacity-state")).toBe("within");

		timekeepStore.setState({
			entries: [
				{
					id: 1,
					name: "Over",
					startTime: moment("2026-08-12T09:00:00"),
					endTime: moment("2026-08-12T18:00:00"),
					subEntries: null,
				},
			],
		});
		expect(timer?.getAttribute("data-capacity-state")).toBe("over");
	});
});
