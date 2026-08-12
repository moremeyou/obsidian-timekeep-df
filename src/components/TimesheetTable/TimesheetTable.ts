import type { App } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { createStore } from "@/store";
import { assert } from "@/utils/assert";

import { DomComponent } from "@/components/DomComponent";
import { TimesheetRow, type TimesheetRowPresentation } from "@/components/TimesheetRow";

import type { Timekeep } from "@/timekeep/schema";
import { getEntriesSorted } from "@/timekeep/sort";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

/**
 * Table component for rendering the contents of the timekeep
 */
export class TimesheetTable extends DomComponent {
	/** Access to the app instance */
	app: App;
	/** Access to the timekeep */
	timekeep: Store<Timekeep>;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	viewState: Store<TimekeepViewState>;

	/** Table body for row content */
	#bodyEl: HTMLElement | undefined;

	/** Currently mounted row children */
	#rows: TimesheetRow[] = [];

	constructor(
		containerEl: HTMLElement,
		app: App,
		timekeep: Store<Timekeep>,
		settings: Store<TimekeepSettings>,
		viewState?: Store<TimekeepViewState>
	) {
		super(containerEl);

		this.app = app;
		this.timekeep = timekeep;
		this.settings = settings;
		this.viewState =
			viewState ?? createStore(createTimekeepViewState(settings.getState().defaultViewMode));
	}

	onload(): void {
		super.onload();

		const wrapperEl = this.containerEl.createDiv({ cls: "timekeep-df-table-wrapper" });
		this.wrapperEl = wrapperEl;

		const tableEl = wrapperEl.createEl("table", { cls: "timekeep-df-table" });
		const tableHeadEl = tableEl.createEl("thead", {
			cls: "timekeep-df-table-head",
		});

		const tableHeadRowEl = tableHeadEl.createEl("tr");
		tableHeadRowEl.createEl("th", { cls: "timekeep-df-head--name", text: "Activity" });
		tableHeadRowEl.createEl("th", { cls: "timekeep-df-head--time", text: "Start" });
		tableHeadRowEl.createEl("th", { cls: "timekeep-df-head--time", text: "End" });
		tableHeadRowEl.createEl("th", {
			cls: "timekeep-df-head--duration",
			text: "Duration",
		});
		tableHeadRowEl.createEl("th", { cls: "timekeep-df-head--percent", text: "%" });
		tableHeadRowEl.createEl("th", { cls: "timekeep-df-head--actions", text: "Actions" });

		const bodyEl = tableEl.createEl("tbody");
		this.#bodyEl = bodyEl;

		const onUpdate = this.onUpdate.bind(this);

		const unsubscribeSettings = this.settings.subscribe(onUpdate);
		const unsubscribeTimekeep = this.timekeep.subscribe(onUpdate);
		const unsubscribeViewState = this.viewState.subscribe(onUpdate);

		this.register(unsubscribeSettings);
		this.register(unsubscribeTimekeep);
		this.register(unsubscribeViewState);

		onUpdate();
	}

	/**
	 * Update the content, called when the settings or the
	 * timekeep data are updated
	 */
	onUpdate() {
		this.clearRows();
		this.updateWrapperSize();
		this.renderRows();
	}

	/**
	 * Update the size of the wrapper the contains the table element
	 * based on the current settings
	 */
	updateWrapperSize() {
		const wrapperEl = this.wrapperEl;
		assert(wrapperEl, "Wrapper element should be defined");

		const settings = this.settings.getState();
		wrapperEl.toggleClass("timekeep-df-table--fixed-size", settings.limitTableSize);
	}

	/**
	 * Remove the existing rows from the table body children
	 */
	clearRows() {
		// Unload existing children and reset the rows list
		for (const row of this.#rows) {
			this.removeChild(row);
		}

		this.#rows = [];
	}

	/**
	 * Creates the table content and appends it as children
	 * of the body
	 */
	renderRows() {
		const bodyEl = this.#bodyEl;
		assert(bodyEl, "Body element should be defined");

		const timekeep = this.timekeep.getState();
		const settings = this.settings.getState();

		type RowDescriptor = {
			entry: (typeof timekeep.entries)[number];
			depth: number;
			presentation: TimesheetRowPresentation;
		};
		const descriptors: RowDescriptor[] = [];
		const appendEntry = (
			entry: (typeof timekeep.entries)[number],
			depth: number,
			presentation: TimesheetRowPresentation = {}
		): void => {
			descriptors.push({ entry, depth, presentation });
			if (!entry.subEntries || entry.collapsed || entry.subEntries.length === 0) return;

			for (const child of getEntriesSorted(entry.subEntries, settings)) {
				appendEntry(child, depth + 1, presentation);
			}
		};

		const topLevelEntries = getEntriesSorted(timekeep.entries, settings);
		for (let topLevelIndex = 0; topLevelIndex < topLevelEntries.length; topLevelIndex += 1) {
			const entry = topLevelEntries[topLevelIndex];
			const startIndex = descriptors.length;
			const isExpandedGroup =
				entry.subEntries !== null && !entry.collapsed && entry.subEntries.length > 0;
			const presentation: TimesheetRowPresentation = {
				groupTone: topLevelIndex % 2 === 0 ? "odd" : "even",
			};
			appendEntry(entry, 0, presentation);

			if (isExpandedGroup) {
				const endIndex = descriptors.length - 1;
				for (let index = startIndex; index <= endIndex; index += 1) {
					descriptors[index].presentation = {
						...descriptors[index].presentation,
						groupPosition:
							index === startIndex ? "start" : index === endIndex ? "end" : "middle",
					};
				}
			}
		}

		for (const { entry, depth, presentation } of descriptors) {
			const row = new TimesheetRow(
				bodyEl,
				this.app,
				this.timekeep,
				this.settings,
				entry,
				depth,
				presentation,
				this.viewState
			);

			this.addChild(row);
			this.#rows.push(row);
		}
	}
}
