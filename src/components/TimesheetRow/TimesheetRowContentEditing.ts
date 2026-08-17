import type { App } from "obsidian";

import moment, { type Moment } from "moment";

import type { Store } from "@/store";

import { ClockFormat, type TimekeepSettings } from "@/settings";
import { createStore } from "@/store";
import { assert } from "@/utils/assert";

import { createObsidianIcon } from "@/components/obsidianIcon";
import { ReplaceableComponent } from "@/components/ReplaceableComponent";

import { ConfirmModal } from "@/modals/ConfirmModal";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import { getEntryById } from "@/timekeep/queries";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { removeActivityTimeWithinWindow, removeEntry, updateEntry } from "@/timekeep/update";
import {
	createTimekeepViewState,
	formatTimekeepViewLabel,
	getTimekeepViewWindow,
	type TimekeepViewState,
} from "@/timekeep/view";

type TimestampInputName = "start" | "end";
export type TimesheetRowEditorPresentation = "row" | "modal";

interface TimestampEditor {
	containerEl: HTMLElement;
	dateInputEl: HTMLInputElement;
	nativeTimeInputEl: HTMLInputElement;
	getValue: () => Moment;
	setValue: (value: Moment) => void;
}

/**
 * Component for a timesheet row entry that is currently
 * being edited
 */
export class TimesheetRowContentEditing extends ReplaceableComponent {
	/** Access to the app instance */
	app: App;

	/** Access to the timekeep */
	timekeep: Store<Timekeep>;

	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;

	/** The entry for this row */
	entry: TimeEntry;
	/** Transient context for an unstarted interval opened from a historical range. */
	historicalDraft: HistoricalActivityDraft | null;
	presentation: TimesheetRowEditorPresentation;
	viewState: Store<TimekeepViewState>;
	isActivity: boolean;

	/** Input for the entry name */
	#nameInputEl: HTMLInputElement | undefined;
	/** Date and time editor for the entry start */
	#startTimeEditor: TimestampEditor | undefined;
	/** Date and time editor for the entry end */
	#endTimeEditor: TimestampEditor | undefined;

	/** Callback for editing finished / cancelled */
	onFinishEditing: VoidFunction;

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		entry: TimeEntry,
		onFinishEditing: VoidFunction,
		historicalDraft: HistoricalActivityDraft | null = null,
		presentation: TimesheetRowEditorPresentation = "row",
		viewState?: Store<TimekeepViewState>,
		isActivity: boolean = entry.subEntries !== null
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;

