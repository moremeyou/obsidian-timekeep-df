// @vitest-environment happy-dom

import moment from "moment";
import { beforeEach, it, describe, afterEach, vi, expect } from "vitest";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createMockContainer, MockVault } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { TimesheetStartForm } from "./TimesheetStartForm";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

import { TimekeepAutocomplete } from "@/service/autocomplete";
import { TimekeepRegistry } from "@/service/registry";

describe("TimesheetStart", () => {
	let containerEl: HTMLElement;
	let vault: MockVault;

	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let registry: TimekeepRegistry;
	let autocomplete: TimekeepAutocomplete;
	let component: TimesheetStartForm;

	beforeEach(() => {
		vault = new MockVault();
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);

		registry = new TimekeepRegistry(vault.asVault(), settings);
		autocomplete = new TimekeepAutocomplete(registry, settings);
	});

	afterEach(() => {
		if (component) component.unload();
		vi.useRealTimers();
	});

	it("should load without error", () => {
		component = new TimesheetStartForm(containerEl, timekeep, settings, autocomplete);
		component.load();
		const button = component.wrapperEl?.querySelector("button");
		expect(button?.classList.contains("timekeep-df-icon-button")).toBe(true);
		expect(button?.title).toBe("Add Activity");
		expect(button?.getAttribute("aria-label")).toBe("Add Activity");
		expect(button?.querySelector("svg")?.dataset.icon).toBe("plus");
		const input = component.wrapperEl?.querySelector<HTMLInputElement>(".timekeep-df-name");
		expect(input?.placeholder).toBe("");
		expect(input?.getAttribute("aria-label")).toBe("Add Activity");
		expect(component.wrapperEl?.querySelector("label")).toBeNull();
		expect(component.wrapperEl?.querySelector(".timekeep-df-start-note")).toBeNull();
	});

	it("clicking start should start a new entry with the name", () => {
		const start = moment();

		vi.setSystemTime(start.toDate());

		component = new TimesheetStartForm(containerEl, timekeep, settings, autocomplete);

		const onStart = vi.spyOn(component, "onStart");
		component.load();

		const formEl = component.wrapperEl as HTMLFormElement;
		const nameInputEl = formEl.querySelector<HTMLInputElement>(".timekeep-df-name");
		expect(nameInputEl?.id).toMatch(/^timekeep-df-name-\d+$/);
		expect(nameInputEl?.getAttribute("aria-label")).toBe("Add Activity");
		(nameInputEl as HTMLInputElement).value = "Test";

		formEl.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
		expect(onStart).toHaveBeenCalled();

		expect(timekeep.getState()).toEqual({
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
	});

	it("reuses an autocomplete-named Activity in the current range", () => {
		const currentTime = moment("2026-08-12T12:00:00");
		vi.setSystemTime(currentTime.toDate());
		timekeep.setState({
			entries: [
				{
					id: 10,
					name: "Project Management",
					startTime: moment("2026-08-11T09:00:00"),
					endTime: moment("2026-08-11T10:00:00"),
					subEntries: null,
				},
			],
		});
		autocomplete.names.setState(["Project Management"]);
		component = new TimesheetStartForm(containerEl, timekeep, settings, autocomplete);
		component.load();

		const formEl = component.wrapperEl as HTMLFormElement;
		formEl.querySelector<HTMLInputElement>(".timekeep-df-name")!.value = "Project Management";
		formEl.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

		const [activity] = timekeep.getState().entries;
		expect(timekeep.getState().entries).toHaveLength(1);
		expect(activity.name).toBe("Project Management");
		expect(activity.subEntries).toHaveLength(2);
		expect(activity.subEntries?.at(-1)?.startTime?.format("YYYY-MM-DD HH:mm:ss")).toBe(
			"2026-08-12 12:00:00"
		);
	});

	it("adds an unstarted Activity in a historical range without stopping current work", () => {
		vi.useFakeTimers();
		const currentTime = moment("2026-08-12T12:00:00");
		vi.setSystemTime(currentTime.toDate());
		const runningEntry = {
			id: 50,
			name: "Current work",
			startTime: moment("2026-08-12T10:00:00"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningEntry] });
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		const historicalDraft = createStore<HistoricalActivityDraft | null>(null);
		autocomplete.names.setState(["Historical Activity"]);
		component = new TimesheetStartForm(
			containerEl,
			timekeep,
			settings,
			autocomplete,
			viewState,
			historicalDraft
		);
		component.load();

		const formEl = component.wrapperEl as HTMLFormElement;
		expect(formEl.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
		formEl.querySelector<HTMLInputElement>(".timekeep-df-name")!.value = "historical activity";
		formEl.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

		const [stillRunning, added] = timekeep.getState().entries;
		expect(stillRunning.endTime).toBeNull();
		expect(added).toMatchObject({
			name: "Historical Activity",
			startTime: null,
			endTime: null,
			subEntries: null,
		});
		expect(historicalDraft.getState()).toMatchObject({
			activityId: added.id,
			entryId: added.id,
		});
		expect(historicalDraft.getState()?.initialTime.format("YYYY-MM-DD HH:mm:ss")).toBe(
			"2026-08-11 12:00:00"
		);

		formEl.querySelector<HTMLInputElement>(".timekeep-df-name")!.value = "Historical Activity";
		formEl.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
		expect(timekeep.getState().entries).toHaveLength(2);
		expect(historicalDraft.getState()?.entryId).toBe(added.id);
	});
});
