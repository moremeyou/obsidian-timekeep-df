// @vitest-environment happy-dom

import type { App } from "obsidian";

import moment from "moment";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer, MockModal, MockPlatform } from "@/__mocks__/obsidian";
import { defaultSettings, TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";

import { TimesheetRow } from "./TimesheetRow";
import { TimesheetRowContent } from "./TimesheetRowContent";
import { TimesheetRowContentEditing } from "./TimesheetRowContentEditing";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetRowContainer", () => {
	let containerEl: HTMLElement;
	let app: App;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let component: TimesheetRow;

	const start = moment();
	const entry: TimeEntry = {
		id: 1,
		name: "Test",
		startTime: moment(start),
		endTime: null,
		subEntries: null,
	};

	beforeEach(() => {
		MockPlatform.isMobile = false;
		MockPlatform.isPhone = false;
		containerEl = createMockContainer();
		app = {} as App;
		timekeep = createStore<Timekeep>({ entries: [entry] });
		settings = createStore(defaultSettings);
		component = new TimesheetRow(containerEl, app, timekeep, settings, entry, 0);
	});

	it("opens the row editor in a modal on mobile and leaves the table row intact", () => {
		MockPlatform.isMobile = true;
		component.load();
		const content = component.getContent() as TimesheetRowContent;

		content.onBeginEditing();

		expect(component.getContent()).toBeInstanceOf(TimesheetRowContent);
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);
		expect(modal).toBeDefined();
		expect(modal?.modalEl.classList.contains("timekeep-df-compact-modal")).toBe(true);
		expect(modal?.modalEl.classList.contains("timekeep-df-phone-modal")).toBe(false);
		expect(modal?.titleEl.textContent).toBe("Edit Activity");
		expect(modal?.contentEl.querySelector("form.timekeep-df-editing")).not.toBeNull();
		expect(modal?.contentEl.querySelector("tr")).toBeNull();
		expect(
			modal?.contentEl.querySelector(".timekeep-df-row-edit-modal-content")
		).not.toBeNull();

		modal?.contentEl.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
		expect(modal?.close).toHaveBeenCalledOnce();
	});

	it("uses the native phone modal header outside the scrolling table", () => {
		MockPlatform.isMobile = true;
		MockPlatform.isPhone = true;
		component.load();
		(component.getContent() as TimesheetRowContent).onBeginEditing();
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);

		expect(modal?.modalEl.classList.contains("timekeep-df-phone-modal")).toBe(true);
		expect(modal?.contentEl.querySelector(".timekeep-df-edit-mobile-header")).toBeNull();
		expect(modal?.contentEl.querySelector('[data-action="save"]')).not.toBeNull();
		expect(modal?.contentEl.querySelector("tr")).toBeNull();
	});

	it("saves a mobile modal edit and closes it", () => {
		MockPlatform.isMobile = true;
		component.load();
		(component.getContent() as TimesheetRowContent).onBeginEditing();
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);
		const form = modal?.contentEl.querySelector<HTMLFormElement>("form.timekeep-df-editing");
		form!.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Updated";

		form!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

		expect(timekeep.getState().entries[0].name).toBe("Updated");
		expect(modal?.close).toHaveBeenCalledOnce();
	});

	it("moves a Block to another Activity from the mobile and tablet modal", () => {
		MockPlatform.isMobile = true;
		const block: TimeEntry = {
			id: 2,
			name: "Block 1",
			startTime: moment("2026-08-19T09:00"),
			endTime: moment("2026-08-19T10:00"),
			subEntries: null,
		};
		const targetBlock: TimeEntry = {
			id: 4,
			name: "Block 1",
			startTime: moment("2026-08-18T13:00"),
			endTime: moment("2026-08-18T14:00"),
			subEntries: null,
		};
		timekeep.setState({
			entries: [
				{
					id: 1,
					name: "Source",
					startTime: null,
					endTime: null,
					subEntries: [block],
				},
				{
					id: 3,
					name: "Target",
					startTime: null,
					endTime: null,
					subEntries: [targetBlock],
				},
			],
		});
		component = new TimesheetRow(containerEl, app, timekeep, settings, block, 1, {
			activityId: 1,
		});
		component.load();
		(component.getContent() as TimesheetRowContent).onBeginEditing();
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);
		const form = modal?.contentEl.querySelector<HTMLFormElement>("form.timekeep-df-editing");
		const activitySelect = form?.querySelector<HTMLSelectElement>('select[name="activity"]');

		expect(Array.from(activitySelect?.options ?? []).map((option) => option.text)).toEqual([
			"Source",
			"Target",
		]);
		expect(activitySelect?.value).toBe("1");
		activitySelect!.value = "3";
		form!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

		const [target] = timekeep.getState().entries;
		expect(target.id).toBe(3);
		expect(target.subEntries?.map((child) => child.id)).toEqual([4, 2]);
		expect(modal?.close).toHaveBeenCalledOnce();
	});

	it("saves from the phone footer and closes the modal", () => {
		MockPlatform.isMobile = true;
		MockPlatform.isPhone = true;
		component.load();
		(component.getContent() as TimesheetRowContent).onBeginEditing();
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);
		modal!.contentEl.querySelector<HTMLInputElement>('input[name="name"]')!.value =
			"Phone update";

		modal!.contentEl.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();

		expect(timekeep.getState().entries[0].name).toBe("Phone update");
		expect(modal?.close).toHaveBeenCalledOnce();
	});

	it("claims and clears a historical mobile draft without opening duplicate modals", () => {
		MockPlatform.isMobile = true;
		const historicalDraft = createStore<HistoricalActivityDraft | null>({
			activityId: entry.id,
			activityName: entry.name,
			entryId: entry.id,
			entryName: entry.name,
			initialTime: moment("2026-08-11T14:25"),
		});
		component = new TimesheetRow(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			{},
			undefined,
			historicalDraft,
			historicalDraft.getState()
		);

		component.load();
		expect(historicalDraft.getState()?.claimed).toBe(true);
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);
		expect(modal).toBeDefined();
		component.onViewEditing();
		expect(
			Array.from(MockModal.instances).filter((instance) =>
				instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
			)
		).toHaveLength(1);

		modal?.close();
		expect(historicalDraft.getState()).toBeNull();
	});

	it("edits the most recently started Block in the selected Day from an Activity row", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-24T18:00:00"));
		const morning: TimeEntry = {
			id: 2,
			name: "Morning",
			startTime: moment("2026-08-23T09:00"),
			endTime: moment("2026-08-23T10:00"),
			subEntries: null,
		};
		const afternoon: TimeEntry = {
			id: 3,
			name: "Afternoon",
			startTime: moment("2026-08-23T14:00"),
			endTime: moment("2026-08-23T15:00"),
			subEntries: null,
		};
		const laterDay: TimeEntry = {
			id: 4,
			name: "Later day",
			startTime: moment("2026-08-24T16:00"),
			endTime: moment("2026-08-24T17:00"),
			subEntries: null,
		};
		const activity: TimeEntry = {
			id: 1,
			name: "Activity",
			startTime: null,
			endTime: null,
			subEntries: [morning, laterDay, afternoon],
		};
		timekeep.setState({ entries: [activity] });
		component = new TimesheetRow(
			containerEl,
			app,
			timekeep,
			settings,
			activity,
			0,
			{ activityId: activity.id },
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-23",
				followCurrent: false,
			})
		);
		component.load();

		(component.getContent() as TimesheetRowContent).onBeginEditing();

		const editor = component.getContent() as TimesheetRowContentEditing;
		expect(editor.entry.id).toBe(afternoon.id);
		expect(editor.wrapperEl?.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
			"Afternoon"
		);
		expect(
			editor.wrapperEl?.querySelector<HTMLSelectElement>('select[name="activity"]')?.value
		).toBe(String(activity.id));
		vi.useRealTimers();
	});

	it("edits the most recently started Block in a longer selected range", () => {
		const earlierBlock: TimeEntry = {
			id: 2,
			name: "Monday Block",
			startTime: moment("2026-08-24T09:00"),
			endTime: moment("2026-08-24T10:00"),
			subEntries: null,
		};
		const latestBlock: TimeEntry = {
			id: 3,
			name: "Sunday Block",
			startTime: moment("2026-08-30T14:00"),
			endTime: moment("2026-08-30T15:00"),
			subEntries: null,
		};
		const laterOutOfRangeBlock: TimeEntry = {
			id: 4,
			name: "Later Block",
			startTime: moment("2026-08-31T16:00"),
			endTime: moment("2026-08-31T17:00"),
			subEntries: null,
		};
		const activity: TimeEntry = {
			id: 1,
			name: "Activity",
			startTime: null,
			endTime: null,
			subEntries: [earlierBlock, laterOutOfRangeBlock, latestBlock],
		};
		timekeep.setState({ entries: [activity] });
		component = new TimesheetRow(
			containerEl,
			app,
			timekeep,
			settings,
			activity,
			0,
			{ activityId: activity.id },
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-24",
				followCurrent: false,
			})
		);
		component.load();

		(component.getContent() as TimesheetRowContent).onBeginEditing();

		const editor = component.getContent() as TimesheetRowContentEditing;
		expect(editor.entry.id).toBe(latestBlock.id);
		expect(editor.wrapperEl?.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
			"Sunday Block"
		);
		expect(editor.wrapperEl?.querySelector('select[name="activity"]')).not.toBeNull();
	});

	it("opens the latest Day Block in the mobile Activity-row modal", () => {
		MockPlatform.isMobile = true;
		const block: TimeEntry = {
			id: 2,
			name: "Latest Block",
			startTime: moment("2026-08-23T14:00"),
			endTime: moment("2026-08-23T15:00"),
			subEntries: null,
		};
		const activity: TimeEntry = {
			id: 1,
			name: "Activity",
			startTime: null,
			endTime: null,
			subEntries: [block],
		};
		timekeep.setState({ entries: [activity] });
		component = new TimesheetRow(
			containerEl,
			app,
			timekeep,
			settings,
			activity,
			0,
			{ activityId: activity.id },
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-23",
				followCurrent: false,
			})
		);
		component.load();
		(component.getContent() as TimesheetRowContent).onBeginEditing();
		const modal = Array.from(MockModal.instances).find((instance) =>
			instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
		);

		expect(modal?.titleEl.textContent).toBe("Edit Block");
		expect(modal?.contentEl.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
			"Latest Block"
		);
		expect(modal?.contentEl.querySelector('select[name="activity"]')).not.toBeNull();
	});

	it("should load without error", () => {
		expect(() => component.load()).not.toThrow();
	});

	it("should be able to switch to the editing view", () => {
		const onViewEditing = vi.spyOn(component, "onViewContent");

		component.load();

		const content = component.getContent() as TimesheetRowContent;
		content.onBeginEditing();
		expect(onViewEditing).toHaveBeenCalled();
	});

	it("should be able to switch to the editing view and back to the normal view", () => {
		const onViewEditing = vi.spyOn(component, "onViewEditing");
		const onViewContent = vi.spyOn(component, "onViewContent");

		component.load();

		const content = component.getContent() as TimesheetRowContent;
		expect(content).toBeInstanceOf(TimesheetRowContent);
		content.onBeginEditing();
		expect(onViewEditing).toHaveBeenCalled();

		const editingContent = component.getContent() as TimesheetRowContentEditing;
		expect(editingContent).toBeInstanceOf(TimesheetRowContentEditing);
		editingContent.onFinishEditing();
		expect(onViewContent).toHaveBeenCalled();
	});

	it("returns a horizontally scrolled table to the left edge when editing starts", () => {
		const tableWrapperEl = containerEl.createDiv({ cls: "timekeep-df-table-wrapper" });
		const bodyEl = tableWrapperEl.createEl("table").createEl("tbody");
		component = new TimesheetRow(bodyEl, app, timekeep, settings, entry, 0);
		component.load();
		tableWrapperEl.scrollLeft = 240;

		(component.getContent() as TimesheetRowContent).onBeginEditing();

		expect(tableWrapperEl.scrollLeft).toBe(0);
		expect(component.getContent()).toBeInstanceOf(TimesheetRowContentEditing);
	});
});
