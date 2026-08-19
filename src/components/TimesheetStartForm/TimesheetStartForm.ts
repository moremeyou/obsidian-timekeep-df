import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";

import { DomComponent } from "@/components/DomComponent";
import { createObsidianIcon } from "@/components/obsidianIcon";
import { TimesheetNameInput } from "@/components/TimesheetNameInput";

import { prepareHistoricalActivityDraft, type HistoricalActivityDraft } from "@/timekeep/draft";
import { getRunningEntry } from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import { startActivity } from "@/timekeep/start";
import {
	createTimekeepViewState,
	timekeepViewIncludesCurrent,
	type TimekeepViewState,
} from "@/timekeep/view";

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
	/** Selected calendar range controlling whether Add also starts a timer. */
	viewState: Store<TimekeepViewState>;
	/** Historical interval selected for immediate editing. */
	historicalDraft: Store<HistoricalActivityDraft | null>;

	/** Name input for starting entries */
	#nameInput: TimesheetNameInput | undefined;

	/** Start button element */
	#startButtonEl: HTMLButtonElement | undefined;

	constructor(
		containerEl: HTMLElement,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		autocomplete: TimekeepAutocomplete,
		viewState?: Store<TimekeepViewState>,
		historicalDraft?: Store<HistoricalActivityDraft | null>
	) {
		super(containerEl);
		this.timekeep = timekeep;
		this.settings = settings;
		this.autocomplete = autocomplete;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
		this.historicalDraft = historicalDraft ?? createStore<HistoricalActivityDraft | null>(null);
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

		const currentTime = moment();
		const isCurrentRange = timekeepViewIncludesCurrent(this.viewState.getState(), currentTime);

		if (!isCurrentRange) {
			const timekeep = this.timekeep.getState();
			const selectedDateTime = moment(
				this.viewState.getState().anchorDate,
				"YYYY-MM-DD",
				true
			)
				.hour(currentTime.hour())
				.minute(currentTime.minute())
				.startOf("minute");
			const prepared = prepareHistoricalActivityDraft(
				timekeep.entries,
				name,
				this.autocomplete.names.getState(),
				selectedDateTime
			);
			this.historicalDraft.setState(prepared.draft);
			this.timekeep.setState({ ...timekeep, entries: prepared.entries });
			nameInput.resetValue();
			return;
		}

		this.timekeep.setState((timekeep) => {
			const entries = startActivity(name, currentTime, timekeep.entries);

			// Reset name input
			nameInput.resetValue();

			return {
				...timekeep,
				entries,
			};
		});
	}
}
