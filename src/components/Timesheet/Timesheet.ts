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

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		customOutputFormats: Store<Record<string, CustomOutputFormat>>,
		autocomplete: TimekeepAutocomplete,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;
		this.customOutputFormats = customOutputFormats;
		this.autocomplete = autocomplete;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
	}

	createContainer(): HTMLElement {
		return createDiv({
			cls: "timekeep-df-container",
		});
	}

	render(wrapperEl: HTMLElement): void {
		const viewControls = new TimesheetViewControls(wrapperEl, this.viewState);

		const counters = new TimesheetCounters(
			wrapperEl,
			this.settings,
			this.timekeep,
			this.viewState
		);

		const runningEntry = new TimesheetRunningEntry(wrapperEl, this.timekeep, this.settings);

		const table = new TimesheetTable(
			wrapperEl,
			this.app,
			this.timekeep,
			this.settings,
			this.viewState
		);
		this.addChild(viewControls);
		this.addChild(counters);
		this.addChild(runningEntry);
		this.addChild(table);

		const utilityGridEl = wrapperEl.createDiv({ cls: "timekeep-df-utility-grid" });
		utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-heading", "timekeep-df-utility-heading--add"],
			text: "Add Activity",
		});
		utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-heading", "timekeep-df-utility-heading--export"],
			text: "Export",
		});
		const addActivityCellEl = utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-cell", "timekeep-df-utility-cell--add"],
			attr: { "aria-label": "Add Activity" },
		});
		const exportCellEl = utilityGridEl.createDiv({
			cls: ["timekeep-df-utility-cell", "timekeep-df-utility-cell--export"],
			attr: { "aria-label": "Export" },
		});

		const startForm = new TimesheetStartForm(
			addActivityCellEl,
			this.timekeep,
			this.settings,
			this.autocomplete
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
