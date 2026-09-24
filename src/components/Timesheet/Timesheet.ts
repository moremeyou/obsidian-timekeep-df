import { App, Platform } from "obsidian";

import { CustomOutputFormat } from "@/output";
import { TimekeepSettings } from "@/settings";
import { createStore, Store } from "@/store";
import { TIMEKEEP_RESPONSIVE_HOST_CLASS } from "@/utils/responsive";

import { ReplaceableComponent } from "../ReplaceableComponent";

import { TimesheetCounters } from "@/components/TimesheetCounters";
import { TimesheetExportActions } from "@/components/TimesheetExportActions";
import { TimesheetRunningEntry } from "@/components/TimesheetRunningEntry";
import { TimesheetStartForm } from "@/components/TimesheetStartForm";
import { TimesheetTable } from "@/components/TimesheetTable";
import { TimesheetTimeline } from "@/components/TimesheetTimeline/TimesheetTimeline";
import { TimesheetViewControls } from "@/components/TimesheetViewControls";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import { Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

import { TimekeepAutocomplete } from "@/service/autocomplete";

let nextActivityTabsId = 0;

/**
 * View component for the timesheet app as a whole
 */
export class Timesheet extends ReplaceableComponent {
	/** Query host used only for narrow desktop layouts. */
	static readonly RESPONSIVE_HOST_CLASS = TIMEKEEP_RESPONSIVE_HOST_CLASS;
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
		const initialSettings = settings.getState();
		this.viewState =
			viewState ??
			createStore(
				createTimekeepViewState(
					initialSettings.defaultViewMode,
					undefined,
					initialSettings.defaultCounterView
				)
			);
		this.historicalDraft = historicalDraft ?? createStore<HistoricalActivityDraft | null>(null);
	}

	onload(): void {
		if (!Platform.isMobile) {
			this.containerEl.addClass(Timesheet.RESPONSIVE_HOST_CLASS);
			this.register(() => {
				this.containerEl.removeClass(Timesheet.RESPONSIVE_HOST_CLASS);
			});
		}

		super.onload();
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

		const tabs = !Platform.isPhone
			? wrapperEl.createDiv({
					cls: "timekeep-df-activity-tabs",
					attr: { role: "tablist", "aria-label": "Activity view" },
				})
			: null;

		const table = new TimesheetTable(
			wrapperEl,
			this.app,
			this.timekeep,
			this.settings,
			this.viewState,
			this.historicalDraft
		);
		this.addChild(table);
		if (tabs) this.setupActivityTabs(wrapperEl, tabs, table);

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

	private setupActivityTabs(
		wrapper: HTMLElement,
		tabs: HTMLElement,
		table: TimesheetTable
	): void {
		const id = `timekeep-df-activity-view-${nextActivityTabsId++}`;
		const normalPanel = table.wrapperEl!;
		const timelinePanel = wrapper.createDiv({ cls: "timekeep-df-timeline-panel" });
		const panels = [normalPanel, timelinePanel];
		const modes = ["normal", "timeline"] as const;
		const buttons = modes.map((mode, index) => {
			const button = tabs.createEl("button", {
				text: mode === "normal" ? "Normal" : "Timeline",
				attr: {
					type: "button",
					role: "tab",
					id: `${id}-${mode}-tab`,
					"aria-controls": `${id}-${mode}-panel`,
				},
			});
			panels[index].id = `${id}-${mode}-panel`;
			panels[index].setAttribute("role", "tabpanel");
			panels[index].setAttribute("aria-labelledby", button.id);
			this.registerDomEvent(button, "click", () => {
				this.viewState.setState((state) => ({ ...state, activityView: mode }));
			});
			this.registerDomEvent(button, "keydown", (event) => {
				if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
				event.preventDefault();
				const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
				buttons[next].click();
				buttons[next].focus();
			});
			return button;
		});
		let timeline: TimesheetTimeline | null = null;
		const update = () => {
			const showTimeline = this.viewState.getState().activityView === "timeline";
			panels.forEach((panel, index) => {
				panel.hidden = (index === 1) !== showTimeline;
			});
			buttons.forEach((button, index) => {
				const selected = (index === 1) === showTimeline;
				button.setAttribute("aria-selected", String(selected));
				button.tabIndex = selected ? 0 : -1;
			});
			if (showTimeline && !timeline) {
				timeline = new TimesheetTimeline(
					timelinePanel,
					this.timekeep,
					this.viewState,
					this.settings
				);
				this.addChild(timeline);
			} else if (!showTimeline && timeline) {
				this.removeChild(timeline);
				timeline = null;
			}
		};
		this.register(this.viewState.subscribe(update));
		update();
	}
}