		this.entry = entry;
		this.historicalDraft = historicalDraft;
		this.presentation = presentation;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
		this.isActivity = isActivity;
		this.onFinishEditing = onFinishEditing;
	}

	createContainer(): HTMLElement {
		return this.presentation === "row"
			? createEl("tr", { cls: "timekeep-df-row" })
			: createDiv({ cls: "timekeep-df-row-edit-modal-content" });
	}

	render(wrapperEl: HTMLElement): void {
		const contentEl = this.presentation === "row" ? wrapperEl.createEl("td") : wrapperEl;
		if (contentEl instanceof HTMLTableCellElement) contentEl.colSpan = 7;

		const formEl = contentEl.createEl("form", { cls: "timekeep-df-editing" });
		this.registerDomEvent(formEl, "submit", this.onSubmit.bind(this));

		const nameLabelEl = formEl.createEl("label", {
			cls: "timekeep-df-input-label",
		});
		const nameInputEl = nameLabelEl.createEl("input", {
			cls: "timekeep-df-input",
			type: "text",
			attr: { "aria-label": "Name" },
		});
		nameInputEl.name = "name";
		this.#nameInputEl = nameInputEl;

		const clockFormat = this.settings.getState().clockFormat;
		this.#startTimeEditor = this.createTimestampEditor(formEl, "start", clockFormat);
		this.#endTimeEditor = this.createTimestampEditor(formEl, "end", clockFormat);

		const footerEl = formEl.createDiv({ cls: "timekeep-df-editing-footer" });
		const actionsEl = footerEl.createDiv({
			cls: "timekeep-df-editing-actions",
		});
		const adjustmentActionsEl = footerEl.createDiv({
			cls: "timekeep-df-editing-adjustments",
		});
		adjustmentActionsEl.hidden =
			this.entry.subEntries !== null ||
			(this.entry.startTime === null && this.historicalDraft === null);

		const subtractButton = adjustmentActionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: { "data-action": "subtract-five-minutes" },
		});
		subtractButton.type = "button";
		createObsidianIcon(subtractButton, "rotate-ccw-clock", "timekeep-df-text-button-icon");
		subtractButton.appendText("-5 Min");
		this.registerDomEvent(subtractButton, "click", () => this.adjustDuration(-5));

		const addButton = adjustmentActionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: { "data-action": "add-five-minutes" },
		});
		addButton.type = "button";
		addButton.appendText("+5 Min");
		this.registerDomEvent(addButton, "click", () => this.adjustDuration(5));

		const saveButton = actionsEl.createEl("button", {
			cls: "mod-cta timekeep-df-action",
			attr: {
				"data-action": "save",
			},
		});
		saveButton.type = "submit";
		createObsidianIcon(saveButton, "save", "timekeep-df-text-button-icon");
		saveButton.appendText("Save");

		const cancelButton = actionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: {
				"data-action": "cancel",
			},
		});
		cancelButton.type = "button";
		this.registerDomEvent(cancelButton, "click", this.onFinishEditing);
		cancelButton.appendText("Cancel");

		const destructiveActionsEl = footerEl.createDiv({
			cls: "timekeep-df-editing-destructive",
		});
		const deleteButton = destructiveActionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: {
				"data-action": "delete",
			},
		});
		deleteButton.type = "button";
		createObsidianIcon(deleteButton, "trash-2", "timekeep-df-text-button-icon");
		deleteButton.appendText(this.isActivity ? "Delete in range" : "Delete");

		this.registerDomEvent(deleteButton, "click", this.onConfirmDelete.bind(this));
		if (this.isActivity) {
			const deleteAllButton = destructiveActionsEl.createEl("button", {
				cls: "timekeep-df-action",
				attr: { "data-action": "delete-all-history" },
			});
			deleteAllButton.type = "button";
			createObsidianIcon(deleteAllButton, "trash-2", "timekeep-df-text-button-icon");
			deleteAllButton.appendText("Delete all history");
			this.registerDomEvent(
				deleteAllButton,
				"click",
				this.onConfirmDeleteAllHistory.bind(this)
			);
		}

		const onUpdateState = this.onUpdateState.bind(this);
		const unsubscribeSettings = this.settings.subscribe(onUpdateState);
		this.register(unsubscribeSettings);
		onUpdateState();
	}

	/** Adjust the edited duration without changing stored data until Save is pressed. */
	adjustDuration(minutes: number): void {
		assert(this.#startTimeEditor && this.#endTimeEditor, "Timestamp editors should exist");

		const start = this.#startTimeEditor.getValue();
		if (!start.isValid()) return;
		if (this.historicalDraft) {
			const end = this.#endTimeEditor.getValue();
			if (!end.isValid()) return;
			this.#endTimeEditor.setValue(moment.max(start, moment(end).add(minutes, "minutes")));
			return;
		}

		if (this.entry.endTime !== null) {
			const end = this.#endTimeEditor.getValue();
			if (!end.isValid()) return;
			this.#endTimeEditor.setValue(moment.max(start, moment(end).add(minutes, "minutes")));
			return;
		}

		const latestStart = moment().startOf("minute");
		const adjustedStart = moment(start).subtract(minutes, "minutes");
		this.#startTimeEditor.setValue(moment.min(adjustedStart, latestStart));
	}

	createTimestampEditor(
		formEl: HTMLElement,
		name: TimestampInputName,
		clockFormat: ClockFormat
	): TimestampEditor {
		const title = name === "start" ? "START" : "END";
		const containerEl = formEl.createDiv({
			cls: "timekeep-df-timestamp-editor",
			attr: { "data-timestamp": name },
		});
		containerEl.createDiv({ cls: "timekeep-df-timestamp-title", text: title });

		const fieldsEl = containerEl.createDiv({ cls: "timekeep-df-timestamp-fields" });
		const dateFieldEl = fieldsEl.createEl("label", { cls: "timekeep-df-timestamp-field" });
		const dateInputEl = dateFieldEl.createEl("input", {
			cls: "timekeep-df-date-input",
			attr: { "aria-label": `${title} date` },
		});
		dateInputEl.type = "date";
		dateInputEl.name = `timekeep-df-${name}-date`;

		const timeFieldEl = fieldsEl.createDiv({ cls: "timekeep-df-timestamp-field" });
		const nativeTimeInputEl = timeFieldEl.createEl("input", {
			cls: "timekeep-df-native-time-input",
			attr: { "aria-label": `${title} time` },
		});
		nativeTimeInputEl.type = "time";
		nativeTimeInputEl.name = `timekeep-df-${name}-native-time`;
		nativeTimeInputEl.step = "60";
		nativeTimeInputEl.lang = clockFormat === ClockFormat.TWELVE_HOUR ? "en-US" : "en-GB";

		return {
			containerEl,
			dateInputEl,
			nativeTimeInputEl,
			getValue: () =>
				moment(`${dateInputEl.value}T${nativeTimeInputEl.value}`, "YYYY-MM-DDTHH:mm", true)
					.seconds(0)
					.milliseconds(0),
			setValue: (value: Moment) => {
				const localValue = moment(value).local();
				dateInputEl.value = localValue.format("YYYY-MM-DD");
				nativeTimeInputEl.value = localValue.format("HH:mm");
			},
		};
	}

	onUpdateState() {
		assert(
			this.#nameInputEl && this.#startTimeEditor && this.#endTimeEditor,
			"Elements expected to be defined"
		);

		const entry = this.entry;

		this.#nameInputEl.value = entry.name;

		this.#startTimeEditor.containerEl.hidden =
			entry.startTime === null && this.historicalDraft === null;
		if (entry.startTime) this.#startTimeEditor.setValue(entry.startTime);
		else if (this.historicalDraft)
			this.#startTimeEditor.setValue(this.historicalDraft.initialTime);

		this.#endTimeEditor.containerEl.hidden =
			entry.endTime === null && this.historicalDraft === null;
		if (entry.endTime) this.#endTimeEditor.setValue(entry.endTime);
		else if (this.historicalDraft)
			this.#endTimeEditor.setValue(this.historicalDraft.initialTime);
	}

	onConfirmDelete() {
		const state = this.viewState.getState();
		const blockCount = this.entry.subEntries?.length ?? 1;
		const rangeName = `${state.mode.charAt(0)}${state.mode.slice(1).toLowerCase()}`;
		const message = this.isActivity
			? `Delete ${blockCount} ${blockCount === 1 ? "Block" : "Blocks"} from ${this.entry.name} in ${formatTimekeepViewLabel(state)}? Time outside this ${rangeName} will be kept. This cannot be undone.`
			: "Delete this Block? This cannot be undone.";
		const modal = new ConfirmModal(this.app, message, this.onConfirmedDelete.bind(this));
		modal.setTitle("Confirm delete");
		modal.open();
	}

	onConfirmedDelete(confirmed: boolean) {
		if (!confirmed) {
			return;
		}

		const entry = this.entry;

		if (this.historicalDraft) this.onFinishEditing();
		this.timekeep.setState((timekeep) => {
			const entries = this.isActivity
				? removeActivityTimeWithinWindow(
						timekeep.entries,
						entry.id,
						moment(),
						getTimekeepViewWindow(this.viewState.getState())
					)
				: removeEntry(timekeep.entries, entry);
			return { ...timekeep, entries };
		});
		if (!this.historicalDraft) this.onFinishEditing();
	}

	onConfirmDeleteAllHistory() {
		const storedEntry = getEntryById(this.entry.id, this.timekeep.getState().entries);
		const blockCount = storedEntry?.subEntries?.length ?? (storedEntry?.startTime ? 1 : 0);
		const modal = new ConfirmModal(
			this.app,
			`Delete ${this.entry.name} and all ${blockCount} ${blockCount === 1 ? "Block" : "Blocks"} across every date? This cannot be undone.`,
			this.onConfirmedDeleteAllHistory.bind(this)
		);
		modal.setTitle("Confirm delete all history");
		modal.open();
	}

	onConfirmedDeleteAllHistory(confirmed: boolean) {
		if (!confirmed) return;
		const entry = this.entry;
		if (this.historicalDraft) this.onFinishEditing();
		this.timekeep.setState((timekeep) => ({
			...timekeep,
			entries: removeEntry(timekeep.entries, entry),
		}));
		if (!this.historicalDraft) this.onFinishEditing();
	}

	onSubmit(event: Event) {
		assert(
			this.#nameInputEl && this.#startTimeEditor && this.#endTimeEditor,
			"Expected inputs to be defined"
		);

		event.preventDefault();
		event.stopPropagation();

		const name = this.#nameInputEl.value;
		const entry = this.entry;

		// Clear a historical editor before its data update can rebuild the table.
		if (this.historicalDraft) this.onFinishEditing();

		// Save against the complete stored entry, never a range-filtered display copy.
		this.timekeep.setState((timekeep) => {
			const storedEntry = getEntryById(entry.id, timekeep.entries) ?? entry;
			const newEntry = { ...storedEntry, name };
			if (newEntry.subEntries === null) {
				if (this.historicalDraft) {
					const startTimeValue = this.#startTimeEditor!.getValue();
					const endTimeValue = this.#endTimeEditor!.getValue();
					if (
						startTimeValue.isValid() &&
						endTimeValue.isValid() &&
						endTimeValue.isAfter(startTimeValue)
					) {
						newEntry.startTime = startTimeValue;
						newEntry.endTime = endTimeValue;
					}
				} else if (storedEntry.startTime !== null) {
					const startTimeValue = this.#startTimeEditor!.getValue();
					if (startTimeValue.isValid()) newEntry.startTime = startTimeValue;
				}

				if (!this.historicalDraft && storedEntry.endTime !== null) {
					const endTimeValue = this.#endTimeEditor!.getValue();
					if (endTimeValue.isValid()) newEntry.endTime = endTimeValue;
				}
			}
			return { ...timekeep, entries: updateEntry(timekeep.entries, entry.id, newEntry) };
		});

		if (!this.historicalDraft) this.onFinishEditing();
	}
}
