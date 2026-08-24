import type { App } from "obsidian";

import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";
import { formatRowTime } from "@/utils/time";

import { createObsidianIcon } from "@/components/obsidianIcon";
import { ReplaceableComponent } from "@/components/ReplaceableComponent";
import { TimesheetEntryDuration } from "@/components/TimesheetEntryDuration";
import { TimesheetEntryName } from "@/components/TimesheetEntryName";
import { TimesheetEntryPercent } from "@/components/TimesheetEntryPercent";

import { stopTimekeepWithAutomaticBreak } from "@/timekeep/automaticBreaks";
import { prepareHistoricalBlockDraft, type HistoricalActivityDraft } from "@/timekeep/draft";
import {
	getEntryById,
	getEntryTimeBounds,
	getRunningEntry,
	isEntryRunning,
} from "@/timekeep/queries";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { startNewNestedEntry } from "@/timekeep/start";
import { setEntryCollapsed, updateEntry } from "@/timekeep/update";
import {
	createTimekeepViewState,
	formatBlockNameForView,
	getTimekeepViewWindow,
	timekeepViewIncludesCurrent,
	type TimekeepViewState,
} from "@/timekeep/view";

/**
 * Component for the contents of a timesheet row
 */
export class TimesheetRowContent extends ReplaceableComponent {
	/** Access to the app instance */
	app: App;
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;
	historicalDraft: Store<HistoricalActivityDraft | null>;
	/** Top-level Activity that owns this row. */
	activityId: number;

	/** The entry for this row */
	entry: TimeEntry;
	/** Indentation level for the entry */
	indent: number;

	/** Element for displaying the start time */
	#startTimeEl: HTMLSpanElement | undefined;
	/** Element for displaying the end time */
	#endTimeEl: HTMLSpanElement | undefined;
	/** Start/stop control whose availability follows the selected view. */
	#startStopButtonEl: HTMLButtonElement | undefined;

	/** Callback to begin editing the row */
	onBeginEditing: VoidFunction;

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		entry: TimeEntry,
		indent: number,
		onBeginEditing: VoidFunction,
		viewState?: Store<TimekeepViewState>,
		historicalDraft?: Store<HistoricalActivityDraft | null>,
		activityId?: number
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;
		const initialSettings = settings.getState();
		this.viewState =
			viewState ??
			createStore(
				createTimekeepViewState(
					initialSettings.defaultViewMode,
					undefined,
					initialSettings.defaultCounterView
				)
			);
		this.historicalDraft = historicalDraft ?? createStore<HistoricalActivityDraft | null>(null);
		this.activityId = activityId ?? entry.id;

		this.entry = entry;
		this.indent = indent;

