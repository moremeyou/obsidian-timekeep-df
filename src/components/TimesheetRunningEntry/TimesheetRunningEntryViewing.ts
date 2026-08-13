import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";

import { ReplaceableComponent } from "../ReplaceableComponent";

import { createObsidianIcon } from "@/components/obsidianIcon";

import { getPathToEntry, getRunningEntry } from "@/timekeep/queries";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { stopTimekeep } from "@/timekeep/update";
import {
	createTimekeepViewState,
	timekeepViewIncludesCurrent,
	type TimekeepViewState,
} from "@/timekeep/view";

/**
 * The "Running" timer section of the timesheet start are
 */
export class TimesheetRunningEntryViewing extends ReplaceableComponent {
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	/** Element to display the top-level Activity name. */
	#activityNameEl: HTMLSpanElement | undefined;
	/** Element wrapping Block context, hidden for top-level sessions. */
	#blockContextEl: HTMLDivElement | undefined;
	/** Element to render the active Block path within. */
	#blockPathEl: HTMLSpanElement | undefined;
	/** Stop control whose availability follows the selected range. */
	#stopButtonEl: HTMLButtonElement | undefined;

	/** The current running entry */
	entry: TimeEntry;

	/** Callback to start editing the current entry */
	onStartEditing: VoidFunction;

	constructor(
		containerEl: HTMLElement,

		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,

		entry: TimeEntry,

		onStartEditing: VoidFunction,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.timekeep = timekeep;
		this.settings = settings;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));

		this.entry = entry;
		this.onStartEditing = onStartEditing;
	}

	createContainer(): HTMLElement {
		return createEl("form", {
			cls: "timekeep-df-current-activity",
			attr: {
				"data-area": "running",
			},
		});
	}

	render(formEl: HTMLElement): void {
		this.registerDomEvent(formEl, "submit", this.onStop.bind(this));

		const identityEl = formEl.createDiv({ cls: "timekeep-df-current-activity__identity" });
		identityEl.createSpan({
			cls: "timekeep-df-current-activity__eyebrow",
			text: "Current Activity",
		});
		const activityNameEl = identityEl.createSpan({
			cls: "timekeep-df-current-activity__name",
			attr: { role: "heading", "aria-level": "3" },
		});
		this.#activityNameEl = activityNameEl;

		const blockContextEl = identityEl.createDiv({
			cls: "timekeep-df-current-activity__block",
		});
		const blockPathEl = blockContextEl.createSpan({
			cls: "timekeep-df-current-activity__block-path",
		});
		this.#blockContextEl = blockContextEl;
		this.#blockPathEl = blockPathEl;

		const actionsEl = formEl.createDiv({ cls: "timekeep-df-current-activity__actions" });

		const stopButton = actionsEl.createEl("button", {
			cls: ["timekeep-df-start", "timekeep-df-start--stop", "timekeep-df-icon-button"],
			title: "Stop",
			attr: { "aria-label": "Stop current Activity" },
		});
		stopButton.type = "submit";
		this.#stopButtonEl = stopButton;
		createObsidianIcon(stopButton, "stop-circle", "timekeep-df-button-icon");

		const onUpdate = this.onUpdate.bind(this);

		this.register(this.timekeep.subscribe(onUpdate));
		this.register(this.viewState.subscribe(onUpdate));

		onUpdate();
	}

	/**
	 * Handles updates that occur when either the timekeep data changes
	 * or the settings change
	 */
	onUpdate() {
		const activityNameEl = this.#activityNameEl;
		const blockContextEl = this.#blockContextEl;
		const blockPathEl = this.#blockPathEl;
		const stopButtonEl = this.#stopButtonEl;

		assert(
			activityNameEl && blockContextEl && blockPathEl && stopButtonEl,
			"Current Activity elements should be defined"
		);

		const timekeep = this.timekeep.getState();
		const currentEntry = getRunningEntry(timekeep.entries) ?? this.entry;
		if (!currentEntry.startTime) return;

		const pathToEntry = getPathToEntry(timekeep.entries, currentEntry);
		assert(pathToEntry, "Entry path should exist");
		activityNameEl.textContent = pathToEntry[0].name;
		const blockPath = pathToEntry.slice(1).map((path) => path.name);
		blockContextEl.hidden = blockPath.length === 0;
		blockPathEl.textContent = blockPath.join(" › ");

		const canControlTimer = timekeepViewIncludesCurrent(this.viewState.getState(), moment());
		stopButtonEl.disabled = !canControlTimer;
		stopButtonEl.setAttribute("aria-disabled", String(!canControlTimer));
		stopButtonEl.title = canControlTimer
			? "Stop"
			: "Stop is unavailable outside the current range";
	}

	onStop(event: Event) {
		// Prevent form submission from reloading Obsidian
		event.preventDefault();
		event.stopPropagation();
		if (!timekeepViewIncludesCurrent(this.viewState.getState(), moment())) return;

		this.timekeep.setState((timekeep) => {
			const currentTime = moment();
			return stopTimekeep(timekeep, currentTime);
		});
	}
}
