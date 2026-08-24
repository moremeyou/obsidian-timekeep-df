import moment from "moment";
import { Notice } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";
import { formatDuration, formatDurationClock, formatPercentOfDay } from "@/utils/time";

import { TimesheetTimer } from "./TimesheetTimer";

import { DomComponent } from "@/components/DomComponent";

import { endAutomaticBreakAtWorkingHoursEnd } from "@/timekeep/automaticBreaks";
import {
	getEntryDuration,
	getEntryById,
	getRunningEntry,
	getTotalDuration,
	isKeepRunning,
} from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import {
	createTimekeepViewState,
	getTimekeepViewCapacityHours,
	getTimekeepViewWindow,
	TimekeepCounterView,
	TimekeepViewMode,
	type TimekeepViewState,
} from "@/timekeep/view";

function formatRangeTotal(settings: TimekeepSettings, total: number): string {
	return total <= 0 ? "0.0h" : formatDuration(settings.primaryDurationFormat, total);
}

/**
 * Component for rendering the two live updating timers at the top of the
 * time keep block
 */
export class TimesheetCounters extends DomComponent {
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	/** Timer for the selected calendar period total. */
	totalTimer: TimesheetTimer | undefined;
	/** Live duration for the currently running Activity or Block. */
	durationTimer: TimesheetTimer | undefined;

	/** Currently tracked background interval for content */
	currentContentInterval: number | undefined;
	/** Whether excluding Breaks changes the currently formatted range total. */
	#breakToggleAvailable = false;
	/** Whether a running Activity is available for the percentage view. */
	#currentActivityAvailable = false;

	constructor(
		containerEl: HTMLElement,
		settings: Store<TimekeepSettings>,
		timekeep: Store<Timekeep>,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.settings = settings;
		this.timekeep = timekeep;
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
	}

	onload(): void {
		super.onload();

		const wrapperEl = this.containerEl.createDiv({
			cls: "timekeep-df-timers",
		});
		wrapperEl.role = "button";
		wrapperEl.tabIndex = 0;
		this.wrapperEl = wrapperEl;
		this.registerDomEvent(wrapperEl, "click", this.onCycleCounterView.bind(this));
		this.registerDomEvent(wrapperEl, "keydown", this.onToggleKeyDown.bind(this));

		this.durationTimer = new TimesheetTimer(wrapperEl, "Duration");
		this.totalTimer = new TimesheetTimer(wrapperEl, "Day total");

		this.addChild(this.durationTimer);
		this.addChild(this.totalTimer);

		const onUpdate = this.onUpdate.bind(this);

		this.register(this.timekeep.subscribe(onUpdate));
		this.register(this.settings.subscribe(onUpdate));
		this.register(this.viewState.subscribe(onUpdate));

		onUpdate();
	}

	/**
	 * Handles an update to either the timekeep content or the
	 * settings to update the timers data and decide whether to
	 * schedule background tasks to update timers
	 */
	onUpdate() {
		// Initial update
		this.updateTimers();

		if (this.currentContentInterval) {
			clearInterval(this.currentContentInterval);
		}

		// Only schedule further updates if we are running
		const timekeep = this.timekeep.getState();
		if (isKeepRunning(timekeep)) {
			const intervalID = window.setInterval(this.updateTimers.bind(this), 1000);

			this.currentContentInterval = intervalID;
			this.registerInterval(intervalID);
		}
	}

