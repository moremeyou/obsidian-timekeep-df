import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";

import { TimesheetRunningEntryEditing } from "./TimesheetRunningEntryEditing";
import { TimesheetRunningEntryEmpty } from "./TimesheetRunningEntryEmpty";
import { TimesheetRunningEntryViewing } from "./TimesheetRunningEntryViewing";

import { ContentComponent } from "@/components/ContentComponent";

import { getRunningEntry } from "@/timekeep/queries";
import type { Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

export class TimesheetRunningEntry extends ContentComponent<
	TimesheetRunningEntryViewing | TimesheetRunningEntryEditing | TimesheetRunningEntryEmpty
> {
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	constructor(
		containerEl: HTMLElement,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.timekeep = timekeep;
		this.settings = settings;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
	}

	onload(): void {
		super.onload();

		const onUpdate = this.onUpdate.bind(this);
		this.register(this.timekeep.subscribe(onUpdate));
		onUpdate();
	}

	onUpdate() {
		if (this.getContent() instanceof TimesheetRunningEntryEditing) {
			this.setEditingView();
			return;
		}

		this.setCurrentView();
	}

	/**
	 * Switch to the editing view
	 */
	setEditingView() {
		const contentEl = this.containerEl;
		assert(contentEl, "Content element should be defined");

		const timekeep = this.timekeep.getState();
		const currentEntry = getRunningEntry(timekeep.entries);
		if (!currentEntry) {
			this.setContent(
				new TimesheetRunningEntryEmpty(
					contentEl,
					this.timekeep,
					this.settings,
					this.viewState
				)
			);
			return;
		}

		this.setContent(
			new TimesheetRunningEntryEditing(
				contentEl,
				this.timekeep,
				this.settings,
				currentEntry.name,
				this.setCurrentView.bind(this)
			)
		);
	}

	/**
	 * Switch to the default creation view
	 */
	setCurrentView() {
		const contentEl = this.containerEl;
		assert(contentEl, "Content element should be defined");

		const timekeep = this.timekeep.getState();
		const currentEntry = getRunningEntry(timekeep.entries);
		if (!currentEntry) {
			this.setContent(
				new TimesheetRunningEntryEmpty(
					contentEl,
					this.timekeep,
					this.settings,
					this.viewState
				)
			);
			return;
		}

		this.setContent(
			new TimesheetRunningEntryViewing(
				contentEl,
				this.timekeep,
				this.settings,
				currentEntry,
				this.setEditingView.bind(this),
				this.viewState
			)
		);
	}
}
