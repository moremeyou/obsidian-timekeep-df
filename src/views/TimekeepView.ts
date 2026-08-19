import moment from "moment";
import { Notice, type App } from "obsidian";

import type { CustomOutputFormat } from "@/output";
import type { TimesheetSaveAdapter } from "@/save/TimesheetSaveAdapter";
import type { TimekeepSettings } from "@/settings";

import { createStore, type Store } from "@/store";

import { ContentComponent } from "@/components/ContentComponent";
import { EmptyComponent } from "@/components/EmptyComponent";
import { Timesheet } from "@/components/Timesheet";
import { TimesheetLoadError } from "@/components/TimesheetLoadError";
import { TimesheetSaveError } from "@/components/TimesheetSaveError";

import { discardHistoricalActivityDraft, type HistoricalActivityDraft } from "@/timekeep/draft";
import type { LoadResult } from "@/timekeep/parser";
import { defaultTimekeep, stripTimekeepRuntimeData, type Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, type TimekeepViewState } from "@/timekeep/view";

import { TimekeepAutocomplete } from "@/service/autocomplete";
import { TimekeepRegistry } from "@/service/registry";

type SaveRequest = {
	timekeep: Timekeep;
	serialized: string;
};

export default class TimekeepView extends ContentComponent<
	Timesheet | TimesheetLoadError | TimesheetSaveError | EmptyComponent
