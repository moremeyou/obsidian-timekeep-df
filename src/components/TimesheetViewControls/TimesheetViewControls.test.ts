// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { createStore } from "@/store";

import { TimesheetViewControls } from "./TimesheetViewControls";

import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetViewControls", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("changes modes and navigates the selected tracker window", () => {
		const containerEl = createMockContainer();
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-12",
			followCurrent: true,
		});
		const component = new TimesheetViewControls(containerEl, viewState);
		component.load();

		const mode = component.wrapperEl?.querySelector("select");
		expect(mode).toBeInstanceOf(HTMLSelectElement);
		expect(mode?.classList.contains("dropdown")).toBe(true);
		expect(
			Array.from((mode as HTMLSelectElement).options).map((option) => option.value)
		).toContain(TimekeepViewMode.QUARTER);
		(mode as HTMLSelectElement).value = TimekeepViewMode.WEEK;
		mode?.dispatchEvent(new Event("change"));
		expect(viewState.getState().mode).toBe(TimekeepViewMode.WEEK);

		component.wrapperEl?.querySelector<HTMLButtonElement>('[data-action="previous"]')?.click();
		expect(viewState.getState()).toMatchObject({
			anchorDate: "2026-08-05",
			followCurrent: false,
		});

		component.wrapperEl?.querySelector<HTMLButtonElement>('[data-action="current"]')?.click();
		expect(viewState.getState()).toMatchObject({
			anchorDate: "2026-08-12",
			followCurrent: true,
		});
		expect(
			component.wrapperEl?.querySelector<HTMLButtonElement>('[data-action="next"]')?.disabled
		).toBe(true);
		component.wrapperEl?.querySelector<HTMLButtonElement>('[data-action="next"]')?.click();
		expect(viewState.getState().anchorDate).toBe("2026-08-12");

		component.unload();
	});
});
