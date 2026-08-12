// @vitest-environment happy-dom

import type { App } from "obsidian";

import moment from "moment";
import { beforeEach, it, describe, Mock, vi, expect, afterEach } from "vitest";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createMockContainer } from "@/__mocks__/obsidian";
import { ClockFormat, defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { TimesheetRowContentEditing } from "./TimesheetRowContentEditing";

import { defaultTimekeep, type TimeEntry, type Timekeep } from "@/timekeep/schema";

function getInput(containerEl: HTMLElement, name: string): HTMLInputElement {
	const inputEl = containerEl.querySelector<HTMLInputElement>(`input[name="${name}"]`);
	expect(inputEl).not.toBeNull();
	return inputEl!;
}

function submitEditor(containerEl: HTMLElement): void {
	const formEl = containerEl.querySelector<HTMLFormElement>("form.timekeep-df-editing");
	expect(formEl).not.toBeNull();
	formEl!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
}

describe("TimesheetRowContentEditing", () => {
	let containerEl: HTMLElement;
	let app: App;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let onFinishEditing: Mock<() => void>;
	let component: TimesheetRowContentEditing;

	beforeEach(() => {
		app = {} as App;
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);
		onFinishEditing = vi.fn();
	});

	afterEach(() => {
		if (component) component.unload();
	});

	it("should load without error", () => {
		const start = moment();

		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment(start),
			endTime: null,
			subEntries: null,
		};

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();
	});

	it("renders native date and time inputs initialized in local time on every platform", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T07:05:42.987"),
			endTime: moment("2026-08-11T18:47:31.456"),
			subEntries: null,
		};
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		expect(getInput(containerEl, "timekeep-df-start-date").type).toBe("date");
		expect(getInput(containerEl, "timekeep-df-start-native-time").type).toBe("time");
		expect(getInput(containerEl, "timekeep-df-start-date").value).toBe("2026-08-11");
		expect(getInput(containerEl, "timekeep-df-start-native-time").value).toBe("07:05");
		expect(getInput(containerEl, "timekeep-df-end-date").value).toBe("2026-08-11");
		expect(getInput(containerEl, "timekeep-df-end-native-time").value).toBe("18:47");
		expect(containerEl.querySelectorAll('input[type="number"]')).toHaveLength(0);
	});

	it("hints the selected 12-hour or 24-hour format to native time pickers", () => {
		settings.setState({ ...defaultSettings, clockFormat: ClockFormat.TWELVE_HOUR });
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T18:47"),
			endTime: null,
			subEntries: null,
		};
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		expect(getInput(containerEl, "timekeep-df-start-native-time").lang).toBe("en-US");
	});

	it("saves native picker changes at minute precision", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T09:00:22.123"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [entry] });
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		const nativeTimeInputEl = getInput(containerEl, "timekeep-df-start-native-time");
		nativeTimeInputEl.value = "23:45";

		submitEditor(containerEl);
		const saved = timekeep.getState().entries[0].startTime!;
		expect(saved.format("YYYY-MM-DD HH:mm:ss.SSS")).toBe("2026-08-11 23:45:00.000");
	});

	it("saves edited dates and native times at minute precision", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T09:00:22.123"),
			endTime: moment("2026-08-11T10:00:44.987"),
			subEntries: null,
		};
		timekeep.setState({ entries: [entry] });
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		getInput(containerEl, "timekeep-df-start-date").value = "2026-09-03";
		getInput(containerEl, "timekeep-df-start-native-time").value = "14:33";
		getInput(containerEl, "timekeep-df-end-date").value = "2026-09-04";
		const endNativeTime = getInput(containerEl, "timekeep-df-end-native-time");
		endNativeTime.value = "01:02";
		endNativeTime.dispatchEvent(new InputEvent("input", { bubbles: true }));

		submitEditor(containerEl);
		const [saved] = timekeep.getState().entries;
		expect(saved.startTime?.format("YYYY-MM-DD HH:mm:ss.SSS")).toBe("2026-09-03 14:33:00.000");
		expect(saved.endTime?.format("YYYY-MM-DD HH:mm:ss.SSS")).toBe("2026-09-04 01:02:00.000");
	});

	it("clicking the cancel button should call onFinishEditing", () => {
		const start = moment();

		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment(start),
			endTime: null,
			subEntries: null,
		};
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		const cancelButton = containerEl.querySelector('.timekeep-df-action[data-action="cancel"]');
		expect(cancelButton).not.toBeNull();
		(cancelButton as HTMLButtonElement).click();
		expect(onFinishEditing).toHaveBeenCalledOnce();
	});

	it("clicking the save button should update the timekeep state and call onFinishEditing", () => {
		const start = moment();

		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment(start),
			endTime: moment(start),
			subEntries: null,
		};

		const setState = vi.spyOn(timekeep, "setState");

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onSubmit = vi.spyOn(component, "onSubmit");
		component.load();

		const form = containerEl.querySelector("form.timekeep-df-editing");
		expect(form).not.toBeNull();
		(form as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: true })
		);

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onFinishEditing).toHaveBeenCalledOnce();
		expect(setState).toHaveBeenCalledOnce();
	});

	it("clicking the save button on a group should update the timekeep state and call onFinishEditing", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [],
		};

		const setState = vi.spyOn(timekeep, "setState");

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onSubmit = vi.spyOn(component, "onSubmit");
		component.load();

		const form = containerEl.querySelector("form.timekeep-df-editing");
		expect(form).not.toBeNull();
		(form as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: true })
		);

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onFinishEditing).toHaveBeenCalledOnce();
		expect(setState).toHaveBeenCalledOnce();
	});

	it("clicking the save button on a unstarted entry should update the timekeep state and call onFinishEditing", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: null,
		};

		const setState = vi.spyOn(timekeep, "setState");

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onSubmit = vi.spyOn(component, "onSubmit");
		component.load();

		const form = containerEl.querySelector("form.timekeep-df-editing");
		expect(form).not.toBeNull();
		(form as HTMLFormElement).dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: true })
		);

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onFinishEditing).toHaveBeenCalledOnce();
		expect(setState).toHaveBeenCalledOnce();
	});

	it("editing a group entry should hide the start and end time inputs", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [],
		};

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		const startTime = containerEl.querySelector(
			'.timekeep-df-timestamp-editor[data-timestamp="start"]'
		);
		const endTime = containerEl.querySelector(
			'.timekeep-df-timestamp-editor[data-timestamp="end"]'
		);

		expect(startTime).not.toBeNull();
		expect(endTime).not.toBeNull();
		expect((startTime as HTMLElement).hidden).toBeTruthy();
		expect((endTime as HTMLElement).hidden).toBeTruthy();
	});

	it("editing an unstarted entry should hide both timestamp editors", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: null,
		};
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		expect(
			containerEl.querySelector<HTMLElement>(
				'.timekeep-df-timestamp-editor[data-timestamp="start"]'
			)?.hidden
		).toBeTruthy();
		expect(
			containerEl.querySelector<HTMLElement>(
				'.timekeep-df-timestamp-editor[data-timestamp="end"]'
			)?.hidden
		).toBeTruthy();
	});

	it("editing a running entry should show only the start timestamp editor", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T09:00"),
			endTime: null,
			subEntries: null,
		};
		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		component.load();

		expect(
			containerEl.querySelector<HTMLElement>(
				'.timekeep-df-timestamp-editor[data-timestamp="start"]'
			)?.hidden
		).toBeFalsy();
		expect(
			containerEl.querySelector<HTMLElement>(
				'.timekeep-df-timestamp-editor[data-timestamp="end"]'
			)?.hidden
		).toBeTruthy();
	});

	it("clicking delete on an entry should open a modal for confirmation", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [],
		};

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onConfirmDelete = vi.spyOn(component, "onConfirmDelete");
		component.load();

		const deleteButton = containerEl.querySelector('.timekeep-df-action[data-action="delete"]');
		expect(deleteButton).not.toBeNull();
		(deleteButton as HTMLButtonElement).click();

		expect(onConfirmDelete).toHaveBeenCalled();

		const contentEl: HTMLElement = document!.querySelector(".mock-modal-content")!;
		expect(contentEl).toBeInstanceOf(HTMLElement);
	});

	it("cancelling deletion should do nothing", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [],
		};

		timekeep.setState({ entries: [entry] });

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onConfirmDelete = vi.spyOn(component, "onConfirmDelete");
		const onConfirmedDelete = vi.spyOn(component, "onConfirmedDelete");
		component.load();

		const deleteButton = containerEl.querySelector('.timekeep-df-action[data-action="delete"]');
		expect(deleteButton).not.toBeNull();
		(deleteButton as HTMLButtonElement).click();

		expect(onConfirmDelete).toHaveBeenCalled();

		const contentEl: HTMLElement = document!.querySelector(".mock-modal-content")!;
		expect(contentEl).toBeInstanceOf(HTMLElement);

		const cancelButton = contentEl.querySelector(
			'.timekeep-df-confirm-modal-button[data-action="cancel"]'
		);
		expect(cancelButton).not.toBeNull();
		(cancelButton as HTMLButtonElement).click();

		expect(onConfirmedDelete).toHaveBeenCalledWith(false);

		// Timekeep should not be empty
		expect(timekeep.getState()).toEqual({ entries: [entry] });
	});

	it("confirming deletion should remove the entry from the timekeep", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [],
		};

		timekeep.setState({ entries: [entry] });

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onConfirmDelete = vi.spyOn(component, "onConfirmDelete");
		const onConfirmedDelete = vi.spyOn(component, "onConfirmedDelete");
		component.load();

		const deleteButton = containerEl.querySelector('.timekeep-df-action[data-action="delete"]');
		expect(deleteButton).not.toBeNull();
		(deleteButton as HTMLButtonElement).click();

		expect(onConfirmDelete).toHaveBeenCalled();

		const contentEl: HTMLElement = document!.querySelector(".mock-modal-content")!;
		expect(contentEl).toBeInstanceOf(HTMLElement);

		const okButton = contentEl.querySelector(
			'.timekeep-df-confirm-modal-button[data-action="ok"]'
		);
		expect(okButton).not.toBeNull();
		(okButton as HTMLButtonElement).click();

		expect(onConfirmedDelete).toHaveBeenCalledWith(true);

		// Timekeep should be empty
		expect(timekeep.getState()).toEqual({ entries: [] });
	});

	it("preserves existing timestamps when a date or native time is empty or invalid", () => {
		const start = moment();
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment(start),
			endTime: moment(start),
			subEntries: null,
		};

		timekeep.setState({ entries: [entry] });

		const setState = vi.spyOn(timekeep, "setState");

		component = new TimesheetRowContentEditing(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			onFinishEditing
		);
		const onSubmit = vi.spyOn(component, "onSubmit");
		component.load();

		getInput(containerEl, "timekeep-df-start-date").value = "";
		const endTimeInputEl = getInput(containerEl, "timekeep-df-end-native-time");
		endTimeInputEl.value = "00";
		expect(endTimeInputEl.value).toBe("");

		submitEditor(containerEl);

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onFinishEditing).toHaveBeenCalledOnce();
		expect(setState).toHaveBeenCalledOnce();

		// Entry should not have changed if the input values were not valid timestamps
		expect(timekeep.getState()).toEqual({ entries: [entry] });
	});
});