	/**
	 * Updates the values of the timers using the current elapsed time
	 */
	updateTimers() {
		assert(
			this.durationTimer && this.totalTimer && this.wrapperEl,
			"Counter elements must be defined for updateTimers"
		);

		const timekeep = this.timekeep.getState();
		const settings = this.settings.getState();

		const currentTime = moment();
		const cappedTimekeep = endAutomaticBreakAtWorkingHoursEnd(timekeep, currentTime, settings);
		if (cappedTimekeep !== timekeep) {
			this.timekeep.setState(cappedTimekeep);
			return;
		}
		const runningEntry = getRunningEntry(timekeep.entries);
		const state = this.viewState.getState();
		const window = getTimekeepViewWindow(state);
		const counterView =
			state.counterView ??
			(state.includeBreaksInTotal === false
				? TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS
				: TimekeepCounterView.RANGE_TOTAL_WITH_BREAKS);
		const includeBreaks = counterView !== TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS;
		const breakDisplayName = settings.automaticBreakName.trim() || "Break";
		const breakName = breakDisplayName.toLocaleLowerCase();
		const entriesWithoutBreaks = timekeep.entries.filter(
			(entry) => entry.name.trim().toLocaleLowerCase() !== breakName
		);
		const totalIncludingBreaks = getTotalDuration(timekeep.entries, currentTime, window);
		const totalExcludingBreaks = getTotalDuration(entriesWithoutBreaks, currentTime, window);
		const total = includeBreaks ? totalIncludingBreaks : totalExcludingBreaks;
		this.#breakToggleAvailable =
			formatRangeTotal(settings, totalIncludingBreaks) !==
			formatRangeTotal(settings, totalExcludingBreaks);
		const viewModeLabel: Record<TimekeepViewMode, string> = {
			[TimekeepViewMode.DAY]: "Day total",
			[TimekeepViewMode.WEEK]: "Week total",
			[TimekeepViewMode.MONTH]: "Month total",
			[TimekeepViewMode.QUARTER]: "Quarter total",
			[TimekeepViewMode.YEAR]: "Year total",
		};

		const totalLabel = viewModeLabel[state.mode];
		const rangeName = state.mode.charAt(0) + state.mode.slice(1).toLocaleLowerCase();
		const currentActivity = runningEntry
			? timekeep.entries.find(
					(activity) => getEntryById(runningEntry.id, [activity]) !== undefined
				)
			: undefined;
		this.#currentActivityAvailable = currentActivity !== undefined;
		this.durationTimer.setLabel("Duration");
		this.durationTimer.setValues(
			formatDurationClock(runningEntry ? getEntryDuration(runningEntry, currentTime) : 0),
			""
		);
		if (counterView === TimekeepCounterView.CURRENT_ACTIVITY_PERCENT) {
			const capacityHours = getTimekeepViewCapacityHours(
				state,
				settings.totalDailyWorkingHours,
				settings.totalDaysPerWeek
			);
			this.totalTimer.setLabel(`${rangeName} %`);
			this.totalTimer.setValues(
				currentActivity
					? formatPercentOfDay(
							getEntryDuration(currentActivity, currentTime, window),
							capacityHours
						)
					: "—",
				""
			);
		} else {
			this.totalTimer.setLabel(totalLabel);
			this.totalTimer.setValues(formatRangeTotal(settings, total), "");
		}
		const currentDescription =
			counterView === TimekeepCounterView.CURRENT_ACTIVITY_PERCENT
				? this.#currentActivityAvailable
					? `Current Activity percentage of ${rangeName} capacity.`
					: `No current Activity is available for ${rangeName} percentage.`
				: includeBreaks
					? `${totalLabel} includes ${breakDisplayName}.`
					: `${totalLabel} excludes ${breakDisplayName}.`;
		const nextDescription =
			counterView === TimekeepCounterView.CURRENT_ACTIVITY_PERCENT
				? `Tap to include ${breakDisplayName} in ${totalLabel.toLocaleLowerCase()}.`
				: counterView === TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS ||
					  !this.#breakToggleAvailable
					? `Tap for current Activity percentage.`
					: `Tap to exclude ${breakDisplayName}.`;
		this.wrapperEl.setAttribute("aria-label", `${currentDescription} ${nextDescription}`);
		this.wrapperEl.setAttribute("aria-disabled", "false");
		if (counterView === TimekeepCounterView.CURRENT_ACTIVITY_PERCENT)
			this.wrapperEl.removeAttribute("aria-pressed");
		else this.wrapperEl.setAttribute("aria-pressed", String(!includeBreaks));
		this.wrapperEl.setAttribute("data-breaks-included", String(includeBreaks));
		this.wrapperEl.setAttribute("data-counter-view", counterView);
		this.wrapperEl.setAttribute(
			"data-break-toggle-available",
			String(this.#breakToggleAvailable)
		);
		this.wrapperEl.title = `${currentDescription} ${nextDescription}`;
		const capacityMS =
			getTimekeepViewCapacityHours(
				this.viewState.getState(),
				settings.totalDailyWorkingHours,
				settings.totalDaysPerWeek
			) *
			60 *
			60 *
			1000;
		const capacityState = total <= 0 ? "empty" : total > capacityMS ? "over" : "within";
		this.totalTimer.setCapacityState(capacityState);
		this.wrapperEl.setAttribute("data-capacity-state", capacityState);
	}

	onCycleCounterView() {
		const state = this.viewState.getState();
		const currentView =
			state.counterView ??
			(state.includeBreaksInTotal === false
				? TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS
				: TimekeepCounterView.RANGE_TOTAL_WITH_BREAKS);
		const nextView =
			currentView === TimekeepCounterView.CURRENT_ACTIVITY_PERCENT
				? TimekeepCounterView.RANGE_TOTAL_WITH_BREAKS
				: currentView === TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS ||
					  !this.#breakToggleAvailable
					? TimekeepCounterView.CURRENT_ACTIVITY_PERCENT
					: TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS;
		const includeBreaks = nextView !== TimekeepCounterView.RANGE_TOTAL_WITHOUT_BREAKS;
		this.viewState.setState({
			...state,
			counterView: nextView,
			includeBreaksInTotal: includeBreaks,
		});
		const range = state.mode.toLocaleLowerCase();
		if (nextView === TimekeepCounterView.CURRENT_ACTIVITY_PERCENT) {
			new Notice(
				this.#currentActivityAvailable
					? `Now showing the current Activity's percentage of ${range} capacity.`
					: `No current Activity is running; ${range} percentage is unavailable.`
			);
		} else {
			new Notice(
				`Now showing total ${range} hours ${includeBreaks ? "including" : "excluding"} breaks.`
			);
		}
	}

	onToggleKeyDown(event: KeyboardEvent) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		this.onCycleCounterView();
	}
}
