import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";
import { formatDuration, formatDurationClock } from "@/utils/time";

import { TimesheetTimer } from "./TimesheetTimer";

import { DomComponent } from "@/components/DomComponent";

import { endAutomaticBreakAtWorkingHoursEnd } from "@/timekeep/automaticBreaks";
import {
	getEntryDuration,
	getRunningEntry,
	getTotalDuration,
	isKeepRunning,
} from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import {
	createTimekeepViewState,
	getTimekeepViewCapacityHours,
	getTimekeepViewWindow,
	TimekeepViewMode,
	type TimekeepViewState,
} from "@/timekeep/view";

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

	constructor(
		containerEl: HTMLElement,
		settings: Store<TimekeepSettings>,
		timekeep: Store<Timekeep>,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.settings = settings;
		this.timekeep = timekeep;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
	}

	onload(): void {
		super.onload();

		const wrapperEl = this.containerEl.createDiv({
			cls: "timekeep-df-timers",
		});
		wrapperEl.role = "button";
		wrapperEl.tabIndex = 0;
		this.wrapperEl = wrapperEl;
		this.registerDomEvent(wrapperEl, "click", this.onToggleBreaksInTotal.bind(this));
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
		this.durationTimer.setValues(
			formatDurationClock(runningEntry ? getEntryDuration(runningEntry, currentTime) : 0),
			""
		);
		const state = this.viewState.getState();
		const window = getTimekeepViewWindow(state);
		const includeBreaks = state.includeBreaksInTotal !== false;
		const breakDisplayName = settings.automaticBreakName.trim() || "Break";
		const breakName = breakDisplayName.toLocaleLowerCase();
		const totalEntries = includeBreaks
			? timekeep.entries
			: timekeep.entries.filter(
					(entry) => entry.name.trim().toLocaleLowerCase() !== breakName
				);
		const total = getTotalDuration(totalEntries, currentTime, window);
		const viewModeLabel: Record<TimekeepViewMode, string> = {
			[TimekeepViewMode.DAY]: "Day total",
			[TimekeepViewMode.WEEK]: "Week total",
			[TimekeepViewMode.MONTH]: "Month total",
			[TimekeepViewMode.QUARTER]: "Quarter total",
			[TimekeepViewMode.YEAR]: "Year total",
		};

		const totalLabel = viewModeLabel[state.mode];
		this.totalTimer.setLabel(totalLabel);
		this.totalTimer.setValues(
			total <= 0 ? "0.0h" : formatDuration(settings.primaryDurationFormat, total),
			""
		);
		const toggleDescription = includeBreaks
			? `${totalLabel} includes ${breakDisplayName}. Tap to exclude it.`
			: `${totalLabel} excludes ${breakDisplayName}. Tap to include it.`;
		this.wrapperEl.setAttribute("aria-label", toggleDescription);
		this.wrapperEl.setAttribute("aria-pressed", String(!includeBreaks));
		this.wrapperEl.setAttribute("data-breaks-included", String(includeBreaks));
		this.wrapperEl.title = toggleDescription;
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

	onToggleBreaksInTotal() {
		this.viewState.setState((state) => ({
			...state,
			includeBreaksInTotal: state.includeBreaksInTotal === false,
		}));
	}

	onToggleKeyDown(event: KeyboardEvent) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		this.onToggleBreaksInTotal();
	}
}
