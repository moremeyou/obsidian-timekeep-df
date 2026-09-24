import moment from "moment";

import { defaultSettings, type TimekeepSettings } from "@/settings";

import type { TimelineEdge } from "./timeline";

import {
	getTimekeepViewWindow,
	TimekeepViewMode,
	type TimekeepViewState,
	type TimekeepViewWindow,
} from "./view";

export type TimelineScale = {
	segments: { start: number; end: number; offset: number }[];
	duration: number;
};

export function linearTimelineScale(start: number, end: number): TimelineScale {
	return { segments: [{ start, end, offset: 0 }], duration: end - start };
}

/** Configured workdays form the baseline. Recorded blocks extend a day or add an unscheduled day. */
export function workdayTimelineScale(
	state: TimekeepViewState,
	settings: TimekeepSettings,
	blocks: { start: number; end: number }[] = []
): TimelineScale {
	const window = getTimekeepViewWindow(state);
	const valid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
	const validHours =
		valid(settings.workingHoursStart) &&
		valid(settings.workingHoursEnd) &&
		settings.workingHoursStart !== settings.workingHoursEnd;
	const startTime = validHours ? settings.workingHoursStart : defaultSettings.workingHoursStart;
	const endTime = validHours ? settings.workingHoursEnd : defaultSettings.workingHoursEnd;
	const [startHour, startMinute] = startTime.split(":").map(Number);
	const [endHour, endMinute] = endTime.split(":").map(Number);
	const overnight = endTime < startTime;
	const days = Number.isFinite(settings.totalDaysPerWeek)
		? Math.max(1, Math.min(7, Math.floor(settings.totalDaysPerWeek)))
		: defaultSettings.totalDaysPerWeek;
	const byDay = new Map<string, { start: number; end: number }>();
	for (const day = window.start.clone(); day.isBefore(window.end); day.add(1, "day")) {
		if (state.mode !== TimekeepViewMode.DAY && day.isoWeekday() > days) continue;
		// Set clock time, not elapsed hours, so DST does not shift the configured workday.
		const start = day.clone().hour(startHour).minute(startMinute);
		const end = day
			.clone()
			.add(overnight ? 1 : 0, "day")
			.hour(endHour)
			.minute(endMinute);
		if (end.isAfter(start))
			byDay.set(day.format("YYYY-MM-DD"), { start: start.valueOf(), end: end.valueOf() });
	}
	const lastBaselineEnd = [...byDay.values()].at(-1)?.end ?? window.end.valueOf();
	const rangeStart = window.start.valueOf();
	const calendarEnd = window.end.valueOf();
	const rangeEnd = Math.max(
		calendarEnd,
		lastBaselineEnd,
		...blocks
			.filter((block) => block.start < calendarEnd && block.end > rangeStart)
			.map((block) => Math.min(block.end, moment(calendarEnd).add(1, "day").valueOf()))
	);
	for (const block of blocks) {
		if (
			!Number.isFinite(block.start) ||
			!Number.isFinite(block.end) ||
			block.end <= rangeStart ||
			block.start >= rangeEnd
		)
			continue;
		const start = Math.max(block.start, rangeStart);
		const end = Math.min(block.end, rangeEnd);
		if (end <= start) continue;
		const day = moment(start);
		// Early-morning activity belongs to the preceding overnight workday when that day is in range.
		if (overnight && day.hour() * 60 + day.minute() < endHour * 60 + endMinute) {
			const previous = day.clone().subtract(1, "day");
			if (previous.isSameOrAfter(window.start, "day")) day.subtract(1, "day");
		}
		const key = day.format("YYYY-MM-DD");
		const span = byDay.get(key);
		byDay.set(
			key,
			span
				? { start: Math.min(span.start, start), end: Math.max(span.end, end) }
				: { start, end }
		);
	}
	// An extended session can meet the next day. Merge overlaps so offsets remain monotonic.
	const intervals = [...byDay.values()].sort((a, b) => a.start - b.start);
	const scale: TimelineScale = { segments: [], duration: 0 };
	for (const span of intervals) {
		const previous = scale.segments.at(-1);
		if (previous && span.start <= previous.end) {
			previous.end = Math.max(previous.end, span.end);
			scale.duration = previous.offset + previous.end - previous.start;
		} else {
			scale.segments.push({ ...span, offset: scale.duration });
			scale.duration += span.end - span.start;
		}
	}
	return scale;
}

/** Elapsed displayed time. Hidden gaps collapse to the shared boundary of adjacent workdays. */
export function timelineOffset(scale: TimelineScale, time: number): number {
	for (const segment of scale.segments) {
		if (time <= segment.start) return segment.offset;
		if (time <= segment.end) return segment.offset + time - segment.start;
	}
	return scale.duration;
}

/** At a collapsed night, a start belongs to the following workday and an end to the preceding one. */
export function timelineTime(
	scale: TimelineScale,
	offset: number,
	edge: TimelineEdge = "start"
): number {
	const first = scale.segments[0];
	const last = scale.segments.at(-1);
	if (!first || !last) return NaN;
	if (offset < 0) return first.start + offset;
	if (offset > scale.duration) return last.end + offset - scale.duration;
	const bounded = offset;
	for (let index = 0; index < scale.segments.length; index++) {
		const segment = scale.segments[index];
		const end = segment.offset + segment.end - segment.start;
		if (
			bounded < end ||
			(bounded === end && (edge === "end" || index === scale.segments.length - 1))
		)
			return segment.start + bounded - segment.offset;
	}
	return NaN;
}

export function timelineTimeVisible(scale: TimelineScale, time: number): boolean {
	return scale.segments.some(({ start, end }) => time >= start && time <= end);
}

export function timelineIntervalVisible(scale: TimelineScale, start: number, end: number): boolean {
	return scale.segments.some(
		(segment) =>
			start < segment.end && (end > segment.start || (start === end && end === segment.start))
	);
}

/** Keep off-hours blocks available in the picker; also include the end of an overnight workday. */
export function timelineEditWindow(
	state: TimekeepViewState,
	scale: TimelineScale
): TimekeepViewWindow {
	const window = getTimekeepViewWindow(state);
	const last = scale.segments.at(-1);
	if (last && last.end > window.end.valueOf()) window.end = moment(last.end);
	return window;
}
