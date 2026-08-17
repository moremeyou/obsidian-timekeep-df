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
		expect(durationSetValues).toHaveBeenCalledWith("0s", "");
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
		expect(durationSetValues).toHaveBeenCalledWith("1h 0s", "");
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
