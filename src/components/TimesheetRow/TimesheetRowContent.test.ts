// @vitest-environment happy-dom

import moment from "moment";
import { App } from "obsidian";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { createMockContainer } from "@/__mocks__/obsidian";
import { defaultSettings, TimekeepSettings } from "@/settings";
import { createStore, Store } from "@/store";

import { TimesheetRowContent } from "./TimesheetRowContent";

import type { HistoricalActivityDraft } from "@/timekeep/draft";
import { defaultTimekeep, TimeEntry, Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

describe("TimesheetRowContent", () => {
	const start = moment();

	const entry: TimeEntry = {
		id: 1,
		name: "Test",
		startTime: moment(start),
		endTime: null,
		subEntries: null,
	};

	let containerEl: HTMLElement;
	let app: App;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let onBeginEditing: Mock<() => void>;

	beforeEach(() => {
		app = {} as App;
		containerEl = createMockContainer();
		timekeep = createStore(defaultTimekeep());
		settings = createStore(defaultSettings);

		onBeginEditing = vi.fn();
	});

	it("should load without error", () => {
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-11",
				followCurrent: false,
			})
		);
		component.load();
		expect(component.wrapperEl?.firstElementChild?.classList).toContain(
			"timekeep-df-col--actions"
		);
		expect(component.wrapperEl?.lastElementChild?.classList).toContain(
			"timekeep-df-col--actions"
		);
		expect(
			component.wrapperEl?.firstElementChild?.querySelector('[data-action="add-block"]')
		).not.toBeNull();
		expect(
			component.wrapperEl?.firstElementChild?.querySelector("svg")?.getAttribute("data-icon")
		).toBe("plus");
		expect(
			component.wrapperEl?.lastElementChild?.querySelector('[data-action="edit"]')
		).not.toBeNull();
	});

	it("shows Add Block outside the current range and restores timer controls in the current range", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
		const viewState = createStore({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		timekeep.setState({ entries: [entry] });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing,
			viewState
		);
		component.load();

		const button = component.wrapperEl?.querySelector<HTMLButtonElement>(
			'[data-action="add-block"]'
		);
		expect(button?.disabled).toBe(false);
		expect(button?.title).toBe("Add Block");
		component.onClickStop();
		expect(timekeep.getState().entries[0].endTime).toBeNull();

		viewState.setState({ ...viewState.getState(), anchorDate: "2026-08-12" });
		expect(button?.dataset.action).toBe("stop");
		expect(button?.disabled).toBe(false);
		component.unload();
		vi.useRealTimers();
	});

	it.each([
		[TimekeepViewMode.DAY, "2026-08-23"],
		[TimekeepViewMode.WEEK, "2026-08-12"],
		[TimekeepViewMode.MONTH, "2026-07-15"],
		[TimekeepViewMode.QUARTER, "2026-04-15"],
		[TimekeepViewMode.YEAR, "2025-08-24"],
	])("uses a + control for a non-current %s range", (mode, anchorDate) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-24T12:00:00"));
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing,
			createStore({ mode, anchorDate, followCurrent: false })
		);
		component.load();

		const button = component.wrapperEl?.querySelector<HTMLButtonElement>(
			'[data-action="add-block"]'
		);
		expect(button?.title).toBe("Add Block");
		expect(button?.querySelector("svg")?.getAttribute("data-icon")).toBe("plus");
		component.unload();
		vi.useRealTimers();
	});

	it("adds and immediately selects the next historical Block under the owning Activity", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:34:56"));
		const activity: TimeEntry = {
			id: 20,
			name: "Project Management",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 21,
					name: "Block 1",
					startTime: moment("2026-08-11T09:00"),
					endTime: moment("2026-08-11T10:00"),
					subEntries: null,
				},
				{
					id: 22,
					name: "Research",
					startTime: moment("2026-08-11T11:00"),
					endTime: moment("2026-08-11T12:00"),
					subEntries: null,
				},
				{
					id: 23,
					name: "Block 1",
					startTime: moment("2026-08-10T09:00"),
					endTime: moment("2026-08-10T10:00"),
					subEntries: null,
				},
			],
		};
		timekeep.setState({ entries: [activity] });
		const historicalDraft = createStore<HistoricalActivityDraft | null>(null);
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			activity,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-11",
				followCurrent: false,
			}),
			historicalDraft,
			activity.id
		);
		component.load();

		component.wrapperEl?.querySelector<HTMLButtonElement>('[data-action="add-block"]')?.click();

		const updatedActivity = timekeep.getState().entries[0];
		expect(updatedActivity.subEntries).toHaveLength(4);
		expect(updatedActivity.subEntries?.[3]).toMatchObject({
			name: "Block 3",
			startTime: null,
			endTime: null,
		});
		expect(historicalDraft.getState()).toMatchObject({
			activityId: activity.id,
			entryId: updatedActivity.subEntries?.[3].id,
		});
		expect(historicalDraft.getState()?.initialTime.format("YYYY-MM-DD HH:mm:ss")).toBe(
			"2026-08-11 12:34:00"
		);
		component.unload();
		vi.useRealTimers();
	});

	it("shows completed row timestamps without seconds", () => {
		const completedEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-11T09:10:22"),
			endTime: moment("2026-08-11T10:11:33"),
			subEntries: null,
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			completedEntry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("09:10");
		expect(times?.item(1).textContent).toBe("10:11");
	});

	it.each([
		[TimekeepViewMode.DAY, "Block 1 (13:45)"],
		[TimekeepViewMode.WEEK, "Block 1 (Wednesday Afternoon)"],
		[TimekeepViewMode.MONTH, "Block 1 (W33)"],
		[TimekeepViewMode.QUARTER, "Block 1 (August)"],
		[TimekeepViewMode.YEAR, "Block 1 (August)"],
	])("adds display-only context to Block names in %s view", (mode, expected) => {
		const block: TimeEntry = {
			id: 2,
			name: "Block 1",
			startTime: moment("2026-08-12T13:45"),
			endTime: moment("2026-08-12T14:00"),
			subEntries: null,
		};
		timekeep.setState({ entries: [block] });
		settings.setState({ ...defaultSettings, appendBlockContext: true });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			block,
			1,
			onBeginEditing,
			createStore({ mode, anchorDate: "2026-08-12", followCurrent: false }),
			undefined,
			1
		);
		component.load();

		expect(component.wrapperEl?.querySelector(".timekeep-df-entry-name")?.textContent).toBe(
			expected
		);
		expect(timekeep.getState().entries[0].name).toBe("Block 1");
		component.unload();
	});

	it("keeps Activity names and disabled Block context unchanged", () => {
		const activity: TimeEntry = {
			id: 1,
			name: "Activity",
			startTime: moment("2026-08-12T13:45"),
			endTime: moment("2026-08-12T14:00"),
			subEntries: null,
		};
		settings.setState({ ...defaultSettings, appendBlockContext: true });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			activity,
			0,
			onBeginEditing
		);
		component.load();

		expect(component.wrapperEl?.querySelector(".timekeep-df-entry-name")?.textContent).toBe(
			"Activity"
		);
		component.unload();
	});

	it("shows a group's earliest descendant start and latest descendant end", () => {
		const groupEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Part 1",
					startTime: moment("2026-08-11T09:10:22"),
					endTime: moment("2026-08-11T10:11:33"),
					subEntries: null,
				},
				{
					id: 3,
					name: "Part 2",
					startTime: moment("2026-08-12T13:12:44"),
					endTime: moment("2026-08-12T14:13:55"),
					subEntries: null,
				},
			],
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			groupEntry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: false,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("09:10");
		expect(times?.item(1).textContent).toBe("14:13");
	});

	it("omits timestamp seconds and keeps a live end time for a running Part row", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T14:13:59"));
		const runningEntry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: moment("2026-08-12T13:12:44"),
			endTime: null,
			subEntries: null,
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			runningEntry,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("13:12");
		expect(times?.item(1).textContent).toBe("14:13");
		vi.advanceTimersByTime(1000);
		expect(times?.item(1).textContent).toBe("14:14");
		component.unload();
		vi.useRealTimers();
	});

	it("omits timestamp seconds and keeps a live latest end for an active parent Block row", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T14:13:59"));
		const activeGroup: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Part 1",
					startTime: moment("2026-08-11T09:10:22"),
					endTime: moment("2026-08-11T10:11:33"),
					subEntries: null,
				},
				{
					id: 3,
					name: "Part 2",
					startTime: moment("2026-08-12T13:12:44"),
					endTime: null,
					subEntries: null,
				},
			],
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			activeGroup,
			0,
			onBeginEditing,
			createStore({
				mode: TimekeepViewMode.WEEK,
				anchorDate: "2026-08-12",
				followCurrent: true,
			})
		);
		component.load();

		const times = component.wrapperEl?.querySelectorAll(".timekeep-df-col--time");
		expect(times?.item(0).textContent).toBe("09:10");
		expect(times?.item(1).textContent).toBe("14:13");
		vi.advanceTimersByTime(1000);
		expect(times?.item(1).textContent).toBe("14:14");
		component.unload();
		vi.useRealTimers();
	});

	it("folder row should have a folder icon", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		component.load();

		const icon = component.wrapperEl?.querySelector(".timekeep-df-folder-icon");
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(SVGElement);
	});

	it("folder row or groups should be collapsible", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};

		const collapsed: TimeEntry = {
			id: entry.id,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
			collapsed: true,
		};

		timekeep.setState({ entries: [entry] });

		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		const onToggleCollapse = vi.spyOn(component, "onToggleCollapsed");

		component.load();

		const icon = component.wrapperEl?.querySelector(".timekeep-df-collapse-icon");
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(SVGElement);

		(icon as SVGElement).dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: false,
			})
		);

		expect(onToggleCollapse).toHaveBeenCalled();

		const timekeepState: Timekeep = timekeep.getState();
		expect(timekeepState.entries[0]).toEqual(collapsed);
	});

	it("folder row or groups should be expandable", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
			collapsed: true,
		};

		const expanded: TimeEntry = {
			id: entry.id,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};

		timekeep.setState({ entries: [entry] });

		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		const onToggleCollapse = vi.spyOn(component, "onToggleCollapsed");

		component.load();

		const icon = component.wrapperEl?.querySelector(".timekeep-df-collapse-icon");
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(SVGElement);

		(icon as SVGElement).dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: false,
			})
		);

		expect(onToggleCollapse).toHaveBeenCalled();

		const timekeepState: Timekeep = timekeep.getState();
		expect(timekeepState.entries[0]).toEqual(expanded);
	});

	it("toggles collapse state without discarding Blocks hidden by the selected range", () => {
		const visibleBlock: TimeEntry = {
			id: 2,
			name: "Visible",
			startTime: moment("2026-08-12T09:00:00"),
			endTime: moment("2026-08-12T10:00:00"),
			subEntries: null,
		};
		const hiddenBlock: TimeEntry = {
			id: 3,
			name: "Hidden",
			startTime: moment("2026-08-11T09:00:00"),
			endTime: moment("2026-08-11T10:00:00"),
			subEntries: null,
		};
		const storedEntry: TimeEntry = {
			id: 1,
			name: "Activity",
			startTime: null,
			endTime: null,
			subEntries: [hiddenBlock, visibleBlock],
		};
		const displayedEntry: TimeEntry = { ...storedEntry, subEntries: [visibleBlock] };
		timekeep.setState({ entries: [storedEntry] });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			displayedEntry,
			0,
			onBeginEditing
		);
		component.load();

		component.onToggleCollapsed();

		expect(timekeep.getState().entries[0].collapsed).toBe(true);
		expect(timekeep.getState().entries[0].subEntries?.map((entry) => entry.id)).toEqual([3, 2]);
	});

	it("item should be able to be started from clicking the start icon", () => {
		const entry: TimeEntry = {
			id: 1,
			name: "Test",
			startTime: null,
			endTime: null,
			folder: true,
			subEntries: [],
		};

		timekeep.setState({ entries: [entry] });

		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			entry,
			0,
			onBeginEditing
		);
		const onClickStart = vi.spyOn(component, "onClickStart");

		component.load();

		const icon = component.wrapperEl?.querySelector('.timekeep-df-action[data-action="start"]');
		expect(icon).not.toBeNull();
		expect(icon).toBeInstanceOf(HTMLButtonElement);
		expect(icon?.classList.contains("timekeep-df-icon-button")).toBe(true);

		(icon as SVGElement).dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: false,
			})
		);

		expect(onClickStart).toHaveBeenCalled();
	});

	it("toggles a running Part row action to Stop", () => {
		vi.useFakeTimers();
		const endTime = moment("2026-08-12T15:00:00");
		vi.setSystemTime(endTime.toDate());
		const runningPart: TimeEntry = {
			id: 1,
			name: "Running Part",
			startTime: moment("2026-08-12T14:00:00"),
			endTime: null,
			subEntries: null,
		};
		timekeep.setState({ entries: [runningPart] });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			runningPart,
			0,
			onBeginEditing
		);
		const onClickStop = vi.spyOn(component, "onClickStop");
		component.load();

		const stopButton = component.wrapperEl?.querySelector<HTMLButtonElement>(
			'.timekeep-df-action[data-action="stop"]'
		);
		expect(stopButton?.title).toBe("Stop");
		expect(stopButton?.classList.contains("timekeep-df-icon-button")).toBe(true);
		stopButton?.click();

		expect(onClickStop).toHaveBeenCalledOnce();
		expect(timekeep.getState().entries[0].endTime?.toISOString()).toBe(endTime.toISOString());
		component.unload();
		vi.useRealTimers();
	});

	it("stops the running descendant from its parent Block row", () => {
		vi.useFakeTimers();
		const endTime = moment("2026-08-12T15:00:00");
		vi.setSystemTime(endTime.toDate());
		const parent: TimeEntry = {
			id: 1,
			name: "Parent",
			startTime: null,
			endTime: null,
			subEntries: [
				{
					id: 2,
					name: "Running Part",
					startTime: moment("2026-08-12T14:00:00"),
					endTime: null,
					subEntries: null,
				},
			],
		};
		timekeep.setState({ entries: [parent] });
		const component = new TimesheetRowContent(
			containerEl,
			app,
			timekeep,
			settings,
			parent,
			0,
			onBeginEditing
		);
		component.load();

		component.wrapperEl
			?.querySelector<HTMLButtonElement>('.timekeep-df-action[data-action="stop"]')
			?.click();

		const stoppedPart = timekeep.getState().entries[0].subEntries?.[0];
		expect(stoppedPart?.endTime?.toISOString()).toBe(endTime.toISOString());
		component.unload();
		vi.useRealTimers();
	});
});
