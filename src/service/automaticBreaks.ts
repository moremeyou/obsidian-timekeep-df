import moment from "moment";
import { Component } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import {
	TimekeepEntryItemType,
	type TimekeepRegistry,
	type TimekeepRegistryItemRef,
} from "./registry";

import { endAutomaticBreakAtWorkingHoursEnd } from "@/timekeep/automaticBreaks";

/** Keeps automatic Breaks capped even when their tracker view is not open. */
export class AutomaticBreakService extends Component {
	#checking = false;

	constructor(
		readonly registry: TimekeepRegistry,
		readonly settings: Store<TimekeepSettings>
	) {
		super();
	}

	onload(): void {
		super.onload();
		const check = () => void this.checkExpiredBreaks();
		this.register(this.registry.entries.subscribe(check));
		this.register(this.settings.subscribe(check));
		this.registerInterval(window.setInterval(check, 30_000));
		check();
	}

	async checkExpiredBreaks(): Promise<void> {
		if (this.#checking || !this.settings.getState().automaticBreaksEnabled) return;
		this.#checking = true;
		try {
			const currentTime = moment();
			const settings = this.settings.getState();
			const refs: TimekeepRegistryItemRef[] = [];

			for (const entry of this.registry.entries.getState()) {
				switch (entry.type) {
					case TimekeepEntryItemType.FILE:
						if (
							endAutomaticBreakAtWorkingHoursEnd(
								entry.timekeep,
								currentTime,
								settings
							) !== entry.timekeep
						) {
							refs.push({ type: entry.type, file: entry.file });
						}
						break;

					case TimekeepEntryItemType.MARKDOWN:
						for (const timekeep of entry.timekeeps) {
							if (
								endAutomaticBreakAtWorkingHoursEnd(
									timekeep.timekeep,
									currentTime,
									settings
								) !== timekeep.timekeep
							) {
								refs.push({
									type: entry.type,
									file: entry.file,
									position: {
										startLine: timekeep.startLine,
										endLine: timekeep.endLine,
									},
								});
							}
						}
						break;
				}
			}

			await Promise.all(
				refs.map((ref) => this.registry.tryEndAutomaticBreak(ref, currentTime))
			);
		} catch (error) {
			console.error("Failed to end an automatic Timekeep DF Break", error);
		} finally {
			this.#checking = false;
		}
	}
}
