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
