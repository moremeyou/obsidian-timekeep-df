// @vitest-environment happy-dom
import moment from "moment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer, MockPlatform } from "@/__mocks__/obsidian";
import { defaultSettings, type TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";

import { TimesheetTimeline } from "./TimesheetTimeline";

import { load } from "@/timekeep/parser";
import { stripTimekeepRuntimeData, type Timekeep } from "@/timekeep/schema";
import { createTimekeepViewState, TimekeepViewMode, type TimekeepViewState } from "@/timekeep/view";

describe("TimesheetTimeline", () => {
	let host: HTMLElement;
	let data: Store<Timekeep>;
	let view: Store<TimekeepViewState>;
	let timeline: TimesheetTimeline;
	let settings: Store<TimekeepSettings>;
	const at = (time: string) => moment(`2026-08-12T${time}`);
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(at("18:00").toDate());
		MockPlatform.isPhone = false;
		host = createMockContainer();
		data = createStore<Timekeep>({
			entries: [
				{
					id: 1,
					name: "Writing",
					startTime: at("10:00"),
					endTime: at("11:00"),
					subEntries: null,
				},
				{
					id: 2,
					name: "Break",
					startTime: at("11:15"),
					endTime: at("12:00"),
					subEntries: null,
				},
			],
		});
		view = createStore(createTimekeepViewState(TimekeepViewMode.DAY, at("18:00")));
		settings = createStore({ ...defaultSettings });
		timeline = new TimesheetTimeline(host, data, view, settings);
		timeline.load();
	});
	afterEach(() => {
		timeline.unload();
		vi.useRealTimers();
		MockPlatform.isPhone = false;
	});
	const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
	function select() {
		button('[data-action="select"][data-block-id="1"]').click();
	}
	function drag(edge: string, pixels: number) {
		const handle = button(`.timekeep-df-timeline-overview [data-edge="${edge}"]`);
		vi.spyOn(
			handle.closest<HTMLElement>("[data-scale-start]")!,
			"getBoundingClientRect"
		).mockReturnValue({
			width:
				Number(handle.closest<HTMLElement>("[data-scale-start]")!.dataset.scaleDuration) /
				60_000,
		} as DOMRect);
		handle.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				pointerId: 7,
				button: 0,
				clientX: 100,
			})
		);
		document.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: 100 + pixels })
		);
	}
	function release(pixels: number) {
		document.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: 100 + pixels })
		);
	}
	it("previews without writing and saves once on release, clamped to a neighbouring activity", () => {
		select();
		const save = vi.fn();
		data.subscribe(save);
		drag("end", 30);
		expect(save).not.toHaveBeenCalled();
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("11:00").valueOf());
		expect(host.querySelector("[data-times]")!.textContent).toContain("11:15:00");
		release(30);
		expect(save).toHaveBeenCalledTimes(1);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("11:15").valueOf());
		expect(data.getState().entries[1].startTime!.valueOf()).toBe(at("11:15").valueOf());
	});
	it("has no Undo control and Escape does not discard a drag", () => {
		select();
		drag("end", -10);
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		release(-10);
		expect(host.querySelector('[data-action="undo"]')).toBeNull();
		expect(host.textContent).not.toContain("Escape to cancel");
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("10:50").valueOf());
	});
	it("discards an interrupted pointer gesture without saving an incomplete edit", () => {
		select();
		const save = vi.fn();
		data.subscribe(save);
		drag("end", -10);
		document.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7, bubbles: true }));
		release(-10);
		expect(save).not.toHaveBeenCalled();
	});

	it("does not round existing seconds on a click without a drag", () => {
		data.setState((state) => ({
			entries: [{ ...state.entries[0], subEntries: null, endTime: at("11:00:35") }],
		}));
		select();
		const save = vi.fn();
		data.subscribe(save);
		drag("end", 0);
		release(0);
		expect(save).not.toHaveBeenCalled();
		expect(data.getState().entries[0].endTime!.seconds()).toBe(35);
	});
	it("supports one-minute keyboard changes and picker access to tiny blocks", () => {
		view.setState({ ...view.getState(), mode: TimekeepViewMode.YEAR });
		const picker = host.querySelector<HTMLSelectElement>("[data-block-picker]")!;
		picker.value = "1";
		picker.dispatchEvent(new Event("change", { bubbles: true }));
		button('.timekeep-df-timeline-detail [data-edge="start"]').dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
		);
		expect(data.getState().entries[0].startTime!.valueOf()).toBe(at("10:01").valueOf());
		const track = host.querySelector<HTMLElement>(
			".timekeep-df-timeline-detail [data-scale-start]"
		)!;
		expect(Number(track.dataset.scaleEnd) - Number(track.dataset.scaleStart)).toBe(3600_000);
	});
	it("cancels a pending drag on data or period changes", () => {
		select();
		drag("end", 10);
		data.setState((state) => ({
			entries: state.entries.map((entry) =>
				entry.id === 1 && entry.subEntries === null
					? { ...entry, endTime: at("10:45") }
					: entry
			),
		}));
		release(10);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("10:45").valueOf());
		select();
		drag("end", 10);
		view.setState({ ...view.getState(), mode: TimekeepViewMode.MONTH });
		release(10);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("10:45").valueOf());
	});
	it("removes document gesture listeners when unmounted", () => {
		select();
		const save = vi.fn();
		data.subscribe(save);
		drag("end", -10);
		timeline.unload();
		release(-10);
		expect(save).not.toHaveBeenCalled();
	});
	it("keeps the running end live and only exposes its start handle", () => {
		data.setState((state) => ({ entries: [{ ...state.entries[0], endTime: null }] }));
		select();
		expect(host.querySelector('[data-edge="end"]')).toBeNull();
		expect(host.querySelector('[data-edge="start"]')).not.toBeNull();
		expect(host.querySelector("[data-times]")!.textContent).toContain("Now");
	});
	it("does not mount on phones", () => {
		timeline.unload();
		MockPlatform.isPhone = true;
		timeline = new TimesheetTimeline(host, data, view, settings);
		timeline.load();
		expect(host.querySelector(".timekeep-df-timeline")).toBeNull();
	});
	it("retains selection through a Markdown reparse with new runtime IDs", () => {
		select();
		drag("end", -10);
		release(-10);
		const source = JSON.stringify(stripTimekeepRuntimeData(data.getState()));
		timeline.unload();
		// Advance the parser's ID generator before simulating Obsidian's fresh render.
		load(source);
		const loaded = load(source);
		expect(loaded.success).toBe(true);
		if (!loaded.success) throw new Error("Invalid fixture");
		data = createStore(loaded.timekeep);
		timeline = new TimesheetTimeline(host, data, view, settings);
		timeline.load();
		expect(data.getState().entries[0].id).not.toBe(1);
		expect(host.querySelector("[data-times]")!.textContent).toContain("10:50:00");
		expect(data.getState().entries[1].name).toBe("Break");
	});
	it("does not share selection between tracker view-state stores", () => {
		select();
		drag("end", -10);
		release(-10);
		timeline.unload();
		view = createStore(createTimekeepViewState(TimekeepViewMode.DAY, at("18:00")));
		timeline = new TimesheetTimeline(host, data, view, settings);
		timeline.load();
		expect(host.querySelector("[data-times]")).toBeNull();
	});
	it("renders the workday scale and rebuilds it when settings change", () => {
		const axis = () =>
			host.querySelector(".timekeep-df-timeline-overview .timekeep-df-timeline-axis")!;
		expect(axis().textContent).toBe("09:0011:0013:0015:0017:00");
		settings.setState({
			...settings.getState(),
			workingHoursStart: "08:00",
			workingHoursEnd: "16:00",
		});
		expect(axis().textContent).toBe("08:0010:0012:0014:0016:00");
		view.setState({ ...view.getState(), mode: TimekeepViewMode.WEEK });
		const track = host.querySelector<HTMLElement>(
			".timekeep-df-timeline-overview [data-scale-duration]"
		)!;
		expect(Number(track.dataset.scaleDuration)).toBe(40 * 3600_000);
	});
	it("shows early blocks in the overview and allows editing", () => {
		data.setState((state) => ({
			entries: [
				{
					...state.entries[0],
					subEntries: null,
					startTime: at("06:00"),
					endTime: at("07:00"),
				},
			],
		}));
		expect(host.querySelector(".timekeep-df-timeline-overview [data-bar-id]")).not.toBeNull();
		const picker = host.querySelector<HTMLSelectElement>("[data-block-picker]")!;
		picker.value = "1";
		picker.dispatchEvent(new Event("change", { bubbles: true }));
		button('[data-action="plus"]').click();
		expect(data.getState().entries[0].startTime!.valueOf()).toBe(at("06:01").valueOf());
	});
	it("discards a stale incomplete drag if the configured workday changes", () => {
		select();
		drag("end", -10);
		settings.setState({ ...settings.getState(), workingHoursStart: "08:00" });
		release(-10);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("11:00").valueOf());
	});
	it("maps a week drag through a hidden night without changing the other edge", () => {
		data.setState((state) => ({
			entries: [
				{
					...state.entries[0],
					subEntries: null,
					startTime: at("16:00").subtract(1, "day"),
					endTime: at("17:00").subtract(1, "day"),
				},
			],
		}));
		view.setState({ ...view.getState(), mode: TimekeepViewMode.WEEK });
		select();
		drag("end", 30);
		release(30);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(at("09:30").valueOf());
		expect(data.getState().entries[0].startTime!.valueOf()).toBe(
			at("16:00").subtract(1, "day").valueOf()
		);
	});
	it("resizes the morning endpoint of an overnight workday", () => {
		vi.setSystemTime(at("18:00").add(1, "day").toDate());
		settings.setState({
			...settings.getState(),
			workingHoursStart: "22:00",
			workingHoursEnd: "06:00",
		});
		data.setState((state) => ({
			entries: [
				{
					...state.entries[0],
					subEntries: null,
					startTime: at("23:00"),
					endTime: at("04:00").add(1, "day"),
				},
			],
		}));
		select();
		drag("end", -10);
		release(-10);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(
			at("03:50").add(1, "day").valueOf()
		);
	});
	it("shows weekend blocks in Week and lets a dragged edge extend the scale", () => {
		vi.setSystemTime(moment("2026-08-17T18:00").toDate());
		data.setState((state) => ({
			entries: [
				{
					...state.entries[0],
					subEntries: null,
					startTime: moment("2026-08-15T10:00"),
					endTime: moment("2026-08-15T11:00"),
				},
			],
		}));
		view.setState({ ...view.getState(), mode: TimekeepViewMode.WEEK });
		const overview = host.querySelector<HTMLElement>(".timekeep-df-timeline-overview")!;
		expect(overview.textContent).toContain("15 Aug");
		select();
		const before = Number(
			overview.querySelector<HTMLElement>("[data-scale-duration]")!.dataset.scaleDuration
		);
		drag("end", 60);
		release(60);
		expect(data.getState().entries[0].endTime!.valueOf()).toBe(
			moment("2026-08-15T12:00").valueOf()
		);
		const after = Number(
			host.querySelector<HTMLElement>(".timekeep-df-timeline-overview [data-scale-duration]")!
				.dataset.scaleDuration
		);
		expect(after).toBe(before + 3600_000);
	});
});
