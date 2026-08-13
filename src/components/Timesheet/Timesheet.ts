import { App } from "obsidian";

import { CustomOutputFormat } from "@/output";
import { TimekeepSettings } from "@/settings";
import { createStore, Store } from "@/store";

import { ReplaceableComponent } from "../ReplaceableComponent";

import { TimesheetCounters } from "@/components/TimesheetCounters";
import { TimesheetExportActions } from "@/components/TimesheetExportActions";
import { TimesheetRunningEntry } from "@/components/TimesheetRunningEntry";
import { TimesheetStartForm } from "@/components/TimesheetStartForm";
import { TimesheetTable } from "@/components/TimesheetTable";
import { TimesheetViewControls } from "@/components/TimesheetViewControls";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import { Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

import { TimekeepAutocomplete } from "@/service/autocomplete";

/**
 * View component for the timesheet app as a whole
 */
export class Timesheet extends ReplaceableComponent {
	/** Access to the app instance */
	app: App;
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	/** Access to custom output formats */
	customOutputFormats: Store<Record<string, CustomOutputFormat>>;
	/** Autocomplete */
	autocomplete: TimekeepAutocomplete;
	/** Calendar window selected for this tracker session. */
	viewState: Store<TimekeepViewState>;
	/** Empty historical interval currently being edited; never persisted. */
	historicalDraft: Store<HistoricalActivityDraft | null>;

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		customOutputFormats: Store<Record<string, CustomOutputFormat>>,
		autocomplete: TimekeepAutocomplete,
		viewState?: Store<TimekeepViewState>,
		historicalDraft?: Store<HistoricalActivityDraft | null>
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;
		this.customOutputFormats = customOutputFormats;
		this.autocomplete = autocomplete;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
		this.historicalDraft = historicalDraft ?? createStore<HistoricalActivityDraft | null>(null);
	}

	createContainer(): HTMLElement {
		return createDiv({
			cls: "timekeep-df-container",
		});
	}

	render(wrapperEl: HTMLElement): void {
		const viewControls = new TimesheetViewControls(wrapperEl, this.viewState);
		this.addChild(viewControls);

		const focusPanelEl = wrapperEl.createDiv({ cls: "timekeep-df-focus-panel" });
		const runningEntry = new TimesheetRunningEntry(
			focusPanelEl,
			this.timekeep,
			this.settings,
			this.viewState
		);

		const counters = new TimesheetCounters(
			focusPanelEl,
			this.settings,
			this.timekeep,
			this.viewState
		);
		this.addChild(runningEntry);
		this.addChild(counters);

		const table = new TimesheetTable(
			wrapperEl,
			this.app,
			this.timekeep,
			this.settings,
			this.viewState,
			this.historicalDraft
		);
		this.addChild(table);

		const utilityGridEl = wrapperEl.createDiv({
			cls: ["timekeep-df-utility-grid", "timekeep-df-utility-card"],
		});
		utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-heading", "timekeep-df-utility-heading--add"],
			text: "ADD ACTIVITY",
		});
		utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-heading", "timekeep-df-utility-heading--export"],
			text: "EXPORT",
		});
		const addActivityCellEl = utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-cell", "timekeep-df-utility-cell--add"],
			attr: { "aria-label": "Add Activity" },
		});
		const exportCellEl = utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-cell", "timekeep-df-utility-cell--export"],
			attr: { "aria-label": "Export" },
		});
		exportCellEl.createSpan({
			cls: "timekeep-df-utility-mobile-export-label",
			text: "EXPORT:",
		});

		const startForm = new TimesheetStartForm(
			addActivityCellEl,
			this.timekeep,
			this.settings,
			this.autocomplete,
			this.viewState,
			this.historicalDraft
		);

		const exportActions = new TimesheetExportActions(
			exportCellEl,
			this.app,
			this.timekeep,
			this.settings,
			this.customOutputFormats,
			this.viewState
		);

		this.addChild(startForm);
		this.addChild(exportActions);
	}
}
