import type { App } from "obsidian";

import moment, { type Moment } from "moment";

import type { Store } from "@/store";

import { ClockFormat, type TimekeepSettings } from "@/settings";
import { assert } from "@/utils/assert";

import { createObsidianIcon } from "@/components/obsidianIcon";
import { ReplaceableComponent } from "@/components/ReplaceableComponent";

import { ConfirmModal } from "@/modals/ConfirmModal";

import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { removeEntry, updateEntry } from "@/timekeep/update";

type TimestampInputName = "start" | "end";

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
		onFinishEditing: VoidFunction
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;

		this.entry = entry;
		this.onFinishEditing = onFinishEditing;
	}

	createContainer(): HTMLElement {
		return createEl("tr", { cls: "timekeep-df-row" });
	}

	render(wrapperEl: HTMLElement): void {
		const colEl = wrapperEl.createEl("td");
		colEl.colSpan = 6;

		const formEl = colEl.createEl("form", { cls: "timekeep-df-editing" });
		this.registerDomEvent(formEl, "submit", this.onSubmit.bind(this));

		const nameLabelEl = formEl.createEl("label", {
			cls: "timekeep-df-input-label",
			text: "Name",
		});
		const nameInputEl = nameLabelEl.createEl("input", {
			cls: "timekeep-df-input",
			type: "text",
		});
		nameInputEl.name = "name";
		this.#nameInputEl = nameInputEl;

		const clockFormat = this.settings.getState().clockFormat;
		this.#startTimeEditor = this.createTimestampEditor(formEl, "start", clockFormat);
		this.#endTimeEditor = this.createTimestampEditor(formEl, "end", clockFormat);

		const actionsEl = formEl.createDiv({
			cls: "timekeep-df-editing-actions",
		});

		const saveButton = actionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: {
				"data-action": "save",
			},
		});
		saveButton.type = "submit";
		createObsidianIcon(saveButton, "edit", "timekeep-df-text-button-icon");
		saveButton.appendText("Save");

		const cancelButton = actionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: {
				"data-action": "cancel",
			},
		});
		cancelButton.type = "button";
		createObsidianIcon(cancelButton, "x", "timekeep-df-text-button-icon");
		this.registerDomEvent(cancelButton, "click", this.onFinishEditing);
		cancelButton.appendText("Cancel");

		const deleteButton = actionsEl.createEl("button", {
			cls: "timekeep-df-action",
			attr: {
				"data-action": "delete",
			},
		});
		deleteButton.type = "button";
		createObsidianIcon(deleteButton, "trash", "timekeep-df-text-button-icon");
		deleteButton.appendText("Delete");

		this.registerDomEvent(deleteButton, "click", this.onConfirmDelete.bind(this));

		const onUpdateState = this.onUpdateState.bind(this);
		const unsubscribeSettings = this.settings.subscribe(onUpdateState);
		this.register(unsubscribeSettings);
		onUpdateState();
	}

	createTimestampEditor(
		formEl: HTMLElement,
		name: TimestampInputName,
		clockFormat: ClockFormat
	): TimestampEditor {
		const title = name === "start" ? "Start" : "End";
		const containerEl = formEl.createDiv({
			cls: "timekeep-df-timestamp-editor",
			attr: { "data-timestamp": name },
		});
		containerEl.createDiv({ cls: "timekeep-df-timestamp-title", text: title });

		const fieldsEl = containerEl.createDiv({ cls: "timekeep-df-timestamp-fields" });
		const dateFieldEl = fieldsEl.createEl("label", { cls: "timekeep-df-timestamp-field" });
		dateFieldEl.createSpan({ text: "Date" });
		const dateInputEl = dateFieldEl.createEl("input", {
			cls: "timekeep-df-date-input",
		});
		dateInputEl.type = "date";
		dateInputEl.name = `timekeep-df-${name}-date`;

		const timeFieldEl = fieldsEl.createDiv({ cls: "timekeep-df-timestamp-field" });
		timeFieldEl.createSpan({ text: "Time" });
		const nativeTimeInputEl = timeFieldEl.createEl("input", {
			cls: "timekeep-df-native-time-input",
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

		this.#startTimeEditor.containerEl.hidden = entry.startTime === null;
		if (entry.startTime) this.#startTimeEditor.setValue(entry.startTime);

		this.#endTimeEditor.containerEl.hidden = entry.endTime === null;
		if (entry.endTime) this.#endTimeEditor.setValue(entry.endTime);
	}

	onConfirmDelete() {
		const modal = new ConfirmModal(
			this.app,
			"Are you sure you want to delete this entry?",
			this.onConfirmedDelete.bind(this)
		);
		modal.setTitle("Confirm Delete");
		modal.open();
	}

	onConfirmedDelete(confirmed: boolean) {
		if (!confirmed) {
			return;
		}

		const entry = this.entry;

		this.timekeep.setState((timekeep) => ({
			entries: removeEntry(timekeep.entries, entry),
		}));
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

		const newEntry = { ...entry, name };

		// Update the start and end times for non groups
		if (newEntry.subEntries === null) {
			if (entry.startTime !== null) {
				const startTimeValue = this.#startTimeEditor.getValue();
				if (startTimeValue.isValid()) {
					newEntry.startTime = startTimeValue;
				}
			}

			if (entry.endTime !== null) {
				const endTimeValue = this.#endTimeEditor.getValue();
				if (endTimeValue.isValid()) {
					newEntry.endTime = endTimeValue;
				}
			}
		}

		// Save the updated entry
		this.timekeep.setState((timekeep) => ({
			entries: updateEntry(timekeep.entries, entry.id, newEntry),
		}));

		this.onFinishEditing();
	}
}
