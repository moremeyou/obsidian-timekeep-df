import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { assert } from "@/utils/assert";

import { ReplaceableComponent } from "../ReplaceableComponent";

import { createObsidianIcon } from "@/components/obsidianIcon";

import { getRunningEntry } from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import { updateEntry } from "@/timekeep/update";

let nextRunningEntryEditorId = 1;

/**
 * The editing section for editing the currently
 * running time entry within the start section
 */
export class TimesheetRunningEntryEditing extends ReplaceableComponent {
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;

	/** Name editing input element */
	#nameInputEl: HTMLInputElement | undefined;

	/** Default value for the name being edited */
	#editingName: string;

	/** Callback for when editing is finished */
	onFinishEditing: VoidFunction;
	/** Fork-scoped, per-instance name input identifier */
	readonly #nameInputId: string;

	constructor(
		containerEl: HTMLElement,

		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,

		editingName: string,
		onFinishEditing: VoidFunction
	) {
		super(containerEl);

		this.timekeep = timekeep;
		this.settings = settings;

		this.#editingName = editingName;
		this.onFinishEditing = onFinishEditing;
		this.#nameInputId = `timekeep-df-running-name-${nextRunningEntryEditorId++}`;
	}

	createContainer(): HTMLElement {
		return createEl("form", {
			cls: "timekeep-df-start-area",
			attr: {
				"data-area": "start",
			},
		});
	}

	render(formEl: HTMLElement): void {
		this.registerDomEvent(formEl, "submit", this.onSave.bind(this));

		const nameWrapperEl = formEl.createDiv({
			cls: "timekeep-df-name-wrapper",
		});

		const nameLabelEl = nameWrapperEl.createEl("label", {
			text: "Edit:",
		});
		nameLabelEl.htmlFor = this.#nameInputId;

		const nameInputEl = nameWrapperEl.createEl("input", {
			cls: "timekeep-df-name",
			placeholder: "Example Activity",
			type: "text",
			value: this.#editingName,
		});
		nameInputEl.id = this.#nameInputId;
		this.#nameInputEl = nameInputEl;

		const saveButton = formEl.createEl("button", {
			cls: ["timekeep-df-start", "timekeep-df-start--save", "timekeep-df-icon-button"],
			title: "Save",
		});
		saveButton.type = "submit";
		createObsidianIcon(saveButton, "save", "timekeep-df-button-icon");

		const cancelButton = formEl.createEl("button", {
			cls: ["timekeep-df-start", "timekeep-df-start--close", "timekeep-df-icon-button"],
			title: "Cancel ",
		});
		cancelButton.type = "button";
		createObsidianIcon(cancelButton, "x", "timekeep-df-button-icon");
		this.registerDomEvent(cancelButton, "click", this.onFinishEditing);
	}

	onSave(event: Event) {
		// Prevent form submission from reloading Obsidian
		event.preventDefault();
		event.stopPropagation();

		const nameInputEl = this.#nameInputEl;
		assert(nameInputEl, "Name input element should be defined");

		const timekeep = this.timekeep.getState();
		const currentEntry = getRunningEntry(timekeep.entries);

		if (!currentEntry) return;

		const editingName = nameInputEl.value;

		this.timekeep.setState((timekeep) => {
			const entries = updateEntry(timekeep.entries, currentEntry.id, {
				...currentEntry,
				name: editingName,
			});

			return {
				...timekeep,
				entries,
			};
		});
	}
}