		this.onBeginEditing = onBeginEditing;
	}

	createContainer(): HTMLElement {
		return createEl("tr", { cls: "timekeep-df-row" });
	}

	render(wrapperEl: HTMLElement): void {
		const entry = this.entry;
		const settings = this.settings.getState();
		const displayName =
			this.indent > 0 && settings.appendBlockContext
				? formatBlockNameForView(entry, this.viewState.getState().mode)
				: entry.name;
		const startStopColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--actions"],
		});

		const startStopWrapper = startStopColEl.createDiv({ cls: "timekeep-df-actions-wrapper" });

		const startButton = startStopWrapper.createEl("button", {
			cls: ["timekeep-df-action", "timekeep-df-icon-button"],
		});
		startButton.type = "button";
		this.#startStopButtonEl = startButton;
		this.registerDomEvent(startButton, "click", this.onClickPrimaryAction.bind(this));

		const nameColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--name"],
		});
		nameColEl.style.paddingLeft = `${(this.indent + 1) * 15}px`;

		const nameEl = nameColEl.createSpan({
			cls: "timekeep-df-entry-name",
			title: displayName,
		});

		if (entry.subEntries !== null) {
			this.registerDomEvent(nameEl, "click", this.onToggleCollapsed.bind(this));
		}

		if (entry.subEntries !== null && entry.folder) {
			createObsidianIcon(nameEl, "folder", "timekeep-df-folder-icon");
		}

		const name = new TimesheetEntryName(nameEl, this.app, displayName);
		this.addChild(name);

		if (entry.subEntries !== null) {
			createObsidianIcon(
				nameEl,
				entry.collapsed ? "chevron-down" : "chevron-up",
				"timekeep-df-collapse-icon"
			);
		}

		const durationColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--duration"],
		});

		const duration = new TimesheetEntryDuration(durationColEl, entry, this.viewState);

		this.addChild(duration);

		const percentColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--percent"],
		});
		this.addChild(
			new TimesheetEntryPercent(percentColEl, entry, this.settings, this.viewState)
		);

		const startTimeColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--time"],
		});
		const startTimeEl = startTimeColEl.createSpan({ cls: "timekeep-df-time" });
		this.#startTimeEl = startTimeEl;

		const endTimeColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--time"],
		});
		const endTimeEl = endTimeColEl.createSpan({ cls: "timekeep-df-time" });
		this.#endTimeEl = endTimeEl;

		const editColEl = wrapperEl.createEl("td", {
			cls: ["timekeep-df-col", "timekeep-df-col--actions"],
		});
		const editWrapper = editColEl.createDiv({ cls: "timekeep-df-actions-wrapper" });
		const editButton = editWrapper.createEl("button", {
			cls: ["timekeep-df-action", "timekeep-df-icon-button"],
			title: "Edit",
			attr: {
				"aria-label": "Edit",
				"data-action": "edit",
			},
		});
		editButton.type = "button";
		createObsidianIcon(editButton, "edit", "timekeep-df-button-icon");
		this.registerDomEvent(editButton, "click", this.onBeginEditing);

		this.updateTimes();
		this.updateState();

		const unsubscribeSettings = this.settings.subscribe(this.updateTimes.bind(this));
		const unsubscribeViewState = this.viewState.subscribe(this.updateState.bind(this));

		this.register(unsubscribeSettings);
		this.register(unsubscribeViewState);
		if (isEntryRunning(entry)) {
			this.registerInterval(window.setInterval(this.updateTimes.bind(this), 1000));
		}
	}

	updateTimes() {
		assert(this.#startTimeEl && this.#endTimeEl, "Time elements should be defined");

		const entry = this.entry;
		const settings = this.settings.getState();
		const bounds = getEntryTimeBounds(
			entry,
			moment(),
			getTimekeepViewWindow(this.viewState.getState())
		);

		this.#startTimeEl.textContent = bounds.startTime
			? formatRowTime(bounds.startTime, settings)
			: "";

		this.#endTimeEl.textContent = bounds.endTime ? formatRowTime(bounds.endTime, settings) : "";
	}

	updateState() {
		assert(this.wrapperEl && this.#startStopButtonEl, "Row elements should be defined");

		const entry = this.entry;

		const isSelfRunning = entry.subEntries === null && isEntryRunning(entry);

		const isRunningWithin =
			entry.subEntries !== null && getRunningEntry(entry.subEntries) !== null;

		const isInvalidEntry =
			entry.startTime !== null &&
			entry.endTime !== null &&
			entry.endTime.isBefore(entry.startTime);

		const rowEl = this.wrapperEl;
		rowEl.setAttribute("data-running", String(isSelfRunning));
		rowEl.setAttribute("data-running-within", String(isRunningWithin));
		rowEl.setAttribute("data-sub-entries", String(this.entry.subEntries !== null));
		rowEl.setAttribute("data-invalid", String(isInvalidEntry));

		const canControlTimer = timekeepViewIncludesCurrent(this.viewState.getState(), moment());
		const isRunning = isEntryRunning(entry);
		const title = canControlTimer ? (isRunning ? "Stop" : "Start") : "Add Block";
		const action = canControlTimer ? (isRunning ? "stop" : "start") : "add-block";
		const icon = canControlTimer ? (isRunning ? "stop-circle" : "play") : "plus";

		this.#startStopButtonEl.title = title;
		this.#startStopButtonEl.setAttribute("aria-label", title);
		this.#startStopButtonEl.setAttribute("data-action", action);
		this.#startStopButtonEl.disabled = false;
		this.#startStopButtonEl.setAttribute("aria-disabled", "false");
		this.#startStopButtonEl.empty();
		createObsidianIcon(this.#startStopButtonEl, icon, "timekeep-df-button-icon");
	}

	onClickPrimaryAction() {
		if (!timekeepViewIncludesCurrent(this.viewState.getState(), moment())) {
			this.onClickAddHistoricalBlock();
			return;
		}
		if (isEntryRunning(this.entry)) this.onClickStop();
		else this.onClickStart();
	}

	onClickAddHistoricalBlock() {
		const currentTime = moment();
		if (timekeepViewIncludesCurrent(this.viewState.getState(), currentTime)) return;
		const initialTime = moment(this.viewState.getState().anchorDate, "YYYY-MM-DD", true)
			.hour(currentTime.hour())
			.minute(currentTime.minute())
			.startOf("minute");

		const timekeep = this.timekeep.getState();
		const prepared = prepareHistoricalBlockDraft(
			timekeep.entries,
			this.activityId,
			initialTime
		);
		if (!prepared) return;
		this.historicalDraft.setState(prepared.draft);
		this.timekeep.setState({ ...timekeep, entries: prepared.entries });
	}

	onToggleCollapsed() {
		const entry = this.entry;
		assert(
			entry.subEntries !== null,
			"Expected collapse toggling to only be possible on entries with subEntries"
		);

		this.timekeep.setState((timekeep) => {
			const storedEntry = getEntryById(entry.id, timekeep.entries) ?? entry;
			const newEntry = setEntryCollapsed(storedEntry, !storedEntry.collapsed);
			const entries = updateEntry(timekeep.entries, entry.id, newEntry);
			return { ...timekeep, entries };
		});
	}

	onClickStart() {
		if (!timekeepViewIncludesCurrent(this.viewState.getState(), moment())) return;
		const entry = this.entry;

		this.timekeep.setState((timekeep) => {
			const currentTime = moment();
			const entries = startNewNestedEntry(currentTime, entry.id, timekeep.entries);
			return { ...timekeep, entries };
		});
	}

	onClickStop() {
		if (!timekeepViewIncludesCurrent(this.viewState.getState(), moment())) return;
		this.timekeep.setState((timekeep) =>
			stopTimekeepWithAutomaticBreak(timekeep, moment(), this.settings.getState())
		);
	}
}
