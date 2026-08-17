import type { App } from "obsidian";

import { Platform } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";

import { TimesheetRowContent } from "./TimesheetRowContent";
import { TimesheetRowContentEditing } from "./TimesheetRowContentEditing";

import { ContentComponent } from "@/components/ContentComponent";

import { TimesheetRowEditModal } from "@/modals/TimesheetRowEditModal";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

export interface TimesheetRowPresentation {
	activityId?: number;
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
	historicalDraft: Store<HistoricalActivityDraft | null>;

	/** The entry for this row */
	entry: TimeEntry;
	/** Indentation level for the entry */
	indent: number;
	/** Derived visual grouping; never persisted in tracker data. */
	presentation: TimesheetRowPresentation;
	resolvedHistoricalDraft: HistoricalActivityDraft | null;

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		entry: TimeEntry,
		indent: number,
		presentation: TimesheetRowPresentation = {},
		viewState?: Store<TimekeepViewState>,
		historicalDraft?: Store<HistoricalActivityDraft | null>,
		resolvedHistoricalDraft: HistoricalActivityDraft | null = null
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
		this.historicalDraft = historicalDraft ?? createStore<HistoricalActivityDraft | null>(null);
		this.resolvedHistoricalDraft = resolvedHistoricalDraft;

		this.entry = entry;
		this.indent = indent;
		this.presentation = presentation;
	}

	onload(): void {
		super.onload();
		if (this.resolvedHistoricalDraft?.entryId === this.entry.id) {
			this.onViewEditing();
		} else {
			this.onViewContent();
		}
	}

	onViewEditing() {
		const historicalDraft = this.resolvedHistoricalDraft;
		if (Platform.isMobile) {
			const storedDraft = this.historicalDraft.getState();
			if (
				historicalDraft &&
				storedDraft?.entryId === historicalDraft.entryId &&
				storedDraft.claimed
			)
				return;
			const modal = new TimesheetRowEditModal(
				this.app,
				this.timekeep,
				this.settings,
				this.entry,
				historicalDraft,
				this.indent === 0 ? "Edit Activity" : "Edit Block",
				this.onFinishEditing.bind(this),
				this.viewState,
				this.indent === 0
			);
			modal.open();
			if (historicalDraft) {
				this.historicalDraft.setState({ ...historicalDraft, claimed: true });
			}
			return;
		}
		this.setContent(
			new TimesheetRowContentEditing(
				this.containerEl,
				this.app,
				this.timekeep,
				this.settings,
				this.entry,
				this.onFinishEditing.bind(this),
				historicalDraft?.entryId === this.entry.id ? historicalDraft : null,
				"row",
				this.viewState,
				this.indent === 0
			)
		);
		this.applyPresentation();

		// The Edit control sits at the far right of the horizontally scrollable table.
		// Return to the visible origin before the responsive edit form takes over.
		const tableWrapperEl = this.getContent()?.wrapperEl?.closest<HTMLElement>(
			".timekeep-df-table-wrapper"
		);
		if (tableWrapperEl) tableWrapperEl.scrollLeft = 0;
	}

	onFinishEditing() {
		if (this.resolvedHistoricalDraft?.entryId === this.entry.id) {
			this.historicalDraft.setState(null);
			return;
		}
		this.onViewContent();
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
				this.viewState,
				this.historicalDraft,
				this.presentation.activityId ?? this.entry.id
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