> {
	/** Access to the obsidian app */
	app: App;
	/** Access to the timekeep settings */
	settings: Store<TimekeepSettings>;
	/** Access to custom output formats */
	customOutputFormats: Store<Record<string, CustomOutputFormat>>;
	/** Autocomplete */
	autocomplete: TimekeepAutocomplete;
	registry: TimekeepRegistry | undefined;
	trackerKey: (() => string) | undefined;
	fallbackViewState: Store<TimekeepViewState>;
	fallbackHistoricalDraft: Store<HistoricalActivityDraft | null>;
	historicalDraft: Store<HistoricalActivityDraft | null>;

	/** Loading result for the timekeep data */
	loadResult: Store<LoadResult | null>;
	/** Store for the timekeep state */
	timekeep: Store<Timekeep>;
	/** Store for save error state */
	saveError: Store<boolean>;

	/** Adapter for how the timesheet should be saved */
	saveAdapter: TimesheetSaveAdapter;

	onBeforeSave: VoidFunction | undefined;
	onAfterSave: VoidFunction | undefined;

	#timekeepInitialized = false;
	#saveSubscriptionRegistered = false;
	#lastSavedSerialized: string | null = null;
	#desiredSave: SaveRequest | null = null;
	#saveLoop: Promise<void> | null = null;

	constructor(
		containerEl: HTMLElement,
		app: App,
		settings: Store<TimekeepSettings>,
		customOutputFormats: Store<Record<string, CustomOutputFormat>>,
		autocomplete: TimekeepAutocomplete,
		loadResult: Store<LoadResult | null>,
		saveAdapter: TimesheetSaveAdapter,
		registry?: TimekeepRegistry,
		trackerKey?: () => string
	) {
		super(containerEl);

		this.app = app;

		this.loadResult = loadResult;
		this.timekeep = createStore(defaultTimekeep());
		this.saveError = createStore(false);

		this.settings = settings;
		this.customOutputFormats = customOutputFormats;
		this.autocomplete = autocomplete;
		this.registry = registry;
		this.trackerKey = trackerKey;
		this.fallbackViewState = createStore(
			createTimekeepViewState(settings.getState().defaultViewMode)
		);
		this.fallbackHistoricalDraft = createStore<HistoricalActivityDraft | null>(null);
		this.historicalDraft = this.fallbackHistoricalDraft;

		this.saveAdapter = saveAdapter;
	}

	onload(): void {
		super.onload();

		this.saveAdapter.onLoad();

		const onUpdateContent = this.onUpdateContent.bind(this);

		this.register(this.loadResult.subscribe(onUpdateContent));
		this.register(this.saveError.subscribe(onUpdateContent));

		onUpdateContent();
	}

	onunload(): void {
		super.onunload();
		this.saveAdapter.onUnload();
	}

	onUpdateContent() {
		const saveError = this.saveError.getState();
		const loadResult = this.loadResult.getState();

		if (!loadResult) {
			return this.setContent(new EmptyComponent(this.containerEl));
		}

		if (saveError) {
			this.setContent(new TimesheetSaveError(this.containerEl, this.timekeep));
		} else if (loadResult.success) {
			const timekeep = loadResult.timekeep;

			const trackerKey = this.registry && this.trackerKey ? this.trackerKey() : null;
			this.historicalDraft = trackerKey
				? (this.registry?.getHistoricalDraft(trackerKey) ?? this.fallbackHistoricalDraft)
				: this.fallbackHistoricalDraft;

			if (!this.#timekeepInitialized) {
				this.timekeep.setState(timekeep);
				this.#lastSavedSerialized = this.serializeTimekeep(timekeep);
				this.#timekeepInitialized = true;
			}
			if (!this.#saveSubscriptionRegistered) {
				this.register(this.timekeep.subscribe(this.onSave.bind(this)));
				this.#saveSubscriptionRegistered = true;
			}

			this.setContent(
				new Timesheet(
					this.containerEl,
					this.app,
					this.timekeep,
					this.settings,
					this.customOutputFormats,
					this.autocomplete,
					trackerKey ? this.registry?.getViewState(trackerKey) : this.fallbackViewState,
					this.historicalDraft
				)
			);
		} else {
			this.setContent(new TimesheetLoadError(this.containerEl, loadResult.error));
		}
	}

	onSave(): Promise<void> {
		const timekeep = this.getPersistableTimekeep();
		this.#desiredSave = {
			timekeep,
			serialized: this.serializeTimekeep(timekeep),
		};

		if (this.#saveLoop === null) {
			this.startSaveLoop();
		}

		return this.#saveLoop ?? Promise.resolve();
	}

	private startSaveLoop(): void {
		const loop = this.flushSaveQueue();
		this.#saveLoop = loop;
		void loop.finally(() => {
			if (this.#saveLoop !== loop) return;
			this.#saveLoop = null;
			if (this.#desiredSave !== null) this.startSaveLoop();
		});
	}

	private async flushSaveQueue(): Promise<void> {
		while (this.#desiredSave !== null) {
			const request = this.#desiredSave;
			this.#desiredSave = null;
			if (request.serialized === this.#lastSavedSerialized) continue;
			await this.performSave(request);
		}
	}

	private async performSave(request: SaveRequest): Promise<void> {
		if (this.onBeforeSave) this.onBeforeSave();

		try {
			await this.saveAdapter.onSave(request.timekeep);
			this.#lastSavedSerialized = request.serialized;

			// Clear error state on success
			if (this.saveError.getState()) {
				this.saveError.setState(false);
			}
		} catch (e) {
			console.error("Timekeep DF failed to save", e);

			try {
				const fileName = await this.saveFallback(request.timekeep);
				new Notice(`Timekeep DF: save failed; backup saved to ${fileName}`);
			} catch (e) {
				console.error("Timekeep DF couldn't save a fallback", e);
				new Notice("Timekeep DF: save failed and no backup file could be created");
			}

			this.saveError.setState(true);
		} finally {
			if (this.onAfterSave) this.onAfterSave();
		}
	}

	private getPersistableTimekeep(): Timekeep {
		const timekeep = this.timekeep.getState();
		const historicalDraft = this.historicalDraft.getState();
		if (historicalDraft === null) return timekeep;

		return {
			...timekeep,
			entries: discardHistoricalActivityDraft(timekeep.entries, historicalDraft),
		};
	}

	private serializeTimekeep(timekeep: Timekeep): string {
		return JSON.stringify(stripTimekeepRuntimeData(timekeep));
	}

	/**
	 * Fallback handling if saving the timekeep through the regular
	 * adapter fails:
	 *
	 * Write a backup to a temporary file using the current date and
	 * time in the file name
	 *
	 * @param timekeep The timekeep to save
	 */
	async saveFallback(timekeep: Timekeep) {
		// Fallback in case of write failure, attempt to write to another file
		const backupFileName = `timekeep-df-write-backup-${moment().format("YYYY-MM-DD HH-mm-ss")}.json`;

		// Write to the backup file
		await this.app.vault.create(
			backupFileName,
			JSON.stringify(stripTimekeepRuntimeData(timekeep))
		);

		return backupFileName;
	}
}
