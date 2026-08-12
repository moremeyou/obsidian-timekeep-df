import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";
import { formatDuration } from "@/utils/time";

import { TimesheetTimer } from "./TimesheetTimer";

import { DomComponent } from "@/components/DomComponent";

import {
	getEntryDuration,
	getRunningEntry,
	getTotalDuration,
	isKeepRunning,
} from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import {
	createTimekeepViewState,
	getTimekeepViewWindow,
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

	/** Timer for the current entry */
	currentTimer: TimesheetTimer | undefined;
	/** Timer for the total time */
	totalTimer: TimesheetTimer | undefined;

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
		this.wrapperEl = wrapperEl;

		this.currentTimer = new TimesheetTimer(wrapperEl, "Current");
		this.totalTimer = new TimesheetTimer(wrapperEl, "Total");

		this.addChild(this.currentTimer);
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
		assert(this.currentTimer && this.totalTimer, "Timers must be defined for updateTimers");

		const timekeep = this.timekeep.getState();
		const settings = this.settings.getState();

		const currentTime = moment();
		const window = getTimekeepViewWindow(this.viewState.getState());
		const total = getTotalDuration(timekeep.entries, currentTime, window);
		const runningEntry = getRunningEntry(timekeep.entries);
		const current = runningEntry ? getEntryDuration(runningEntry, currentTime, window) : 0;

		this.currentTimer.setHidden(runningEntry === null || current === 0);
		this.currentTimer.setValues(
			formatDuration(settings.primaryDurationFormat, current),
			formatDuration(settings.secondaryDurationFormat, current)
		);

		this.totalTimer.setValues(
			formatDuration(settings.primaryDurationFormat, total),
			formatDuration(settings.secondaryDurationFormat, total)
		);
	}
}
