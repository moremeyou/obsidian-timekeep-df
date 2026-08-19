import moment from "moment";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { ReplaceableComponent } from "@/components/ReplaceableComponent";

import { isAfterWorkingHours } from "@/timekeep/automaticBreaks";
import { getTotalDuration } from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import {
	getTimekeepViewCapacityHours,
	getTimekeepViewWindow,
	type TimekeepViewState,
} from "@/timekeep/view";

/** Stable empty state for the primary current-work card. */
export class TimesheetRunningEntryEmpty extends ReplaceableComponent {
	timekeep: Store<Timekeep>;
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	#messageEl: HTMLSpanElement | undefined;

	constructor(
		containerEl: HTMLElement,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		viewState: Store<TimekeepViewState>
	) {
		super(containerEl);
		this.timekeep = timekeep;
		this.settings = settings;
		this.viewState = viewState;
	}

	createContainer(): HTMLElement {
		return createDiv({
			cls: ["timekeep-df-current-activity", "timekeep-df-current-activity--empty"],
		});
	}

	render(wrapperEl: HTMLElement): void {
		this.#messageEl = wrapperEl.createSpan({
			cls: "timekeep-df-current-activity__empty-message",
			attr: { role: "heading", "aria-level": "3" },
		});

		const onUpdate = this.onUpdate.bind(this);
		this.register(this.timekeep.subscribe(onUpdate));
		this.register(this.settings.subscribe(onUpdate));
		this.register(this.viewState.subscribe(onUpdate));
		this.registerInterval(window.setInterval(onUpdate, 30_000));
		onUpdate();
	}

	onUpdate(): void {
		if (!this.#messageEl) return;
		const currentTime = moment();
		const settings = this.settings.getState();
		const viewState = this.viewState.getState();
		const total = getTotalDuration(
			this.timekeep.getState().entries,
			currentTime,
			getTimekeepViewWindow(viewState)
		);
		const capacityMilliseconds =
			getTimekeepViewCapacityHours(
				viewState,
				settings.totalDailyWorkingHours,
				settings.totalDaysPerWeek
			) *
			60 *
			60 *
			1000;

		const capacityReached = capacityMilliseconds > 0 && total >= capacityMilliseconds;
		this.#messageEl.textContent =
			capacityReached || isAfterWorkingHours(currentTime, settings)
				? "Stop working!"
				: "Get to work!";
	}
}
