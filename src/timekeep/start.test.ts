import moment from "moment";
import { expect, it, describe } from "vitest";

import { stripEntriesRuntimeData } from "./schema";
import { startActivity, startNewEntry, startNewNestedEntry } from "./start";

describe("startActivity", () => {
	it("reuses a matching top-level Activity and starts a new date-specific Block", () => {
		const previousStart = moment("2026-08-11T09:00:00");
		const currentTime = moment("2026-08-12T10:00:00");
		const output = startActivity("  PROJECT MANAGEMENT  ", currentTime, [
			{
				id: 10,
				name: "Project Management",
				startTime: previousStart,
				endTime: moment(previousStart).add(1, "hour"),
				subEntries: null,
			},
		]);

		expect(output).toHaveLength(1);
		expect(output[0].name).toBe("Project Management");
		expect(output[0].collapsed).toBe(true);
		expect(output[0].subEntries).toHaveLength(2);
		expect(output[0].subEntries?.map((entry) => entry.name)).toEqual(["Block 1", "Block 1"]);
		expect(output[0].subEntries?.at(-1)?.startTime).toEqual(currentTime);
		expect(output[0].subEntries?.at(-1)?.endTime).toBeNull();
	});

	it("creates a new top-level Activity when no local name matches", () => {
		const output = startActivity("New Activity", moment("2026-08-12T10:00:00"), []);

		expect(output).toHaveLength(1);
		expect(output[0]).toMatchObject({
			name: "New Activity",
			subEntries: null,
			endTime: null,
		});
	});
});

describe("startNewEntry", () => {
	it("starting a new entry should stop any running entries", async () => {
		const { currentTime, stopped, name, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startShouldStopRunning");

		const output = startNewEntry(name, currentTime, input);
		const stoppedEntry = output.find((entry) => entry.id === stopped);

		expect(stoppedEntry).toBeDefined();
		expect(stoppedEntry!.endTime).not.toBeNull();

		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});

	it("starting a new entry should add a new entry", async () => {
		const { currentTime, name, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startShouldStopRunning");

		const output = startNewEntry(name, currentTime, input);
		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});
});

describe("startNewNestedEntry", () => {
	it("starting a new entry should stop any running entries", async () => {
		const { currentTime, targetEntry, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startNotStartedEntry");

		const output = startNewNestedEntry(currentTime, targetEntry.id, input);
		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});

	it("starting a new entry within a folder should create a subentry", async () => {
		const { currentTime, targetEntry, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startNestedFolderEntry");

		const output = startNewNestedEntry(currentTime, targetEntry.id, input);
		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});

	it("starting a new entry should stop any running entries", async () => {
		const { currentTime, targetEntry, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startNotStartedEntry");

		const output = startNewNestedEntry(currentTime, targetEntry.id, input);
		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});

	it("starting a new entry should stop any running entries", async () => {
		const { currentTime, targetEntryId, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startNestedNonExistent");

		const output = startNewNestedEntry(currentTime, targetEntryId, input);
		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});

	it("starting a new entry should stop any running entries", async () => {
		const { currentTime, stopped, targetEntry, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startNestedShouldStopRunning");

		const output = startNewNestedEntry(currentTime, targetEntry.id, input);

		const outerEntry = output[0];
		const stoppedEntry = outerEntry.subEntries?.find((entry) => entry.id === stopped);

		expect(stoppedEntry).toBeDefined();
		expect(stoppedEntry!.endTime).not.toBeNull();

		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});

	it("starting a new entry should add a new entry", async () => {
		const { currentTime, targetEntry, input, expected } =
			await import("./__fixtures__/manipulating/start_entry/startNestedShouldStopRunning");

		const output = startNewNestedEntry(currentTime, targetEntry.id, input);
		expect(stripEntriesRuntimeData(output)).toEqual(stripEntriesRuntimeData(expected));
	});
});
