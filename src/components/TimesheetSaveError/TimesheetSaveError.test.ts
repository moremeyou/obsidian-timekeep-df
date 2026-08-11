// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { createStore, Store } from "@/store";

import { TimesheetSaveError } from "./TimesheetSaveError";

import { defaultTimekeep, stripTimekeepRuntimeData, Timekeep } from "@/timekeep/schema";

describe("TimesheetSaveError", () => {
	let container: HTMLElement;
	let timekeepStore: Store<Timekeep>;
	let component: TimesheetSaveError;

	let writeText: Mock<() => any>;

	beforeEach(() => {
		container = createMockContainer();
		timekeepStore = createStore(defaultTimekeep());
		component = new TimesheetSaveError(container, timekeepStore);

		writeText = vi.fn().mockResolvedValue(undefined);

		// Mock the clipboard
		Object.defineProperty(globalThis.navigator, "clipboard", {
			configurable: true,
			value: {
				writeText,
			},
		});
	});

	it("renders wrapper, error message, and buttons on load", () => {
		component.load();

		const wrapper = container.querySelector(".timekeep-df-container");
		expect(wrapper).not.toBeNull();

		const errorDiv = wrapper!.querySelector(".timekeep-df-error");
		expect(errorDiv).not.toBeNull();

		expect(errorDiv!.textContent).toContain("Warning");
		expect(errorDiv!.textContent).toContain("Failed to save current Timekeep DF tracker");

		const actions = wrapper!.querySelector(".timekeep-df-actions");
		expect(actions).not.toBeNull();

		const buttons = Array.from(actions!.querySelectorAll("button")).map((b) => b.textContent);
		expect(buttons).toContain("Retry");
		expect(buttons).toContain("Copy Timekeep DF");
	});

	it("calls handleSaveTimekeep on retry button click", () => {
		const setState = vi.spyOn(timekeepStore, "setState");
		component.load();
		component.onRetrySave();
		expect(setState).toHaveBeenCalledWith(timekeepStore.getState());
	});

	it("writes JSON to clipboard on copy button click", async () => {
		component.load();

		await component.onCopy();

		expect(writeText).toHaveBeenCalledWith(
			JSON.stringify(stripTimekeepRuntimeData(timekeepStore.getState()))
		);
	});

	it("removes wrapper on unload", () => {
		component.load();
		component.unload();
		const wrapper = container.querySelector(".timekeep-df-container");
		expect(wrapper).toBeNull();
	});
});
