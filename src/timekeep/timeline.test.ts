import moment from "moment";
import { describe, expect, it } from "vitest";

import type { TimeEntry, TimeEntrySingle } from "./schema";

import {
	getTimelineBlocks,
	resizeTimelineBlock,
	snapTimelineEdge,
	timelineBlockVisible,
	timelineEdgeBounds,
} from "./timeline";
import { createTimekeepViewState, getTimekeepViewWindow, TimekeepViewMode } from "./view";

const at = (time: string) => moment(`2026-08-12T${time}`).valueOf();
const now = at("18:00:00");
const window = getTimekeepViewWindow(createTimekeepViewState(TimekeepViewMode.DAY, moment(now)));
function leaf(id: number, start: string, end: string | null): TimeEntrySingle {
	return {
		id,
		name: `Block ${id}`,
		startTime: moment(at(start)),
		endTime: end ? moment(at(end)) : null,
		subEntries: null,
	};
}

describe("timeline projection and resizing", () => {
	it("shows leaf sessions in collapsed and nested activities without mutating their timestamps", () => {
		const block = leaf(2, "09:00", "10:00");
		const group: TimeEntry = {
			id: 1,
			name: "Project",
			startTime: null,
			endTime: null,
			collapsed: true,
			subEntries: [block],
		};
		const projected = getTimelineBlocks([group], now);
		expect(projected).toHaveLength(1);
		expect(projected[0]).toMatchObject({
			entry: block,
			activityId: 1,
			activityName: "Project",
			running: false,
		});
		expect(projected[0].entry).toBe(block);
	});
	it("ignores unstarted, invalid and negative intervals, and retains running sessions", () => {
		const invalid = { ...leaf(1, "10:00", "11:00"), startTime: moment.invalid() };
		const empty = { ...leaf(2, "10:00", "11:00"), startTime: null };
		const blocks = getTimelineBlocks(
			[invalid, empty, leaf(3, "11:00", "10:00"), leaf(4, "12:00", null)],
			now
		);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ end: now, running: true });
	});
	it("rounds freely to the nearest minute and leaves the other edge's seconds intact", () => {
		const original = leaf(1, "10:00:25", "11:00:35");
		const blocks = getTimelineBlocks([original], now);
		const value = snapTimelineEdge(blocks[0], "start", at("10:05:40"), blocks, window, now)!;
		expect(value).toBe(at("10:06"));
		const updated = resizeTimelineBlock([original], original, "start", value, window, now)!;
		expect(updated.endTime).toBe(original.endTime);
		expect(original.startTime!.valueOf()).toBe(at("10:00:25"));
	});
	it("allows exact adjacency and stops at neighbours across different activities", () => {
		const entries = [
			leaf(1, "09:00", "10:00"),
			leaf(2, "10:15", "11:00"),
			leaf(3, "11:30", "12:00"),
		];
		const blocks = getTimelineBlocks(entries, now);
		expect(snapTimelineEdge(blocks[1], "start", at("08:00"), blocks, window, now)).toBe(
			at("10:00")
		);
		expect(snapTimelineEdge(blocks[1], "end", at("13:00"), blocks, window, now)).toBe(
			at("11:30")
		);
	});
	it("rounds second-level neighbours away from overlap", () => {
		const entries = [
			leaf(1, "09:00", "10:00:25"),
			leaf(2, "10:15", "11:00"),
			leaf(3, "11:30:25", "12:00"),
		];
		const blocks = getTimelineBlocks(entries, now);
		expect(snapTimelineEdge(blocks[1], "start", at("09:30"), blocks, window, now)).toBe(
			at("10:01")
		);
		expect(snapTimelineEdge(blocks[1], "end", at("12:00"), blocks, window, now)).toBe(
			at("11:30")
		);
	});
	it("magnetically snaps near an available boundary without changing its neighbour", () => {
		const entries = [leaf(1, "09:00", "10:00"), leaf(2, "10:15", "11:00")];
		const blocks = getTimelineBlocks(entries, now);
		expect(
			snapTimelineEdge(blocks[1], "start", at("10:01"), blocks, window, now, 120_000)
		).toBe(at("10:00"));
		expect(entries[0].endTime!.valueOf()).toBe(at("10:00"));
	});
	it("permits shrinking existing overlaps but prevents increasing them, including equal boundaries", () => {
		const blocks = getTimelineBlocks(
			[leaf(1, "10:00", "11:00"), leaf(2, "10:00", "11:00")],
			now
		);
		expect(snapTimelineEdge(blocks[0], "start", at("09:00"), blocks, window, now)).toBe(
			at("10:00")
		);
		expect(snapTimelineEdge(blocks[0], "end", at("12:00"), blocks, window, now)).toBe(
			at("11:00")
		);
		expect(snapTimelineEdge(blocks[0], "end", at("10:30"), blocks, window, now)).toBe(
			at("10:30")
		);
	});
	it("cannot jump an intervening block or invert a duration", () => {
		const blocks = getTimelineBlocks(
			[leaf(1, "10:00", "11:00"), leaf(2, "12:00", "13:00")],
			now
		);
		expect(snapTimelineEdge(blocks[0], "end", at("16:00"), blocks, window, now)).toBe(
			at("12:00")
		);
		expect(snapTimelineEdge(blocks[0], "end", at("09:00"), blocks, window, now)).toBe(
			at("10:01")
		);
		expect(snapTimelineEdge(blocks[0], "start", at("12:00"), blocks, window, now)).toBe(
			at("10:59")
		);
	});
	it("retains a running end and prevents future timestamps", () => {
		const blocks = getTimelineBlocks([leaf(1, "17:00", null)], now);
		expect(timelineEdgeBounds(blocks[0], "end", blocks, window, now)).toBeNull();
		expect(snapTimelineEdge(blocks[0], "start", at("20:00"), blocks, window, now)).toBe(
			at("17:59")
		);
	});
	it("only edits real endpoints in the selected period without truncating offscreen history", () => {
		const original = leaf(1, "10:00", "11:00");
		original.startTime = moment(window.start).subtract(2, "hours");
		const blocks = getTimelineBlocks([original], now);
		expect(timelineBlockVisible(blocks[0], window)).toBe(true);
		expect(timelineEdgeBounds(blocks[0], "start", blocks, window, now)).toBeNull();
		const resized = resizeTimelineBlock([original], original, "end", at("12:00"), window, now)!;
		expect(resized.startTime).toBe(original.startTime);
	});
	it("rechecks changed neighbours and rejects stale or deleted targets before saving", () => {
		const original = leaf(1, "10:00", "11:00");
		expect(
			resizeTimelineBlock(
				[original, leaf(2, "11:15", "12:00")],
				original,
				"end",
				at("11:30"),
				window,
				now
			)
		).toBeNull();
		expect(
			resizeTimelineBlock(
				[leaf(1, "10:05", "11:00")],
				original,
				"end",
				at("11:30"),
				window,
				now
			)
		).toBeNull();
		expect(resizeTimelineBlock([], original, "end", at("11:30"), window, now)).toBeNull();
	});
	it("rejects invalid candidates", () => {
		const blocks = getTimelineBlocks([leaf(1, "10:00", "11:00")], now);
		expect(snapTimelineEdge(blocks[0], "start", NaN, blocks, window, now)).toBeNull();
	});
	it.each([
		TimekeepViewMode.DAY,
		TimekeepViewMode.WEEK,
		TimekeepViewMode.MONTH,
		TimekeepViewMode.QUARTER,
		TimekeepViewMode.YEAR,
	])("uses the selected %s window", (mode) => {
		const range = getTimekeepViewWindow(createTimekeepViewState(mode, moment(now)));
		const block = getTimelineBlocks([leaf(1, "10:00", "11:00")], now)[0];
		expect(timelineBlockVisible(block, range)).toBe(true);
		expect(timelineEdgeBounds(block, "start", [block], range, now)!.min).toBe(
			range.start.valueOf()
		);
	});
	it("uses the real elapsed length of a daylight-saving day", () => {
		// The suite runs in Pacific/Auckland: clocks advance on 27 September 2026.
		const range = getTimekeepViewWindow(
			createTimekeepViewState(TimekeepViewMode.DAY, moment("2026-09-27"))
		);
		expect(range.end.diff(range.start, "hours")).toBe(23);
		const entry: TimeEntry = {
			id: 1,
			name: "Overnight",
			startTime: moment(range.start),
			endTime: moment(range.end),
			subEntries: null,
		};
		const block = getTimelineBlocks([entry], range.end.valueOf())[0];
		expect(block.end - block.start).toBe(23 * 3600_000);
		expect(
			resizeTimelineBlock(
				[entry],
				entry,
				"end",
				range.end.valueOf() - 60_000,
				range,
				range.end.valueOf()
			)!.endTime!.format("HH:mm")
		).toBe("23:59");
	});
	it("constrains the editable edge to the selected window even when the other edge is outside it", () => {
		const source = leaf(1, "10:00", "11:00");
		source.startTime = moment(window.start).subtract(2, "hours");
		const blocks = getTimelineBlocks([source], now);
		expect(
			snapTimelineEdge(
				blocks[0],
				"end",
				window.start.valueOf() - 3600_000,
				blocks,
				window,
				now
			)
		).toBe(window.start.valueOf());
		const futureEnd = leaf(2, "10:00", "11:00");
		futureEnd.endTime = moment(window.end).add(2, "hours");
		const futureBlocks = getTimelineBlocks([futureEnd], window.end.valueOf() + 3600_000);
		expect(
			snapTimelineEdge(
				futureBlocks[0],
				"start",
				window.end.valueOf() + 3600_000,
				futureBlocks,
				window,
				window.end.valueOf() + 3600_000
			)
		).toBe(window.end.valueOf());
	});
});
