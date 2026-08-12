import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { assert } from "@/utils/assert";

import { DomComponent } from "@/components/DomComponent";
import { createObsidianIcon } from "@/components/obsidianIcon";
import { TimesheetNameInput } from "@/components/TimesheetNameInput";

import { getRunningEntry } from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import { startNewEntry } from "@/timekeep/start";

import { TimekeepAutocomplete } from "@/service/autocomplete";

/**
 * The add Activity section below the timesheet table
 */
export class TimesheetStartForm extends DomComponent {
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	/** Access to autocomplete */
	autocomplete: TimekeepAutocomplete;

	/** Name input for starting entries */
	#nameInput: TimesheetNameInput | undefined;

	/** Start button element */
	#startButtonEl: HTMLButtonElement | undefined;

	constructor(
		containerEl: HTMLElement,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		autocomplete: TimekeepAutocomplete
	) {
		super(containerEl);
		this.timekeep = timekeep;
		this.settings = settings;
		this.autocomplete = autocomplete;
	}

	onload(): void {
		super.onload();

		const formEl = this.containerEl.createEl("form", { cls: "timekeep-df-start-area" });
		formEl.setAttribute("data-area", "start");
		this.wrapperEl = formEl;

		this.registerDomEvent(formEl, "submit", this.onStart.bind(this));

		const nameWrapperEl = formEl.createDiv({ cls: "timekeep-df-name-wrapper" });
		const nameInput = new TimesheetNameInput(nameWrapperEl, this.autocomplete);

		this.#nameInput = nameInput;
		this.addChild(nameInput);

		const startButton = formEl.createEl("button", {
			cls: ["timekeep-df-start", "timekeep-df-icon-button"],
			title: "Add Activity",
		});
		startButton.type = "submit";
		startButton.setAttribute("aria-label", "Add Activity");
		createObsidianIcon(startButton, "plus", "timekeep-df-button-icon");
		this.#startButtonEl = startButton;

		const onUpdate = this.onUpdate.bind(this);
		this.register(this.timekeep.subscribe(onUpdate));
		onUpdate();
	}

	onUpdate() {
		const timekeep = this.timekeep.getState();
		const currentEntry = getRunningEntry(timekeep.entries);

		const startButtonEl = this.#startButtonEl;
		assert(startButtonEl, "Start button should be defined");

		const isTimekeepRunning = currentEntry !== null;
		startButtonEl.title = isTimekeepRunning
			? "Stop current Block and add Activity"
			: "Add Activity";
		startButtonEl.setAttribute("aria-label", startButtonEl.title);
	}

	onStart(event: Event) {
		// Prevent form submission from reloading Obsidian
		event.preventDefault();
		event.stopPropagation();

		const nameInput = this.#nameInput;
		assert(nameInput, "Name input element should be defined");

		const name = nameInput.getValue();

		this.timekeep.setState((timekeep) => {
			const currentTime = moment();
			const entries = startNewEntry(name, currentTime, timekeep.entries);

			// Reset name input
			nameInput.resetValue();

			return {
				...timekeep,
				entries,
			};
		});
	}
}
