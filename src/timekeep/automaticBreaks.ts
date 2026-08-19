import moment, { type Moment } from "moment";

import { defaultSettings, type TimekeepSettings } from "@/settings";

import type { Timekeep } from "./schema";

import { getPathToEntry, getRunningEntry } from "./queries";
import { startActivity } from "./start";
import { stopTimekeep } from "./update";

export type WorkingHoursWindow = {
	start: Moment;
	end: Moment;
};

function parseTimeMinutes(value: string): number | null {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return null;

	const hours = Number.parseInt(match[1], 10);
	const minutes = Number.parseInt(match[2], 10);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
}

/** Resolve the configured work window containing a local timestamp, including overnight shifts. */
export function getWorkingHoursWindow(
	at: Moment,
	settings: TimekeepSettings
): WorkingHoursWindow | null {
	const startMinutes = parseTimeMinutes(settings.workingHoursStart);
	const endMinutes = parseTimeMinutes(settings.workingHoursEnd);
	if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return null;

	const atMinutes = at.hours() * 60 + at.minutes();
	const start = moment(at).startOf("day").add(startMinutes, "minutes");
	const end = moment(at).startOf("day").add(endMinutes, "minutes");

	if (startMinutes < endMinutes) return { start, end };

	// An end earlier than the start represents an overnight working window.
	if (atMinutes < endMinutes) start.subtract(1, "day");
	else end.add(1, "day");
	return { start, end };
}

/** Whether a local timestamp is at or beyond the end of its recurring work window. */
export function isAfterWorkingHours(at: Moment, settings: TimekeepSettings): boolean {
	const startMinutes = parseTimeMinutes(settings.workingHoursStart);
	const endMinutes = parseTimeMinutes(settings.workingHoursEnd);
	if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;

	const atMinutes = at.hours() * 60 + at.minutes();
	if (startMinutes < endMinutes) return atMinutes >= endMinutes;

	// For an overnight schedule, the daytime gap begins at the shift end.
	return atMinutes >= endMinutes && atMinutes < startMinutes;
}

function configuredBreakName(settings: TimekeepSettings): string {
	return settings.automaticBreakName.trim() || defaultSettings.automaticBreakName;
}

function normalizedName(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function runningActivityName(timekeep: Timekeep): string | null {
	const running = getRunningEntry(timekeep.entries);
	if (!running) return null;
	return getPathToEntry(timekeep.entries, running)?.[0]?.name ?? null;
}

export function isAutomaticBreakRunning(timekeep: Timekeep, settings: TimekeepSettings): boolean {
	const activityName = runningActivityName(timekeep);
	return (
		settings.automaticBreaksEnabled &&
		activityName !== null &&
		normalizedName(activityName) === normalizedName(configuredBreakName(settings))
	);
}

/**
 * Stop explicit work and begin a consolidated Break. When the working-hours
 * limiter is enabled, the stop must occur inside the configured window.
 * Stopping the Break itself only stops it.
 */
export function stopTimekeepWithAutomaticBreak(
	timekeep: Timekeep,
	currentTime: Moment,
	settings: TimekeepSettings
): Timekeep {
	const running = getRunningEntry(timekeep.entries);
	if (!running || !settings.automaticBreaksEnabled) {
		return stopTimekeep(timekeep, currentTime);
	}

	const capped = endAutomaticBreakAtWorkingHoursEnd(timekeep, currentTime, settings);
	if (capped !== timekeep) return capped;
	if (isAutomaticBreakRunning(timekeep, settings)) {
		return stopTimekeep(timekeep, currentTime);
	}

	const stopped = stopTimekeep(timekeep, currentTime);
	if (!settings.limitAutomaticBreaksToWorkingHours) {
		return {
			...stopped,
			entries: startActivity(configuredBreakName(settings), currentTime, stopped.entries),
		};
	}

	const window = getWorkingHoursWindow(currentTime, settings);
	if (
		window === null ||
		currentTime.isBefore(window.start) ||
		!currentTime.isBefore(window.end)
	) {
		return stopped;
	}

	return {
		...stopped,
		entries: startActivity(configuredBreakName(settings), currentTime, stopped.entries),
	};
}

/** Cap a still-running configured Break at the end of its work window. */
export function endAutomaticBreakAtWorkingHoursEnd(
	timekeep: Timekeep,
	currentTime: Moment,
	settings: TimekeepSettings
): Timekeep {
	if (
		!settings.limitAutomaticBreaksToWorkingHours ||
		!isAutomaticBreakRunning(timekeep, settings)
	) {
		return timekeep;
	}

	const running = getRunningEntry(timekeep.entries);
	if (!running?.startTime) return timekeep;
	const window = getWorkingHoursWindow(running.startTime, settings);
	if (
		window === null ||
		running.startTime.isBefore(window.start) ||
		!running.startTime.isBefore(window.end) ||
		currentTime.isBefore(window.end)
	) {
		return timekeep;
	}

	return stopTimekeep(timekeep, window.end);
}
