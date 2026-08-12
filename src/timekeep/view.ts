import moment, { type Moment } from "moment";

import type { TimeEntry, Timekeep } from "@/timekeep/schema";

export enum TimekeepViewMode {
	DAY = "DAY",
	WEEK = "WEEK",
	MONTH = "MONTH",
	YEAR = "YEAR",
}

export type TimekeepViewState = {
	mode: TimekeepViewMode;
	anchorDate: string;
	followCurrent: boolean;
};

export type TimekeepViewWindow = {
	start: Moment;
	end: Moment;
};

export function createTimekeepViewState(
	mode: TimekeepViewMode,
	currentTime: Moment = moment()
): TimekeepViewState {
	return {
		mode,
		anchorDate: currentTime.format("YYYY-MM-DD"),
		followCurrent: true,
	};
}

function parseAnchor(state: TimekeepViewState): Moment {
	const parsed = moment(state.anchorDate, "YYYY-MM-DD", true);
	return parsed.isValid() ? parsed : moment();
}

export function getTimekeepViewWindow(state: TimekeepViewState): TimekeepViewWindow {
	const anchor = parseAnchor(state);
	let start: Moment;

	switch (state.mode) {
		case TimekeepViewMode.DAY:
			start = anchor.startOf("day");
			break;
		case TimekeepViewMode.WEEK:
			start = anchor.startOf("isoWeek");
			break;
		case TimekeepViewMode.MONTH:
			start = anchor.startOf("month");
			break;
		case TimekeepViewMode.YEAR:
			start = anchor.startOf("year");
			break;
	}

	return {
		start,
		end: moment(start).add(
			1,
			state.mode.toLowerCase() as moment.unitOfTime.DurationConstructor
		),
	};
}

export function shiftTimekeepView(state: TimekeepViewState, amount: number): TimekeepViewState {
	const anchor = parseAnchor(state).add(
		amount,
		state.mode.toLowerCase() as moment.unitOfTime.DurationConstructor
	);
	return {
		...state,
		anchorDate: anchor.format("YYYY-MM-DD"),
		followCurrent: false,
	};
}

export function moveTimekeepViewToCurrent(
	state: TimekeepViewState,
	currentTime: Moment = moment()
): TimekeepViewState {
	return {
		...state,
		anchorDate: currentTime.format("YYYY-MM-DD"),
		followCurrent: true,
	};
}

export function formatTimekeepViewLabel(state: TimekeepViewState): string {
	const { start, end } = getTimekeepViewWindow(state);
	const inclusiveEnd = moment(end).subtract(1, "millisecond");

	switch (state.mode) {
		case TimekeepViewMode.DAY:
			return start.format("ddd, D MMM YYYY");
		case TimekeepViewMode.WEEK:
			return start.year() === inclusiveEnd.year()
				? `${start.format("D MMM")} – ${inclusiveEnd.format("D MMM YYYY")}`
				: `${start.format("D MMM YYYY")} – ${inclusiveEnd.format("D MMM YYYY")}`;
		case TimekeepViewMode.MONTH:
			return start.format("MMMM YYYY");
		case TimekeepViewMode.YEAR:
			return start.format("YYYY");
	}
}

export function timekeepViewIncludesCurrent(
	state: TimekeepViewState,
	currentTime: Moment = moment()
): boolean {
	const { start, end } = getTimekeepViewWindow(state);
	return !currentTime.isBefore(start) && currentTime.isBefore(end);
}

export function canNavigateTimekeepViewForward(
	state: TimekeepViewState,
	currentTime: Moment = moment()
): boolean {
	const selected = getTimekeepViewWindow(state);
	const current = getTimekeepViewWindow({
		...state,
		anchorDate: currentTime.format("YYYY-MM-DD"),
	});
	return selected.start.isBefore(current.start);
}

/**
 * Creates a view-scoped export copy while preserving the complete source tracker.
 * All rows remain present; leaf timestamps are clipped or cleared for the selected window.
 */
export function createTimekeepViewSnapshot(
	timekeep: Timekeep,
	currentTime: Moment,
	window: TimekeepViewWindow
): Timekeep {
	const snapshotEntry = (entry: TimeEntry): TimeEntry => {
		if (entry.subEntries !== null) {
			return {
				...entry,
				startTime: null,
				endTime: null,
				subEntries: entry.subEntries.map(snapshotEntry),
			};
		}

		if (entry.startTime === null) return { ...entry };
		const endTime = entry.endTime ?? currentTime;
		const overlaps =
			entry.startTime.isBefore(window.end) &&
			(endTime.isAfter(window.start) || entry.startTime.isSame(endTime));
		if (!overlaps || endTime.isBefore(entry.startTime)) {
			return { ...entry, startTime: null, endTime: null };
		}

		return {
			...entry,
			startTime: moment.max(entry.startTime, window.start),
			endTime: moment.min(endTime, window.end),
		};
	};

	return { ...timekeep, entries: timekeep.entries.map(snapshotEntry) };
}

export function getTimekeepViewCapacityHours(
	state: TimekeepViewState,
	dailyWorkingHours: number,
	daysPerWeek: number
): number {
	if (!Number.isFinite(dailyWorkingHours) || dailyWorkingHours <= 0) return 0;
	if (state.mode === TimekeepViewMode.DAY) return dailyWorkingHours;

	const configuredDays = Math.min(7, Math.max(1, Math.floor(daysPerWeek)));
	const { start, end } = getTimekeepViewWindow(state);
	let workingDays = 0;
	for (const day = moment(start); day.isBefore(end); day.add(1, "day")) {
		if (day.isoWeekday() <= configuredDays) workingDays += 1;
	}

	return workingDays * dailyWorkingHours;
}
