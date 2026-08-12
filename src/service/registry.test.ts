import type { Workspace } from "obsidian";

import moment from "moment";
import { describe, vi, it, expect } from "vitest";

import { MockMarkdownView, MockTFile, MockVault, MockWorkspaceLeaf } from "@/__mocks__/obsidian";
import { defaultSettings, TimekeepSettings } from "@/settings";
import { createStore } from "@/store";
import { createCodeBlock } from "@/utils/codeblock";

import {
	TimekeepEntryItemType,
	TimekeepRegistry,
	TimekeepRegistryEntry,
	TimekeepRegistryEntryMarkdown,
	TimekeepRegistryItemRef,
	TimekeepRunningEntry,
} from "./registry";

import { stripTimekeepRuntimeData, TimeEntry, Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimekeepRegistry", () => {
	it("retains independent view state per tracker for the plugin session", () => {
		const settings = createStore({
			...defaultSettings,
			defaultViewMode: TimekeepViewMode.DAY,
		});
		const registry = new TimekeepRegistry(new MockVault().asVault(), settings);
		const first = registry.getViewState("markdown:Projects.md:10");
		const firstAgain = registry.getViewState("markdown:Projects.md:10");
		const second = registry.getViewState("markdown:Projects.md:30");

		first.setState((state) => ({ ...state, mode: TimekeepViewMode.WEEK }));

		expect(firstAgain).toBe(first);
		expect(firstAgain.getState().mode).toBe(TimekeepViewMode.WEEK);
		expect(second.getState().mode).toBe(TimekeepViewMode.DAY);
	});
	describe("getFileRegistryEntry", () => {
		it("returns null for markdown without timekeeps", async () => {
			const vault = new MockVault();
			const file = vault.addFile("test.md", "# hello");

			let result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, false);
			expect(result).toBeNull();

			result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, true);
			expect(result).toBeNull();
		});

		it("returns markdown entry with timekeeps", async () => {
			const content = createCodeBlock(
				`{"entries":[{"name":"Block 1","startTime":"2024-03-17T01:33:51.630Z","endTime":"2024-03-17T01:33:55.151Z","subEntries":null}]}`,
				4,
				4
			);

			const vault = new MockVault();
			const file = vault.addFile("test.md", content);

			let result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, false);

			expect(result).not.toBeNull();
			expect(result!.type).toBe(TimekeepEntryItemType.MARKDOWN);
			expect((result as TimekeepRegistryEntryMarkdown).timekeeps.length).toBeGreaterThan(0);

			result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, true);

			expect(result).not.toBeNull();
			expect(result!.type).toBe(TimekeepEntryItemType.MARKDOWN);
			expect((result as TimekeepRegistryEntryMarkdown).timekeeps.length).toBeGreaterThan(0);
		});

		it("returns file entry for valid .timekeep-df file", async () => {
			const content = JSON.stringify({ entries: [] });

			const vault = new MockVault();
			const file = vault.addFile("test.timekeep-df", content);

			let result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, false);

			expect(result).not.toBeNull();
			expect(result?.type).toBe(TimekeepEntryItemType.FILE);

			result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, true);

			expect(result).not.toBeNull();
			expect(result?.type).toBe(TimekeepEntryItemType.FILE);
		});

		it("returns null for invalid .timekeep-df file", async () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const vault = new MockVault();
			const file = vault.addFile("bad.timekeep-df", "invalid");

			let result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, false);
			expect(result).toBeNull();
			expect(spy).toHaveBeenCalled();

			result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, true);
			expect(result).toBeNull();
			expect(spy).toHaveBeenCalled();
		});

		it("excludes an official .timekeep file without reading it", async () => {
			const content = JSON.stringify({ entries: [] });
			const vault = new MockVault();
			const file = vault.addFile("official.timekeep", content);

			let result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, false);
			expect(result).toBeNull();
			expect(vault.read).not.toHaveBeenCalled();
			expect(vault.cachedRead).not.toHaveBeenCalled();

			result = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file, true);
			expect(result).toBeNull();
			expect(vault.read).not.toHaveBeenCalled();
			expect(vault.cachedRead).not.toHaveBeenCalled();
			expect((file as unknown as MockTFile)._content).toBe(content);
		});
	});

	describe("getTimekeepsWithinVault", () => {
		it("filters to Markdown and .timekeep-df files without reading official files", async () => {
			const vault = new MockVault();
			vault.addFile("a.md", "# no tk");
			vault.addFile("b.timekeep-df", JSON.stringify({ entries: [] }));
			vault.addFile("official.timekeep", JSON.stringify({ entries: [] }));
			vault.addFile("ignored.txt", "ignored");

			let result = await TimekeepRegistry.getTimekeepsWithinVault(vault.asVault(), false);
			expect(result.map((entry) => entry.file.path)).toEqual(["b.timekeep-df"]);
			expect(vault.read.mock.calls.map(([file]) => file.path)).not.toContain(
				"official.timekeep"
			);

			result = await TimekeepRegistry.getTimekeepsWithinVault(vault.asVault(), true);
			expect(result.map((entry) => entry.file.path)).toEqual(["b.timekeep-df"]);
			expect(vault.cachedRead.mock.calls.map(([file]) => file.path)).not.toContain(
				"official.timekeep"
			);
		});

		it("returns only valid entries", async () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const vault = new MockVault();
			vault.addFile("a.timekeep-df", JSON.stringify({ entries: [] }));
			vault.addFile("b.timekeep-df", "bad");

			let result = await TimekeepRegistry.getTimekeepsWithinVault(vault.asVault(), false);

			expect(result.length).toBe(1);
			expect(spy).toHaveBeenCalled();

			result = await TimekeepRegistry.getTimekeepsWithinVault(vault.asVault(), true);
			expect(result.length).toBe(1);
			expect(spy).toHaveBeenCalled();
		});
	});

	describe("updateFromFile", () => {
		it("adds new entry", async () => {
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", JSON.stringify({ entries: [] }));

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await registry.updateFromFile(file);

			const entries = registry.entries.getState();
			expect(entries.length).toBe(1);
			expect(entries[0].file).toBe(file);
		});

		it("replaces existing entry for same file", async () => {
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", JSON.stringify({ entries: [] }));

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await registry.updateFromFile(file);
			await registry.updateFromFile(file);

			const entries = registry.entries.getState();
			expect(entries.length).toBe(1);
		});

		it("removes entry if file becomes invalid", async () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});

			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", JSON.stringify({ entries: [] }));

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await registry.updateFromFile(file);

			await vault.write(file, "invalid");

			await registry.updateFromFile(file);

			expect(registry.entries.getState().length).toBe(0);
			expect(spy).toHaveBeenCalled();
		});
	});

	describe("loadFromVault", () => {
		it("loads entries into store", async () => {
			const vault = new MockVault();
			vault.addFile("a.timekeep-df", JSON.stringify({ entries: [] }));

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await registry.loadFromVault();

			expect(registry.entries.getState().length).toBe(1);
		});
	});

	describe("tryStopEntry", () => {
		it("updates markdown timekeep block", async () => {
			const content = createCodeBlock(
				`{"entries":[{"name":"Block 1","startTime":"2024-03-17T01:33:51.630Z","endTime":null,"subEntries":null}]}`,
				4,
				4
			);

			const vault = new MockVault();
			const file = vault.addFile("a.md", content);

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			const entry = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file);
			const tk = (entry! as TimekeepRegistryEntryMarkdown).timekeeps[0];

			await registry.tryStopEntry({
				type: TimekeepEntryItemType.MARKDOWN,
				file,
				position: {
					startLine: tk.startLine,
					endLine: tk.endLine,
				},
			});

			expect(vault.process).toHaveBeenCalled();

			const newContent = await vault.read(file);
			expect(newContent).not.toBe(content);
		});

		it("leaves bytes unchanged if a tracked DF fence becomes an official fence", async () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const content = createCodeBlock(
				`{"entries":[{"name":"Block 1","startTime":"2024-03-17T01:33:51.630Z","endTime":null,"subEntries":null}]}`,
				4,
				4
			);

			const vault = new MockVault();
			const file = vault.addFile("a.md", content);

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			const entry = await TimekeepRegistry.getFileRegistryEntry(vault.asVault(), file);
			const tk = (entry! as TimekeepRegistryEntryMarkdown).timekeeps[0];

			const officialContent = content.replace("```df-timekeep", "```timekeep");
			await vault.write(file, officialContent);

			await registry.tryStopEntry({
				type: TimekeepEntryItemType.MARKDOWN,
				file,
				position: {
					startLine: tk.startLine,
					endLine: tk.endLine,
				},
			});

			expect(vault.process).toHaveBeenCalled();
			expect(spy).toHaveBeenCalled();

			const newContent = await vault.read(file);
			expect(newContent).toBe(officialContent);
		});

		it("public stopping refuses an official .timekeep file byte-for-byte", async () => {
			const content =
				'{"entries":[{"name":"Official","startTime":"2024-03-17T01:33:51.630Z","endTime":null,"subEntries":null}]}';
			const vault = new MockVault();
			const file = vault.addFile("official.timekeep", content);
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await expect(
				registry.tryStopEntry({
					type: TimekeepEntryItemType.FILE,
					file,
				})
			).rejects.toThrow("Refusing to modify a non-DF standalone file");

			expect(vault.process).not.toHaveBeenCalled();
			expect(vault.read).not.toHaveBeenCalled();
			expect(vault.cachedRead).not.toHaveBeenCalled();
			expect(vault.write).not.toHaveBeenCalled();
			expect((file as unknown as MockTFile)._content).toBe(content);
		});

		it("updates .timekeep-df file", async () => {
			const inputTimekeep: Timekeep = {
				entries: [
					{
						id: 1,
						name: "Test",
						startTime: moment("2020-01-01T00:00:00Z"),
						endTime: null,
						subEntries: null,
					},
				],
			};
			const content = JSON.stringify(stripTimekeepRuntimeData(inputTimekeep));
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", content);

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await registry.tryStopEntry({
				type: TimekeepEntryItemType.FILE,
				file,
			});

			expect(vault.process).toHaveBeenCalled();

			const newContent = await vault.read(file);
			expect(newContent).not.toBe(content);
		});

		it("does not modify .timekeep-df file if the file is no longer valid", async () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const inputTimekeep: Timekeep = {
				entries: [
					{
						id: 1,
						name: "Test",
						startTime: moment("2020-01-01T00:00:00Z"),
						endTime: null,
						subEntries: null,
					},
				],
			};
			const content = JSON.stringify(stripTimekeepRuntimeData(inputTimekeep));
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", content);

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await vault.write(file, "Test");

			await registry.tryStopEntry({
				type: TimekeepEntryItemType.FILE,
				file,
			});

			expect(vault.process).toHaveBeenCalled();
			expect(spy).toHaveBeenCalled();

			const newContent = await vault.read(file);
			expect(newContent).toBe("Test");
		});

		it("throws if file is null", async () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			await expect(
				registry.tryStopEntry({
					type: TimekeepEntryItemType.FILE,
					file: null as any,
				})
			).rejects.toThrow();
		});
	});

	describe("file creation", () => {
		it("should do nothing when disabled", async () => {
			const vault = new MockVault();
			const settings = createStore({ ...defaultSettings, registryEnabled: true });
			const registry = new TimekeepRegistry(vault.asVault(), settings);
			const updateFromFile = vi.spyOn(registry, "updateFromFile");
			registry.enabled = false;
			const file = vault.addFile(
				"a.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			registry.onFileCreated(file);
			expect(updateFromFile).not.toHaveBeenCalled();
		});

		it("should do nothing when dealing with a folder", async () => {
			const vault = new MockVault();
			const settings = createStore({ ...defaultSettings, registryEnabled: true });
			const registry = new TimekeepRegistry(vault.asVault(), settings);
			const updateFromFile = vi.spyOn(registry, "updateFromFile");
			const file = vault.addFolder("a.timekeep-df");
			registry.onFileCreated(file);
			expect(updateFromFile).not.toHaveBeenCalled();
		});

		it("adding a valid timekeep file should update the entries", async () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			vault.addFile(
				"a.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			await registry.waitTasks();

			expect(changeListener).toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(1);
		});

		it("adding a valid timekeep markdown file should update the entries", async () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			const content = createCodeBlock(
				`{"entries":[{"name":"Block 1","startTime":"2024-03-17T01:33:51.630Z","endTime":"2024-03-17T01:33:55.151Z","subEntries":null}]}`,
				4,
				4
			);

			vault.addFile("a.md", content);
			await registry.waitTasks();

			expect(changeListener).toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(1);
		});

		it("adding a invalid timekeep file should not update the entries", async () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			vault.addFile("a.timekeep-df", "invalid");
			await registry.waitTasks();

			expect(changeListener).toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(0);
		});

		it("creating a folder should not update the entries", async () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			vault.addFolder("test");
			await registry.waitTasks();

			expect(changeListener).not.toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(0);
		});
	});

	describe("file modification", () => {
		it("updating a file when disabled should do nothing", async () => {
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", "");
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			const updateFromFile = vi.spyOn(registry, "updateFromFile");
			registry.enabled = false;

			await registry.waitTasks();

			registry.onFileModified(file);
			expect(updateFromFile).not.toHaveBeenCalled();
		});

		it("updating a folder should do nothing", async () => {
			const vault = new MockVault();
			const file = vault.addFolder("a.timekeep-df");
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			const updateFromFile = vi.spyOn(registry, "updateFromFile");

			await registry.waitTasks();

			registry.onFileModified(file);
			expect(updateFromFile).not.toHaveBeenCalled();
		});

		it("updating a file should update entries", async () => {
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", "");

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			await vault.write(
				file,
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);
			await registry.waitTasks();

			expect(changeListener).toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(1);
		});

		it("updating a folder should not update entries", async () => {
			const vault = new MockVault();
			vault.addFile("a.md", "");
			vault.addFolder("test");

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			vault.modify("test");

			await registry.waitTasks();

			expect(changeListener).not.toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(0);
		});
	});

	describe("file removal", () => {
		it("removing a file when disabled should do nothing", async () => {
			const vault = new MockVault();
			const file = vault.addFile("a.timekeep-df", "");
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			const setState = vi.spyOn(registry.entries, "setState");
			registry.enabled = false;

			await registry.waitTasks();

			registry.onFileRemoved(file);
			expect(setState).not.toHaveBeenCalled();
		});

		it("removing a folder should do nothing", async () => {
			const vault = new MockVault();
			const file = vault.addFolder("a.timekeep-df");
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			const setState = vi.spyOn(registry.entries, "setState");

			await registry.waitTasks();

			registry.onFileRemoved(file);
			expect(setState).not.toHaveBeenCalled();
		});

		it("removes entry when file deleted", async () => {
			const vault = new MockVault();
			vault.addFile(
				"a.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			vault.removeFile("a.timekeep-df");

			expect(changeListener).toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(0);
		});

		it("only removes the entry of the file that was deleted", async () => {
			const vault = new MockVault();
			vault.addFile(
				"a.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			vault.addFile(
				"b.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();

			await registry.waitTasks();

			const changeListener = vi.fn(() => {});
			registry.entries.subscribe(changeListener);

			vault.removeFile("a.timekeep-df");

			await registry.waitTasks();

			expect(changeListener!).toHaveBeenCalled();
			expect(registry.entries.getState().length).toBe(1);
		});

		it("removing untracked files does nothing", async () => {
			const vault = new MockVault();
			vault.addFile(
				"a.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			vault.addFile("b.unknown", "");

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();
			await registry.waitTasks();

			vault.removeFile("b.unknown");
			expect(registry.entries.getState().length).toBe(1);
		});

		it("removing folder does nothing", async () => {
			const vault = new MockVault();
			vault.addFile(
				"a.timekeep-df",
				JSON.stringify({
					entries: [
						{
							id: 1,
							name: "Test",
							startTime: moment("2020-01-01T00:00:00Z"),
							endTime: null,
							subEntries: null,
						},
					],
				} satisfies Timekeep)
			);

			vault.addFolder("b.unknown");

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));
			registry.load();
			await registry.waitTasks();

			vault.removeFile("b.unknown");
			expect(registry.entries.getState().length).toBe(1);
		});
	});

	describe("onload", () => {
		it("does nothing if registry disabled", () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(
				vault.asVault(),
				createStore<TimekeepSettings>({ ...defaultSettings, registryEnabled: false })
			);

			registry.load();

			expect(vault.on).not.toHaveBeenCalled();
		});

		it("registers vault events when enabled", () => {
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			registry.load();

			expect(vault.on).toHaveBeenCalledTimes(4);
		});

		it("un-registers vault events when switching from enabled to disabled", () => {
			const settings = createStore({ ...defaultSettings, registryEnabled: true });

			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), settings);

			registry.load();

			expect(vault.on).toHaveBeenCalledTimes(4);
			expect(registry.events).toHaveLength(4);

			settings.setState({ ...defaultSettings, registryEnabled: false });

			expect(vault.offref).toHaveBeenCalledTimes(4);
			expect(registry.events).toHaveLength(0);
		});

		it("re-enables exactly four vault events without accumulating old refs", () => {
			const settings = createStore({ ...defaultSettings, registryEnabled: true });
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), settings);

			registry.load();
			expect(registry.events).toHaveLength(4);

			settings.setState({ ...defaultSettings, registryEnabled: false });
			expect(registry.events).toHaveLength(0);

			settings.setState({ ...defaultSettings, registryEnabled: true });

			expect(vault.on).toHaveBeenCalledTimes(8);
			expect(vault.offref).toHaveBeenCalledTimes(4);
			expect(registry.events).toHaveLength(4);
		});

		it("clears vault refs on unload and ignores later settings and vault events", async () => {
			const settings = createStore({ ...defaultSettings, registryEnabled: true });
			const vault = new MockVault();
			const registry = new TimekeepRegistry(vault.asVault(), settings);

			registry.load();
			await registry.waitTasks();
			const updateFromFile = vi.spyOn(registry, "updateFromFile");
			const registerTask = vi.spyOn(registry, "registerTask");

			registry.unload();

			expect(registry.enabled).toBe(false);
			expect(registry.events).toHaveLength(0);
			expect(vault.offref).toHaveBeenCalledTimes(4);

			settings.setState({ ...defaultSettings, registryEnabled: false });
			settings.setState({ ...defaultSettings, registryEnabled: true });
			const file = vault.addFile("after-unload.timekeep-df", JSON.stringify({ entries: [] }));
			vault.modify(file.path);
			vault.renameFile(file.path, "renamed-after-unload.timekeep-df");
			vault.removeFile("renamed-after-unload.timekeep-df");

			expect(vault.on).toHaveBeenCalledTimes(4);
			expect(updateFromFile).not.toHaveBeenCalled();
			expect(registerTask).not.toHaveBeenCalled();
			expect(registry.tasks).toHaveLength(0);
			expect(registry.entries.getState()).toHaveLength(0);
		});

		it("handle loading failure", async () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const vault = new MockVault();
			vault.addFile("test.md", "test");

			const registry = new TimekeepRegistry(vault.asVault(), createStore(defaultSettings));

			vault.read.mockRejectedValue(new Error("failed to read file"));

			registry.load();

			await registry.waitTasks();

			expect(spy).toHaveBeenCalled();
		});
	});

	describe("openItemRef", () => {
		it("should attempt to open the file", async () => {
			const vault = new MockVault();
			const testFile = vault.addFile("test.md", "");
			const ref: TimekeepRegistryItemRef = {
				file: testFile,
				type: TimekeepEntryItemType.FILE,
			};

			const leaf = new MockWorkspaceLeaf();
			leaf.view = new MockMarkdownView();

			const workspace = {
				getLeaf() {
					return leaf;
				},
				getLeavesOfType: vi.fn(() => []),
			} as any as Workspace;

			await TimekeepRegistry.openItemRef(workspace, ref);

			expect(leaf.openFile).toHaveBeenCalled();
		});

		it("should attempt to open the file in a new tab", async () => {
			const vault = new MockVault();
			const testFile = vault.addFile("test.md", "");
			const ref: TimekeepRegistryItemRef = {
				file: testFile,
				type: TimekeepEntryItemType.FILE,
			};

			const leaf = new MockWorkspaceLeaf();
			leaf.view = new MockMarkdownView();

			const fakeLeaf = () => {
				const leaf = new MockWorkspaceLeaf();
				const view = new MockMarkdownView();
				leaf.view = view;
				return leaf;
			};

			const getLeavesOfType = vi.fn(() => {
				return [fakeLeaf(), fakeLeaf(), fakeLeaf(), new MockMarkdownView()];
			});

			const getLeaf = vi.fn(() => {
				return leaf;
			});
			const workspace = {
				getLeaf,
				getLeavesOfType,
			} as any as Workspace;

			await TimekeepRegistry.openItemRef(workspace, ref, true);

			expect(getLeaf).toHaveBeenCalledWith("tab");
			expect(leaf.openFile).toHaveBeenCalled();
		});

		it("should focus the existing file instead of opening a new tab if one is present", async () => {
			const vault = new MockVault();
			const testFile = vault.addFile("test.timekeep-df", "");
			const ref: TimekeepRegistryItemRef = {
				file: testFile,
				type: TimekeepEntryItemType.FILE,
			};

			const existingLeaf = new MockWorkspaceLeaf();
			const view = new MockMarkdownView();
			view.file = testFile;
			existingLeaf.view = view;

			const revealLeaf = vi.fn().mockResolvedValue(undefined);
			const setActiveLeaf = vi.fn().mockResolvedValue(undefined);
			const getLeaf = vi.fn(() => {
				const existingLeaf = new MockWorkspaceLeaf();
				const view = new MockMarkdownView();
				existingLeaf.view = view;
				return existingLeaf;
			});
			const getLeavesOfType = vi.fn(() => {
				return [existingLeaf];
			});

			const workspace = {
				getLeaf,
				getLeavesOfType,
				revealLeaf,
				setActiveLeaf,
			} as any as Workspace;

			await TimekeepRegistry.openItemRef(workspace, ref, true);

			expect(getLeavesOfType).toHaveBeenCalledWith("timekeep-df");
			expect(getLeaf).not.toHaveBeenCalled();
			expect(existingLeaf.openFile).not.toHaveBeenCalled();
			expect(revealLeaf).toHaveBeenCalledWith(existingLeaf);
			expect(setActiveLeaf).toHaveBeenCalledWith(existingLeaf, { focus: true });
		});

		it("opening a markdown entry should scroll to the specific timekeep position", async () => {
			const vault = new MockVault();
			const testFile = vault.addFile("test.md", "");
			const ref: TimekeepRegistryItemRef = {
				file: testFile,
				type: TimekeepEntryItemType.MARKDOWN,
				position: { startLine: 1, endLine: 2 },
			};

			const leaf = new MockWorkspaceLeaf();
			const view = new MockMarkdownView();
			leaf.view = view;

			const workspace = {
				getLeaf() {
					return leaf;
				},
				getLeavesOfType: vi.fn(() => []),
			} as any as Workspace;

			await TimekeepRegistry.openItemRef(workspace, ref);
			expect(leaf.openFile).toHaveBeenCalled();

			const line = ref.position.startLine;

			expect(view.editor.setCursor).toHaveBeenCalledExactlyOnceWith({
				line: line - 1,
				ch: 0,
			});
			expect(view.editor.scrollIntoView).toHaveBeenCalledExactlyOnceWith(
				{ from: { line, ch: 0 }, to: { line, ch: 0 } },
				true
			);
		});
	});

	describe("getRunningEntries", () => {
		it("should be able to collect all running entries", () => {
			const vault = new MockVault();
			const testFile = vault.addFile("test.md", "");
			const testFile2 = vault.addFile("test2.md", "");
			const testFile3 = vault.addFile("test3.md", "");
			const testFile4 = vault.addFile("test4.md", "");

			const start = moment();
			const entry1: TimeEntry = {
				id: 1,
				name: "Test 1",
				startTime: moment(start),
				endTime: null,
				subEntries: null,
			};
			const entry2: TimeEntry = {
				id: 2,
				name: "Test 2",
				startTime: moment(start),
				endTime: null,
				subEntries: null,
			};

			const entries: TimekeepRegistryEntry[] = [
				{
					file: testFile,
					timekeeps: [{ timekeep: { entries: [] }, startLine: 0, endLine: 1 }],
					type: TimekeepEntryItemType.MARKDOWN,
				},
				{
					file: testFile2,
					timekeeps: [{ timekeep: { entries: [entry1] }, startLine: 0, endLine: 1 }],
					type: TimekeepEntryItemType.MARKDOWN,
				},
				{
					file: testFile3,
					timekeep: { entries: [entry2] },
					type: TimekeepEntryItemType.FILE,
				},
				{
					file: testFile4,
					timekeep: { entries: [] },
					type: TimekeepEntryItemType.FILE,
				},
			];

			const running = TimekeepRegistry.getRunningEntries(entries);
			expect(running).toEqual([
				{
					running: entry1,
					ref: {
						file: testFile2,
						type: TimekeepEntryItemType.MARKDOWN,
						position: { startLine: 0, endLine: 1 },
					},
				},
				{
					running: entry2,
					ref: {
						file: testFile3,
						type: TimekeepEntryItemType.FILE,
					},
				},
			] satisfies TimekeepRunningEntry[]);
		});
	});
});
