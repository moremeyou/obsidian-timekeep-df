import type { App } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";

import { TimesheetRowContent } from "./TimesheetRowContent";
import { TimesheetRowContentEditing } from "./TimesheetRowContentEditing";

import { ContentComponent } from "@/components/ContentComponent";

import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

export interface TimesheetRowPresentation {
	groupTone?: "odd" | "even";
	groupPosition?: "start" | "middle" | "end";
}

/**
 * This container allows a entry to switch between the default and
 * editable views without re-rendering the entire table or having a
 * large single component
 */
export class TimesheetRow extends ContentComponent<
	TimesheetRowContent | TimesheetRowContentEditing
> {
	/** Access to the app instance */
	app: App;
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	/** The entry for this row */
	entry: TimeEntry;
	/** Indentation level for the entry */
	indent: number;
	/** Derived visual grouping; never persisted in tracker data. */
	presentation: TimesheetRowPresentation;

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		entry: TimeEntry,
		indent: number,
		presentation: TimesheetRowPresentation = {},
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));

		this.entry = entry;
		this.indent = indent;
		this.presentation = presentation;
	}

	onload(): void {
		super.onload();
		this.onViewContent();
	}

	onViewEditing() {
		this.setContent(
			new TimesheetRowContentEditing(
				this.containerEl,
				this.app,
				this.timekeep,
				this.settings,
				this.entry,
				this.onViewContent.bind(this)
			)
		);
		this.applyPresentation();
	}

	onViewContent() {
		this.setContent(
			new TimesheetRowContent(
				this.containerEl,
				this.app,
				this.timekeep,
				this.settings,
				this.entry,
				this.indent,
				this.onViewEditing.bind(this),
				this.viewState
			)
		);
		this.applyPresentation();
	}

	applyPresentation() {
		const rowEl = this.getContent()?.wrapperEl;
		if (!rowEl) return;

		if (this.presentation.groupTone) {
			rowEl.setAttribute("data-group-tone", this.presentation.groupTone);
		}
		if (this.presentation.groupPosition) {
			rowEl.setAttribute("data-group-position", this.presentation.groupPosition);
		}
	}
}
