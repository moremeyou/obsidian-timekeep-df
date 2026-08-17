import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";
import { formatPercentOfDay } from "@/utils/time";

import { DomComponent } from "@/components/DomComponent";

import { getEntryDuration, isEntryRunning } from "@/timekeep/queries";
import type { TimeEntry } from "@/timekeep/schema";
import {
	createTimekeepViewState,
	getTimekeepViewCapacityHours,
	getTimekeepViewWindow,
	type TimekeepViewState,
} from "@/timekeep/view";

/** Renders an entry's exact duration as a percentage of daily capacity. */
export class TimesheetEntryPercent extends DomComponent {
	entry: TimeEntry;
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	constructor(
		containerEl: HTMLElement,
		entry: TimeEntry,
		settings: Store<TimekeepSettings>,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);
		this.entry = entry;
		this.settings = settings;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
	}

	onload(): void {
		super.onload();
		this.wrapperEl = this.containerEl.createSpan({ cls: "timekeep-df-time" });

		const update = this.update.bind(this);
		this.register(this.settings.subscribe(update));
		this.register(this.viewState.subscribe(update));
		update();

		if (isEntryRunning(this.entry)) {
			this.registerInterval(window.setInterval(update, 1000));
		}
	}

	update(): void {
		assert(this.wrapperEl, "Percentage element should be defined");
		const viewState = this.viewState.getState();
		const settings = this.settings.getState();
		const duration = getEntryDuration(this.entry, moment(), getTimekeepViewWindow(viewState));
		this.wrapperEl.textContent = formatPercentOfDay(
			duration,
			getTimekeepViewCapacityHours(
				viewState,
				settings.totalDailyWorkingHours,
				settings.totalDaysPerWeek
			)
		);
	}
}
