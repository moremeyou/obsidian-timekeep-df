// @vitest-environment happy-dom

import moment from "moment";
import { beforeEach, it, describe, vi, expect } from "vitest";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { TimesheetRunningEntryEditing } from "./TimesheetRunningEntryEditing";

import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";

describe("TimesheetRunningEntryEditing", () => {
	let containerEl: HTMLElement;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let onFinishedEditing: VoidFunction;

	beforeEach(() => {
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);
		onFinishedEditing = vi.fn();
	});

	it("should load without error", () => {
		const component = new TimesheetRunningEntryEditing(
			containerEl,
			timekeep,
			settings,
			"Test Entry",
			onFinishedEditing
		);
		component.load();
		expect(component.wrapperEl?.querySelector("label")?.textContent).toBe("Edit:");
		expect(
			component.wrapperEl?.querySelector(".timekeep-df-name-wrapper")?.children
		).toHaveLength(2);
	});

	it("uses unique fork-scoped input IDs with matching labels", () => {
		const first = new TimesheetRunningEntryEditing(
			containerEl,
			timekeep,
			settings,
			"First",
			onFinishedEditing
		);
		const second = new TimesheetRunningEntryEditing(
			containerEl,
			timekeep,
			settings,
			"Second",
			onFinishedEditing
		);

		first.load();
		second.load();

		const inputs = Array.from(
			containerEl.querySelectorAll<HTMLInputElement>(".timekeep-df-name")
		);
		const labels = Array.from(containerEl.querySelectorAll<HTMLLabelElement>("label"));
		expect(inputs).toHaveLength(2);
		expect(new Set(inputs.map((input) => input.id)).size).toBe(2);
		expect(inputs.every((input) => /^timekeep-df-running-name-\d+$/.test(input.id))).toBe(true);
		expect(labels.map((label) => label.htmlFor)).toEqual(inputs.map((input) => input.id));

		first.unload();
		second.unload();
	});

	it("should save nothing if the running entry doesn't exist", () => {
		const component = new TimesheetRunningEntryEditing(
			containerEl,
			timekeep,
			settings,
			"Test Entry",
			onFinishedEditing
		);

		const onSave = vi.spyOn(component, "onSave");

		component.load();

		const formEl = component.wrapperEl!;
		(formEl as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: false })
		);
		expect(onSave).toHaveBeenCalled();
	});

	it("should be able to save the running entry", () => {
		const start = moment();
		const end = moment().add(1, "hour");
		vi.setSystemTime(end.toDate());

		const entry = {
			id: 1,
			name: "Test",
			startTime: moment(start),
			endTime: null,
			subEntries: null,
		};

		timekeep.setState({
			entries: [entry],
		});

		const component = new TimesheetRunningEntryEditing(
			containerEl,
			timekeep,
			settings,
			"Test Entry",
			onFinishedEditing
		);

		const onSave = vi.spyOn(component, "onSave");

		component.load();

		const formEl = component.wrapperEl!;

		const nameInputEl = formEl.querySelector(".timekeep-df-name");
		expect(nameInputEl).not.toBeNull();
		(nameInputEl as HTMLInputElement).value = "New Name";

		(formEl as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: false })
		);
		expect(onSave).toHaveBeenCalled();

		expect(timekeep.getState()).toEqual({
			entries: [{ ...entry, name: "New Name" }],
		});
	});
});
