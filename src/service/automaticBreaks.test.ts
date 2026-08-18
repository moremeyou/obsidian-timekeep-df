// @vitest-environment happy-dom

import moment from "moment";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockVault } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { AutomaticBreakService } from "./automaticBreaks";
import { TimekeepEntryItemType, TimekeepRegistry } from "./registry";

describe("AutomaticBreakService", () => {
	afterEach(() => vi.useRealTimers());

	it("asks the registry to persist only expired configured Breaks", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-17T18:00:00"));
		const vault = new MockVault();
		const settings = createStore({
			...defaultSettings,
			automaticBreaksEnabled: true,
			limitAutomaticBreaksToWorkingHours: true,
			workingHoursStart: "09:00",
			workingHoursEnd: "17:00",
		});
		const registry = new TimekeepRegistry(vault.asVault(), settings);
		const breakFile = vault.addFile("break.timekeep-df", "");
		const taskFile = vault.addFile("task.timekeep-df", "");
		registry.entries.setState([
			{
				type: TimekeepEntryItemType.FILE,
				file: breakFile,
				timekeep: {
					entries: [
						{
							id: 1,
							name: "Break",
							startTime: moment("2026-08-17T16:30:00"),
							endTime: null,
							subEntries: null,
						},
					],
				},
			},
			{
				type: TimekeepEntryItemType.FILE,
				file: taskFile,
				timekeep: {
					entries: [
						{
							id: 2,
							name: "Project",
							startTime: moment("2026-08-17T16:30:00"),
							endTime: null,
							subEntries: null,
						},
					],
				},
			},
		]);
		const endBreak = vi.spyOn(registry, "tryEndAutomaticBreak").mockResolvedValue(true);
		const service = new AutomaticBreakService(registry, settings);

		await service.checkExpiredBreaks();

		expect(endBreak).toHaveBeenCalledOnce();
		expect(endBreak.mock.calls[0][0]).toMatchObject({ file: breakFile });
	});

	it("does nothing while working-hours limiting is disabled", async () => {
		const vault = new MockVault();
		const settings = createStore({
			...defaultSettings,
			automaticBreaksEnabled: true,
			limitAutomaticBreaksToWorkingHours: false,
		});
		const registry = new TimekeepRegistry(vault.asVault(), settings);
		const endBreak = vi.spyOn(registry, "tryEndAutomaticBreak");
		const service = new AutomaticBreakService(registry, settings);

		await service.checkExpiredBreaks();

		expect(endBreak).not.toHaveBeenCalled();
	});

	it("does nothing while automatic breaks are disabled", async () => {
		const vault = new MockVault();
		const settings = createStore(defaultSettings);
		const registry = new TimekeepRegistry(vault.asVault(), settings);
		const endBreak = vi.spyOn(registry, "tryEndAutomaticBreak");
		const service = new AutomaticBreakService(registry, settings);

		await service.checkExpiredBreaks();

		expect(endBreak).not.toHaveBeenCalled();
	});
});
