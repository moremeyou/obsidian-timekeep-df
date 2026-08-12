import { TimekeepViewMode } from "@/timekeep/view";

export enum PdfExportBehavior {
	// Don't do anything after exporting
	NONE = "NONE",
	// Reveal the file using the system file explorer
	OPEN_PATH = "OPEN_PATH",
	// Open the exported PDF in the default app
	OPEN_FILE = "OPEN_FILE",
}

export enum DurationFormat {
	// Format including all units (1h 30m 25s)
	LONG = "LONG",
	// Format just including hours (1.5h)
	SHORT = "SHORT",
	// Short format without units (1.5)
	DECIMAL = "DECIMAL",
	// Not formatted at all should return empty string
	NONE = "NONE",
}

export enum SortOrder {
	// Don't sort the the list, maintain insertion order
	INSERTION = "INSERTION",

	// Flip the insertion order
	REVERSE_INSERTION = "REVERSE_INSERTION",

	// Sort by the most recently started
	NEWEST_START = "NEWEST_START",

	// Sort by the oldest started entry
	OLDEST_START = "OLDEST_START",
}

export enum FontFamily {
	ROBOTO = "Roboto",
	RUBIK = "Rubik",
}

export enum UnstartedOrder {
	// Sort unstarted items to the start
	FIRST = "FIRST",
	// Sort unstarted items to the end
	LAST = "LAST",
}

export enum ClockFormat {
	TWELVE_HOUR = "TWELVE_HOUR",
	TWENTY_FOUR_HOUR = "TWENTY_FOUR_HOUR",
}

export interface TimekeepSettings {
	csvDelimiter: string;
	csvTitle: boolean;
	editableTimestampFormat: string;
	limitTableSize: boolean;
	pdfFootnote: string;
	pdfTitle: string;
	pdfExportBehavior: PdfExportBehavior;
	pdfDateFormat: string;
	pdfRowDateFormat: string;
	pdfFontFamily: FontFamily;
	pdfMobileExportsFolder: string;

	/**@deprecated use {@link sortOrder} instead */
	reverseSegmentOrder?: boolean;
	clockFormat: ClockFormat;
	timestampFormat: string;
	totalDailyWorkingHours: number;
	totalDaysPerWeek: number;
	defaultViewMode: TimekeepViewMode;
	/**@deprecated use {@link secondaryDurationFormat} instead */
	showDecimalHours?: boolean;
	primaryDurationFormat: DurationFormat;
	secondaryDurationFormat: DurationFormat;
	exportDurationFormat: DurationFormat;
	formatCopiedJSON: boolean;

	sortOrder: SortOrder;
	unstartedOrder: UnstartedOrder;

	registryEnabled: boolean;
	registryConcurrencyLimit: number;

	statusBarEnabled: boolean;
	statusBarShowFolderPath: boolean;
	statusBarItemOpenNewTab: boolean;

	autocompleteEnabled: boolean;
}

export const defaultSettings: TimekeepSettings = {
	pdfTitle: "Example Timesheet",
	pdfFootnote:
		"Information present in this timesheet should be considered Commercial in Confidence.",
	pdfExportBehavior: PdfExportBehavior.OPEN_PATH,
	pdfDateFormat: "DD/MM/YYYY",
	pdfRowDateFormat: "DD/MM/YYYY HH:mm",
	pdfFontFamily: FontFamily.ROBOTO,
	pdfMobileExportsFolder: "TimekeepDFExports",
	clockFormat: ClockFormat.TWENTY_FOUR_HOUR,
	timestampFormat: "YY-MM-DD",
	totalDailyWorkingHours: 8,
	totalDaysPerWeek: 5,
	defaultViewMode: TimekeepViewMode.DAY,
	editableTimestampFormat: "YYYY-MM-DD HH:mm:ss",
	csvTitle: true,
	csvDelimiter: ",",
	limitTableSize: true,
	primaryDurationFormat: DurationFormat.LONG,
	secondaryDurationFormat: DurationFormat.SHORT,
	exportDurationFormat: DurationFormat.SHORT,
	formatCopiedJSON: false,

	sortOrder: SortOrder.INSERTION,
	unstartedOrder: UnstartedOrder.LAST,

	registryEnabled: true,
	registryConcurrencyLimit: 15,

	statusBarEnabled: true,
	statusBarShowFolderPath: true,
	statusBarItemOpenNewTab: false,

	autocompleteEnabled: true,
};

export function legacySettingsCompatibility(settings: TimekeepSettings): void {
	if (
		Object.prototype.hasOwnProperty.call(settings, "defaultViewMode") &&
		!Object.values(TimekeepViewMode).includes(settings.defaultViewMode)
	) {
		settings.defaultViewMode = defaultSettings.defaultViewMode;
	}

	// Timestamp display formats previously included the time. Timekeep DF now
	// owns the clock portion so completed timestamps never expose seconds.
	if (typeof settings.timestampFormat === "string") {
		settings.timestampFormat = settings.timestampFormat
			.replace(/\s+(?:H{1,2}|h{1,2}|k{1,2})[^[]*$/, "")
			.trim();
		if (!settings.timestampFormat) settings.timestampFormat = defaultSettings.timestampFormat;
	}

	// Compatibility with old reverse segment order
	if (Object.prototype.hasOwnProperty.call(settings, "reverseSegmentOrder")) {
		settings.sortOrder = settings.reverseSegmentOrder
			? SortOrder.REVERSE_INSERTION
			: SortOrder.INSERTION;
		delete settings.reverseSegmentOrder;
	}

	// Compatibility with old show decimal hours
	if (Object.prototype.hasOwnProperty.call(settings, "showDecimalHours")) {
		settings.secondaryDurationFormat = settings.showDecimalHours
			? DurationFormat.SHORT
			: DurationFormat.NONE;
		delete settings.showDecimalHours;
	}
}
