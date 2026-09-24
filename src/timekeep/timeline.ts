import moment from "moment";

import type { TimeEntry } from "./schema";
import type { TimekeepViewWindow } from "./view";

export type TimelineEdge = "start" | "end";
export type TimelineBlock = {
	entry: TimeEntry;
	activityId: number;
	activityName: string;
	start: number;
	end: number;
	running: boolean;
};

/** Flatten stored sessions without using clipped export copies or table collapse state. */
export function getTimelineBlocks(entries: TimeEntry[], now: number): TimelineBlock[] {
	const blocks: TimelineBlock[] = [];
	const visit = (entry: TimeEntry, activity: TimeEntry): void => {
		if (entry.subEntries !== null) {
			entry.subEntries.forEach((child) => visit(child, activity));
			return;
		}
		const start = entry.startTime?.valueOf();
		const end = entry.endTime?.valueOf() ?? now;
		if (start === undefined || !Number.isFinite(start) || !Number.isFinite(end) || end < start)
			return;
		blocks.push({
			entry,
			activityId: activity.id,
			activityName: activity.name,
			start,
			end,
			running: entry.endTime === null,
		});
	};
	entries.forEach((entry) => visit(entry, entry));
	return blocks.sort((a, b) => a.start - b.start || a.entry.id - b.entry.id);
}

export function timelineBlockVisible(block: TimelineBlock, window: TimekeepViewWindow): boolean {
	return (
		block.start < window.end.valueOf() &&
		(block.end > window.start.valueOf() ||
			(block.running && block.end === window.start.valueOf()))
	);
}

/** Limit a single edge without moving neighbours, crossing them, or increasing existing overlaps. */
export function timelineEdgeBounds(
	block: TimelineBlock,
	edge: TimelineEdge,
	blocks: TimelineBlock[],
	window: TimekeepViewWindow,
	now: number
): { min: number; max: number } | null {
	const original = edge === "start" ? block.start : block.end;
	if (
		(edge === "end" && block.running) ||
		original < window.start.valueOf() ||
		original > window.end.valueOf()
	)
		return null;
	let min = Math.max(
		window.start.valueOf(),
		edge === "start" ? window.start.valueOf() : block.start + 1
	);
	let max = Math.min(
		window.end.valueOf(),
		edge === "start" ? block.end - 1 : window.end.valueOf()
	);
	max = Math.min(max, now);
	for (const other of blocks) {
		if (other.entry.id === block.entry.id || other.end <= other.start) continue;
		if (edge === "start" && other.start <= block.start) {
			min = Math.max(min, Math.min(other.end, block.start));
		} else if (edge === "end" && other.end >= block.end) {
			max = Math.min(max, Math.max(other.start, block.end));
		}
	}
	min = Math.ceil(min / 60_000) * 60_000;
	max = Math.floor(max / 60_000) * 60_000;
	return min <= max ? { min, max } : null;
}

export function snapTimelineEdge(
	block: TimelineBlock,
	edge: TimelineEdge,
	candidate: number,
	blocks: TimelineBlock[],
	window: TimekeepViewWindow,
	now: number,
	magnetMs = 0
): number | null {
	if (!Number.isFinite(candidate)) return null;
	const bounds = timelineEdgeBounds(block, edge, blocks, window, now);
	if (!bounds) return null;
	let rounded = Math.round(candidate / 60_000) * 60_000;
	let nearest = magnetMs;
	for (const other of blocks) {
		if (other.entry.id === block.entry.id) continue;
		const boundary =
			edge === "start"
				? Math.ceil(other.end / 60_000) * 60_000
				: Math.floor(other.start / 60_000) * 60_000;
		const distance = Math.abs(candidate - boundary);
		if (boundary >= bounds.min && boundary <= bounds.max && distance < nearest) {
			rounded = boundary;
			nearest = distance;
		}
	}
	return Math.min(bounds.max, Math.max(bounds.min, rounded));
}

/** Revalidate against current stored data immediately before committing a preview. */
export function resizeTimelineBlock(
	entries: TimeEntry[],
	original: TimeEntry,
	edge: TimelineEdge,
	value: number,
	window: TimekeepViewWindow,
	now: number
): TimeEntry | null {
	const blocks = getTimelineBlocks(entries, now);
	const block = blocks.find((item) => item.entry.id === original.id);
	if (
		!block ||
		block.entry.startTime?.valueOf() !== original.startTime?.valueOf() ||
		block.entry.endTime?.valueOf() !== original.endTime?.valueOf()
	)
		return null;
	const snapped = snapTimelineEdge(block, edge, value, blocks, window, now);
	if (snapped !== value) return null;
	return { ...block.entry, [edge === "start" ? "startTime" : "endTime"]: moment(value) };
}

/** Index paths survive a Markdown reparse, unlike runtime entry IDs. */
export function timelineEntryPath(entries: TimeEntry[], id: number): number[] | null {
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (entry.id === id) return [index];
		if (entry.subEntries !== null) {
			const child = timelineEntryPath(entry.subEntries, id);
			if (child) return [index, ...child];
		}
	}
	return null;
}

export function timelineEntryAtPath(entries: TimeEntry[], path: number[]): TimeEntry | null {
	let current = entries;
	for (let index = 0; index < path.length; index++) {
		const entry = current[path[index]];
		if (!entry) return null;
		if (index === path.length - 1) return entry;
		if (entry.subEntries === null) return null;
		current = entry.subEntries;
	}
	return null;
}
