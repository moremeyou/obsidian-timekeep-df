// @vitest-environment happy-dom

import moment from "moment";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { TimesheetEntryPercent } from "./TimesheetEntryPercent";

import type { TimeEntry } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetEntryPercent", () => {
	let containerEl: HTMLElement;

	beforeEach(() => {
		containerEl = createMockContainer();
		vi.useFakeTimers();
	});

	it("renders exact duration against configured daily hours", () => {
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-12T09:00:00"),
			endTime: moment("2026-08-12T11:00:00"),
			subEntries: null,
		};
		const settings = createStore({ ...defaultSettings, totalDailyWorkingHours: 8 });
		const component = new TimesheetEntryPercent(containerEl, entry, settings);
		component.load();

		expect(component.wrapperEl?.textContent).toBe("25.0%");
		component.unload();
		vi.useRealTimers();
	});

	it("updates when daily capacity changes", () => {
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-12T09:00:00"),
			endTime: moment("2026-08-12T11:00:00"),
			subEntries: null,
		};
		const settings = createStore({ ...defaultSettings });
		const component = new TimesheetEntryPercent(containerEl, entry, settings);
		component.load();

		settings.setState({ ...defaultSettings, totalDailyWorkingHours: 4 });
		expect(component.wrapperEl?.textContent).toBe("50.0%");
		component.unload();
		vi.useRealTimers();
	});

	it("uses weekly capacity and only duration inside the selected week", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-10T09:00:00"),
			endTime: moment("2026-08-10T13:00:00"),
			subEntries: null,
		};
		const settings = createStore({
			...defaultSettings,
			totalDailyWorkingHours: 8,
			totalDaysPerWeek: 5,
		});
		const viewState = createStore({
			mode: TimekeepViewMode.WEEK,
			anchorDate: "2026-08-12",
			followCurrent: false,
		});
		const component = new TimesheetEntryPercent(containerEl, entry, settings, viewState);
		component.load();

		expect(component.wrapperEl?.textContent).toBe("10.0%");
		component.unload();
		vi.useRealTimers();
	});
});
