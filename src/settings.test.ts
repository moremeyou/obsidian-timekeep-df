import { expect, test, describe } from "vitest";

import {
	SortOrder,
	DurationFormat,
	defaultSettings,
	TimekeepSettings,
	legacySettingsCompatibility,
} from "./settings";
import { TimekeepViewMode } from "./timekeep/view";

describe("legacy settings compatibility conversion", () => {
	test("Fresh mobile PDF exports use a fork-specific folder", () => {
		expect(defaultSettings.pdfMobileExportsFolder).toBe("TimekeepDFExports");
	});

	test("Fresh timestamp settings default to a 24-hour minute-precision display", () => {
		expect(defaultSettings.timestampFormat).toBe("YY-MM-DD");
		expect(defaultSettings.clockFormat).toBe("TWENTY_FOUR_HOUR");
	});

	test("Fresh work-capacity settings default to eight hours and five days", () => {
		expect(defaultSettings.totalDailyWorkingHours).toBe(8);
		expect(defaultSettings.totalDaysPerWeek).toBe(5);
	});

	test("Fresh trackers default to the Day calendar view", () => {
		expect(defaultSettings.defaultViewMode).toBe(TimekeepViewMode.DAY);
	});

	test("Invalid saved calendar views return to Day", () => {
		const settings = {
			...defaultSettings,
			defaultViewMode: "INVALID" as TimekeepViewMode,
		};
		legacySettingsCompatibility(settings);
		expect(settings.defaultViewMode).toBe(TimekeepViewMode.DAY);
	});

	test("Legacy timestamp formats lose their time and seconds portion", () => {
		const settings = { ...defaultSettings, timestampFormat: "DD/MM/YYYY HH:mm:ss" };
		legacySettingsCompatibility(settings);
		expect(settings.timestampFormat).toBe("DD/MM/YYYY");
	});

	test("Empty setting", () => {
		// Checking the legacySettingsCompatibility does not add any settings without existing legacy settings
		const setting = {};
		const expected = {};
		legacySettingsCompatibility(setting as TimekeepSettings);
		expect(setting).toStrictEqual(expected);
	});

	test("Default setting", () => {
		// Checking the default setting does not contain any legacy settings
		const setting = Object.assign({}, defaultSettings);
		legacySettingsCompatibility(setting);
		expect(setting).toStrictEqual(defaultSettings);
	});

	test.each([
		[{ reverseSegmentOrder: true }, { sortOrder: SortOrder.REVERSE_INSERTION }],
		[{ reverseSegmentOrder: false }, { sortOrder: SortOrder.INSERTION }],
		[{ showDecimalHours: true }, { secondaryDurationFormat: DurationFormat.SHORT }],
		[{ showDecimalHours: false }, { secondaryDurationFormat: DurationFormat.NONE }],
	])('for "%s" should expected "%s"', (legacySetting, expected) => {
		// Check the legacy setting gets replaced with the new setting
		const partialSetting = Object.assign({}, legacySetting) as TimekeepSettings;
		legacySettingsCompatibility(partialSetting);
		expect(partialSetting).toStrictEqual(expected);

		const setting = Object.assign({}, defaultSettings, legacySetting);
		legacySettingsCompatibility(setting);
		expect(setting).toStrictEqual(Object.assign({}, defaultSettings, expected));
	});
});
