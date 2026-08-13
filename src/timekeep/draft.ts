import moment, { type Moment } from "moment";

import { createUnstartedEntry } from "@/timekeep/create";
import { timekeepId } from "@/timekeep/id";
import type { TimeEntry } from "@/timekeep/schema";

export type HistoricalActivityDraft = {
	activityId: number;
	activityName: string;
	entryId: number;
	entryName: string;
	initialTime: Moment;
	/** Prevents a retained draft from opening duplicate mobile modals. */
	claimed?: boolean;
};

type PreparedHistoricalActivityDraft = {
	entries: TimeEntry[];
	draft: HistoricalActivityDraft;
};

function prepareBlockDraft(
	entries: TimeEntry[],
	activityIndex: number,
	initialTime: Moment
): PreparedHistoricalActivityDraft {
	const activity = entries[activityIndex];
	if (activity.subEntries !== null) {
		const existingDraft = activity.subEntries.find(
			(entry) => entry.subEntries === null && entry.startTime === null
		);
		if (existingDraft) {
			return {
				entries,
				draft: {
					activityId: activity.id,
					activityName: activity.name,
					entryId: existingDraft.id,
					entryName: existingDraft.name,
					initialTime: moment(initialTime).startOf("minute"),
				},
			};
		}
	}

	const draftEntry = createUnstartedEntry(nextBlockName(activity, initialTime));
	const groupActivity: TimeEntry =
		activity.subEntries === null
			? {
					...activity,
					startTime: null,
					endTime: null,
					subEntries: [
						{ ...activity, id: timekeepId.next(), name: "Block 1" },
						draftEntry,
					],
				}
			: {
					...activity,
					subEntries: [...activity.subEntries, draftEntry],
				};

	return {
		entries: entries.map((entry, index) => (index === activityIndex ? groupActivity : entry)),
		draft: {
			activityId: groupActivity.id,
			activityName: groupActivity.name,
			entryId: draftEntry.id,
			entryName: draftEntry.name,
			initialTime: moment(initialTime).startOf("minute"),
		},
	};
}

function normalizedName(name: string): string {
	return name.trim().toLocaleLowerCase();
}

function canonicalActivityName(name: string, registryNames: string[]): string {
	const trimmedName = name.trim();
	if (trimmedName.length === 0) return trimmedName;

	return (
		registryNames.find(
			(registryName) => normalizedName(registryName) === normalizedName(trimmedName)
		) ?? trimmedName
	);
}

function nextActivityName(entries: TimeEntry[]): string {
	return `Activity ${entries.length + 1}`;
}

function nextBlockName(entry: TimeEntry, initialTime: Moment): string {
	if (entry.subEntries === null) return "Block 2";

	const blocksOnSelectedDay = entry.subEntries.filter(
		(child) => child.startTime !== null && child.startTime.isSame(initialTime, "day")
	).length;
	return `Block ${blocksOnSelectedDay + 1}`;
}

/**
 * Prepare an editable, unstarted interval for a historical Activity without
 * stopping current work or creating duplicate top-level Activities.
 */
export function prepareHistoricalActivityDraft(
	entries: TimeEntry[],
	requestedName: string,
	registryNames: string[],
	initialTime: Moment
): PreparedHistoricalActivityDraft {
	const canonicalName = canonicalActivityName(requestedName, registryNames);
	const activityName = canonicalName.length > 0 ? canonicalName : nextActivityName(entries);
	const existingIndex = entries.findIndex(
		(entry) => normalizedName(entry.name) === normalizedName(activityName)
	);

	if (existingIndex === -1) {
		const activity = createUnstartedEntry(activityName);
		return {
			entries: [...entries, activity],
			draft: {
				activityId: activity.id,
				activityName: activity.name,
				entryId: activity.id,
				entryName: activity.name,
				initialTime: moment(initialTime).startOf("minute"),
			},
		};
	}

	const activity = entries[existingIndex];
	if (activity.subEntries === null && activity.startTime === null) {
		return {
			entries,
			draft: {
				activityId: activity.id,
				activityName: activity.name,
				entryId: activity.id,
				entryName: activity.name,
				initialTime: moment(initialTime).startOf("minute"),
			},
		};
	}

	return prepareBlockDraft(entries, existingIndex, initialTime);
}

/** Add or reopen an empty child Block for a specific historical Activity. */
export function prepareHistoricalBlockDraft(
	entries: TimeEntry[],
	activityId: number,
	initialTime: Moment
): PreparedHistoricalActivityDraft | null {
	const activityIndex = entries.findIndex((entry) => entry.id === activityId);
	if (activityIndex === -1) return null;
	return prepareBlockDraft(entries, activityIndex, initialTime);
}
