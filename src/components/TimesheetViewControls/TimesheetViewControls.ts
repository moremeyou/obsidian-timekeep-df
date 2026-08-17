import moment from "moment";

import type { Store } from "@/store";

import { DomComponent } from "@/components/DomComponent";
import { createObsidianIcon } from "@/components/obsidianIcon";

import {
	canNavigateTimekeepViewForward,
	formatTimekeepViewLabel,
	moveTimekeepViewToCurrent,
	shiftTimekeepView,
	TimekeepViewMode,
	type TimekeepViewState,
} from "@/timekeep/view";

export class TimesheetViewControls extends DomComponent {
	viewState: Store<TimekeepViewState>;
	#labelEl: HTMLElement | undefined;
	#modeEl: HTMLSelectElement | undefined;
	#nextButton: HTMLButtonElement | undefined;

	constructor(containerEl: HTMLElement, viewState: Store<TimekeepViewState>) {
		super(containerEl);
		this.viewState = viewState;
	}

	onload(): void {
		super.onload();
		const wrapperEl = this.containerEl.createDiv({ cls: "timekeep-df-view-controls" });
		this.wrapperEl = wrapperEl;

		const previousButton = wrapperEl.createEl("button", {
			cls: ["timekeep-df-view-control", "timekeep-df-icon-button"],
			title: "Previous period",
			attr: { "aria-label": "Previous period", "data-action": "previous" },
		});
		createObsidianIcon(previousButton, "chevron-left", "timekeep-df-button-icon");

		const currentButton = wrapperEl.createEl("button", {
			cls: "timekeep-df-view-control",
			text: "Today",
			attr: { "data-action": "current" },
		});

		const nextButton = wrapperEl.createEl("button", {
			cls: ["timekeep-df-view-control", "timekeep-df-icon-button"],
			title: "Next period",
			attr: { "aria-label": "Next period", "data-action": "next" },
		});
		this.#nextButton = nextButton;
		createObsidianIcon(nextButton, "chevron-right", "timekeep-df-button-icon");

		this.#labelEl = wrapperEl.createEl("strong", { cls: "timekeep-df-view-label" });
		const modeEl = wrapperEl.createEl("select", {
			cls: ["dropdown", "timekeep-df-view-mode"],
			attr: { "aria-label": "Timesheet view" },
		});
		this.#modeEl = modeEl;
		for (const [value, label] of [
			[TimekeepViewMode.DAY, "Day"],
			[TimekeepViewMode.WEEK, "Week"],
			[TimekeepViewMode.MONTH, "Month"],
			[TimekeepViewMode.QUARTER, "Quarter"],
			[TimekeepViewMode.YEAR, "Year"],
		] as const) {
			modeEl.createEl("option", { text: label, attr: { value } });
		}

		this.registerDomEvent(previousButton, "click", () => {
			this.viewState.setState((state) => shiftTimekeepView(state, -1));
		});
		this.registerDomEvent(currentButton, "click", () => {
			this.viewState.setState((state) => moveTimekeepViewToCurrent(state));
		});
		this.registerDomEvent(nextButton, "click", () => {
			this.viewState.setState((state) =>
				canNavigateTimekeepViewForward(state) ? shiftTimekeepView(state, 1) : state
			);
		});
		this.registerDomEvent(modeEl, "change", () => {
			this.viewState.setState((state) => ({
				...state,
				mode: modeEl.value as TimekeepViewMode,
			}));
		});

		const update = this.update.bind(this);
		this.register(this.viewState.subscribe(update));
		this.registerInterval(
			window.setInterval(() => {
				const state = this.viewState.getState();
				if (state.followCurrent && state.anchorDate !== moment().format("YYYY-MM-DD")) {
					this.viewState.setState(moveTimekeepViewToCurrent(state));
				}
			}, 60_000)
		);
		update();
	}

	update(): void {
		if (!this.#labelEl || !this.#modeEl || !this.#nextButton) return;
		const state = this.viewState.getState();
		this.#labelEl.textContent = formatTimekeepViewLabel(state);
		this.#modeEl.value = state.mode;
		this.#nextButton.disabled = !canNavigateTimekeepViewForward(state);
	}
}
