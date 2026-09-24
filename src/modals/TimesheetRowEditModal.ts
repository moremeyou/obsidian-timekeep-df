import type { App } from "obsidian";

import { Modal, Platform } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { TimesheetRowContentEditing } from "@/components/TimesheetRow/TimesheetRowContentEditing";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import type { TimeEntry, Timekeep } from "@/timekeep/schema";
import type { TimekeepViewState } from "@/timekeep/view";

/** Device-independent editor detached from the horizontally scrollable table. */
export class TimesheetRowEditModal extends Modal {
	timekeep: Store<Timekeep>;
	settings: Store<TimekeepSettings>;
	entry: TimeEntry;
	historicalDraft: HistoricalActivityDraft | null;
	onFinish: VoidFunction;
	title: string;
	viewState: Store<TimekeepViewState>;
	isActivity: boolean;
	activityId: number | null;

	editor: TimesheetRowContentEditing | undefined;
	#finished = false;
	#phoneActionsEl: HTMLElement | undefined;
	#phoneCloseEl: HTMLElement | undefined;
	#phoneChromeEl: HTMLElement | undefined;
	#phoneHeaderEl: HTMLElement | undefined;

	constructor(
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		entry: TimeEntry,
		historicalDraft: HistoricalActivityDraft | null,
		title: string,
		onFinish: VoidFunction,
		viewState: Store<TimekeepViewState>,
		isActivity: boolean,
		activityId: number | null
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
		this.activityId = activityId;
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
			this.isActivity,
			this.activityId
		);
		this.editor.load();

		if (Platform.isPhone) {
			const formEl = this.contentEl.querySelector<HTMLFormElement>(
				"form.timekeep-df-editing"
			);
			const actionsEl = formEl?.querySelector<HTMLElement>(".timekeep-df-editing-actions");
			const saveButton = actionsEl?.querySelector<HTMLButtonElement>('[data-action="save"]');
			const headerEl = this.titleEl.parentElement;
			if (formEl && actionsEl && saveButton) {
				formEl.id = `timekeep-df-row-edit-form-${this.entry.id}`;
				saveButton.setAttribute("form", formEl.id);
				saveButton.classList.add("timekeep-df-phone-header-button");
				actionsEl.classList.add("timekeep-df-phone-header-actions");

				headerEl?.classList.add("timekeep-df-edit-modal-header");
				const closeEl = this.containerEl.querySelector<HTMLElement>(".modal-close-button");
				closeEl?.classList.add("timekeep-df-phone-header-button");
				const chromeEl = closeEl?.parentElement ?? this.modalEl;
				chromeEl.classList.add("timekeep-df-phone-modal-chrome");
				if (closeEl?.parentElement === chromeEl) chromeEl.insertBefore(actionsEl, closeEl);
				else chromeEl.append(actionsEl);

				this.#phoneActionsEl = actionsEl;
				this.#phoneCloseEl = closeEl ?? undefined;
				this.#phoneChromeEl = chromeEl;
				this.#phoneHeaderEl = headerEl ?? undefined;
			}
		}
	}

	onClose(): void {
		this.editor?.unload();
		this.editor = undefined;
		this.#phoneActionsEl?.remove();
		this.#phoneCloseEl?.classList.remove("timekeep-df-phone-header-button");
		this.#phoneChromeEl?.classList.remove("timekeep-df-phone-modal-chrome");
		this.#phoneHeaderEl?.classList.remove("timekeep-df-edit-modal-header");
		this.#phoneActionsEl = undefined;
		this.#phoneCloseEl = undefined;
		this.#phoneChromeEl = undefined;
		this.#phoneHeaderEl = undefined;
		this.contentEl.empty();
		if (this.#finished) return;
		this.#finished = true;
		this.onFinish();
	}
}
