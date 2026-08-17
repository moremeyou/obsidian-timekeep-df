import type { App } from "obsidian";

import { Modal, Platform } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { TimesheetRowContentEditing } from "@/components/TimesheetRow/TimesheetRowContentEditing";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import type { TimekeepViewState } from "@/timekeep/view";

/** Mobile/tablet editor detached from the horizontally scrollable table. */
export class TimesheetRowEditModal extends Modal {
	timekeep: Store<Timekeep>;
	settings: Store<TimekeepSettings>;
	entry: TimeEntry;
	historicalDraft: HistoricalActivityDraft | null;
	onFinish: VoidFunction;
	title: string;
	viewState: Store<TimekeepViewState>;
	isActivity: boolean;

	editor: TimesheetRowContentEditing | undefined;
	#finished = false;

	constructor(
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		entry: TimeEntry,
		historicalDraft: HistoricalActivityDraft | null,
		title: string,
		onFinish: VoidFunction,
		viewState: Store<TimekeepViewState>,
		isActivity: boolean
	) {
		super(app);
		this.shouldRestoreSelection = false;
		this.timekeep = timekeep;
		this.settings = settings;
		this.entry = entry;
		this.historicalDraft = historicalDraft;
		this.title = title;
		this.onFinish = onFinish;
		this.viewState = viewState;
		this.isActivity = isActivity;
	}

	onOpen(): void {
		this.modalEl.addClass("timekeep-df-compact-modal", "timekeep-df-row-edit-modal");
		this.modalEl.toggleClass("timekeep-df-phone-modal", Platform.isPhone);
		this.setTitle(this.title);
		this.contentEl.empty();

		this.editor = new TimesheetRowContentEditing(
			this.contentEl,
			this.app,
			this.timekeep,
			this.settings,
			this.entry,
			this.close.bind(this),
			this.historicalDraft,
			"modal",
			this.viewState,
			this.isActivity
		);
		this.editor.load();
	}

	onClose(): void {
		this.editor?.unload();
		this.editor = undefined;
		this.contentEl.empty();
		if (this.#finished) return;
		this.#finished = true;
		this.onFinish();
	}
}
