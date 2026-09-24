import moment from "moment";
import { Platform } from "obsidian";

import type { TimekeepSettings } from "@/settings";
import type { Store } from "@/store";

import { DomComponent } from "@/components/DomComponent";

import { stripEntryRuntimeData, type Timekeep } from "@/timekeep/schema";
import {
	timelineEntryPath,
	timelineEntryAtPath,
	getTimelineBlocks,
	resizeTimelineBlock,
	snapTimelineEdge,
	timelineBlockVisible,
	timelineEdgeBounds,
	type TimelineBlock,
	type TimelineEdge,
} from "@/timekeep/timeline";
import {
	linearTimelineScale,
	workdayTimelineScale,
	timelineOffset,
	timelineTime,
	timelineTimeVisible,
	timelineIntervalVisible,
	timelineEditWindow,
	type TimelineScale,
} from "@/timekeep/timelineScale";
import { updateEntry } from "@/timekeep/update";
import type { TimekeepViewState } from "@/timekeep/view";

type Drag = {
	block: TimelineBlock;
	edge: TimelineEdge;
	x: number;
	width: number;
	scale: TimelineScale;
	value: number;
	pointerId: number;
	handle: HTMLElement;
	moved: boolean;
};

type TimelineSession = {
	selection: { path: number[]; fingerprint: string } | null;
	edge: TimelineEdge;
	focusTime: number | null;
};
// The tracker view-state store survives Markdown rerenders and is distinct for each tracker.
const sessions = new WeakMap<Store<TimekeepViewState>, TimelineSession>();

/** A display-only projection until a complete resize is committed. Never mounted on phones. */
export class TimesheetTimeline extends DomComponent {
	private selectedId: number | null = null;
	private session: TimelineSession;
	private get edge(): TimelineEdge {
		return this.session.edge;
	}
	private set edge(value: TimelineEdge) {
		this.session.edge = value;
	}
	private get focusTime(): number | null {
		return this.session.focusTime;
	}
	private set focusTime(value: number | null) {
		this.session.focusTime = value;
	}
	private drag: Drag | null = null;
	private workScale: TimelineScale = linearTimelineScale(0, 1);
	private trackScales = new WeakMap<HTMLElement, TimelineScale>();
	private message = "Select a block, then drag an edge. Arrow keys adjust by one minute.";

	constructor(
		containerEl: HTMLElement,
		private timekeep: Store<Timekeep>,
		private viewState: Store<TimekeepViewState>,
		private settings: Store<TimekeepSettings>
	) {
		super(containerEl);
		let session = sessions.get(viewState);
		if (!session) {
			session = { selection: null, edge: "start", focusTime: null };
			sessions.set(viewState, session);
		}
		this.session = session;
	}

	onload(): void {
		super.onload();
		if (Platform.isPhone) return;
		const wrapper = this.containerEl.createDiv({ cls: "timekeep-df-timeline" });
		this.wrapperEl = wrapper;
		this.register(
			this.timekeep.subscribe(() => {
				this.cancelDrag();
				this.render();
			})
		);
		this.register(
			this.viewState.subscribe(() => {
				this.cancelDrag();
				this.focusTime = null;
				this.render();
			})
		);
		this.register(
			this.settings.subscribe(() => {
				this.cancelDrag();
				this.render();
			})
		);
		this.registerDomEvent(wrapper, "click", (event) => this.onClick(event));
		this.registerDomEvent(wrapper, "change", (event) => {
			const target = event.target as HTMLSelectElement;
			if (target.matches("select[data-block-picker]")) this.select(Number(target.value));
		});
		this.registerDomEvent(wrapper, "pointerdown", (event) => this.beginDrag(event));
		this.registerDomEvent(wrapper, "lostpointercapture", () => {
			if (this.drag) {
				this.cancelDrag();
				this.render();
			}
		});
		const doc = wrapper.ownerDocument;
		this.registerDomEvent(doc, "pointermove", (event) => this.moveDrag(event));
		this.registerDomEvent(doc, "pointerup", (event) => this.endDrag(event));
		this.registerDomEvent(doc, "pointercancel", (event) => {
			if (event.pointerId === this.drag?.pointerId) {
				this.cancelDrag();
				this.render();
			}
		});
		this.registerDomEvent(wrapper, "keydown", (event) => {
			const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]");
			if (!handle || this.drag || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
			event.preventDefault();
			this.nudge(
				Number(handle.dataset.blockId),
				handle.dataset.edge as TimelineEdge,
				event.key === "ArrowLeft" ? -1 : 1
			);
		});
		const win = doc.defaultView;
		if (win) {
			this.registerDomEvent(win, "blur", () => {
				this.cancelDrag();
				this.render();
			});
			this.registerDomEvent(win, "resize", () => {
				this.cancelDrag();
				this.render();
			});
		}
		this.registerInterval(
			window.setInterval(() => {
				if (
					!this.drag &&
					getTimelineBlocks(this.timekeep.getState().entries, Date.now()).some(
						(b) => b.running
					)
				)
					this.render();
			}, 60_000)
		);
		this.register(() => this.cancelDrag());
		this.render();
	}

	private editWindow() {
		return timelineEditWindow(this.viewState.getState(), this.workScale);
	}

	private blocks(): TimelineBlock[] {
		return getTimelineBlocks(this.timekeep.getState().entries, Date.now());
	}

	private select(id: number): void {
		this.cancelDrag();
		this.selectedId = id;
		const path = timelineEntryPath(this.timekeep.getState().entries, id);
		const entry = path ? timelineEntryAtPath(this.timekeep.getState().entries, path) : null;
		this.session.selection =
			path && entry
				? { path, fingerprint: JSON.stringify(stripEntryRuntimeData(entry)) }
				: null;
		this.focusTime = null;
		const block = this.blocks().find((b) => b.entry.id === id);
		const window = this.editWindow();
		this.edge =
			block && block.start < window.start.valueOf() && !block.running ? "end" : "start";
		this.render();
	}

	private onClick(event: MouseEvent): void {
		const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
		if (!target) return;
		const action = target.dataset.action;
		if (action === "select") this.select(Number(target.dataset.blockId));
		else if (action === "start" || action === "end") {
			this.edge = action;
			this.focusTime = null;
			this.render();
		} else if (action === "earlier" || action === "later") {
			if (this.focusTime !== null)
				this.focusTime += (action === "earlier" ? -1 : 1) * 30 * 60_000;
			this.render();
		} else if (action === "minus" || action === "plus") {
			if (this.selectedId !== null)
				this.nudge(this.selectedId, this.edge, action === "minus" ? -1 : 1);
		}
	}

	private button(parent: HTMLElement, text: string, action: string): HTMLButtonElement {
		return parent.createEl("button", {
			text,
			attr: { type: "button", "data-action": action, "data-focus": action },
		});
	}

	private render(): void {
		const wrapper = this.wrapperEl;
		if (!wrapper) return;
		const focus = (wrapper.ownerDocument.activeElement as HTMLElement | null)?.dataset.focus;
		wrapper.replaceChildren();
		const entries = this.timekeep.getState().entries;
		const selection = this.session.selection;
		const storedSelection = selection ? timelineEntryAtPath(entries, selection.path) : null;
		this.selectedId =
			storedSelection &&
			JSON.stringify(stripEntryRuntimeData(storedSelection)) === selection?.fingerprint
				? storedSelection.id
				: null;
		const blocks = this.blocks();
		this.workScale = workdayTimelineScale(
			this.viewState.getState(),
			this.settings.getState(),
			blocks
		);
		const window = this.editWindow();
		const visible = blocks.filter((block) => timelineBlockVisible(block, window));
		const selected = visible.find((block) => block.entry.id === this.selectedId);
		if (!selected) {
			this.selectedId = null;
			this.focusTime = null;
		}
		const toolbar = wrapper.createDiv({ cls: "timekeep-df-timeline-toolbar" });
		const picker = toolbar.createEl("select", {
			attr: {
				"aria-label": "Select timeline block",
				"data-block-picker": "",
				"data-focus": "picker",
			},
		});
		picker.createEl("option", { text: "Select a block…", attr: { value: "" } });
		for (const block of visible)
			picker.createEl("option", {
				text: `${block.activityName} · ${block.entry.name} · ${moment(block.start).format("D MMM HH:mm")}`,
				attr: { value: String(block.entry.id) },
			});
		picker.value = selected ? String(selected.entry.id) : "";
		const scale = this.workScale;
		const configuredStart = this.settings.getState().workingHoursStart;
		const configuredEnd = this.settings.getState().workingHoursEnd;
		wrapper.createDiv({
			cls: "timekeep-df-timeline-hint",
			text: `Configured workday ${configuredStart}–${configuredEnd}; the scale expands to recorded time, including days off.`,
		});
		if (scale.segments.length > 1)
			wrapper.createDiv({
				cls: "timekeep-df-timeline-hint",
				text: "Untracked nights and days off are omitted from the scale.",
			});

		const overview = wrapper.createDiv({ cls: "timekeep-df-timeline-overview" });
		const header = overview.createDiv({ cls: "timekeep-df-timeline-row" });
		header.createDiv({ cls: "timekeep-df-timeline-name", text: "Activity" });
		this.axis(header, scale);
		const groups = new Map<number, TimelineBlock[]>();
		for (const block of visible) {
			if (!timelineIntervalVisible(scale, block.start, block.end)) continue;
			const group = groups.get(block.activityId) ?? [];
			group.push(block);
			groups.set(block.activityId, group);
		}
		for (const group of groups.values()) {
			const row = overview.createDiv({ cls: "timekeep-df-timeline-row" });
			row.createDiv({ cls: "timekeep-df-timeline-name", text: group[0].activityName });
			const track = this.track(row, scale);
			const laneEnds: number[] = [];
			for (const block of group) {
				// Separate visually crowded short sessions as well as genuinely overlapping sessions.
				const span = scale.duration;
				const start = timelineOffset(scale, block.start);
				let lane = laneEnds.findIndex((end) => end + span * 0.012 <= start);
				if (lane < 0) lane = laneEnds.length;
				laneEnds[lane] = Math.max(timelineOffset(scale, block.end), start + span * 0.015);
				this.bar(track, block, lane, blocks, "overview");
			}
			track.style.height = `${Math.max(1, laneEnds.length) * 38 + 8}px`;
		}
		if (!visible.length) wrapper.createEl("p", { text: "No tracked blocks in this period." });
		if (selected) {
			const detail = wrapper.createDiv({ cls: "timekeep-df-timeline-detail" });
			detail.createEl("strong", {
				text: `${selected.activityName} · ${selected.entry.name}`,
			});
			detail.createDiv({
				cls: "timekeep-df-timeline-times",
				attr: { "data-times": "" },
				text: this.describe(selected),
			});
			const controls = detail.createDiv({ cls: "timekeep-df-timeline-toolbar" });
			for (const edge of ["start", "end"] as const) {
				const button = this.button(controls, edge === "start" ? "Start" : "End", edge);
				button.setAttribute("aria-pressed", String(edge === this.edge));
				button.disabled = edge === "end" && selected.running;
			}
			const bounds = timelineEdgeBounds(selected, this.edge, blocks, window, Date.now());
			for (const [label, action] of [
				["−1 min", "minus"],
				["+1 min", "plus"],
			]) {
				const button = this.button(controls, label, action);
				button.disabled = !bounds;
			}
			const endpoint = this.edge === "start" ? selected.start : selected.end;
			if (this.focusTime === null) this.focusTime = endpoint;
			this.button(controls, "Earlier", "earlier");
			this.button(controls, "Later", "later");
			detail.createDiv({
				cls: "timekeep-df-timeline-hint",
				text: "Precision view · one hour · drag a handle or use ±1 min",
			});
			const start = this.focusTime - 30 * 60_000;
			const end = this.focusTime + 30 * 60_000;
			const precisionScale = linearTimelineScale(start, end);
			this.axis(detail, precisionScale);
			const track = this.track(detail, precisionScale);
			for (const block of blocks) {
				if (
					block.entry.id === selected.entry.id ||
					block.end <= start ||
					block.start >= end
				)
					continue;
				const neighbour = track.createDiv({
					cls: "timekeep-df-timeline-neighbour",
					attr: {
						title: `${block.activityName}: ${this.describe(block)}`,
					},
				});
				this.position(neighbour, block.start, block.end, precisionScale);
			}
			this.bar(track, selected, 0, blocks, "precision");
			if (!bounds)
				detail.createEl("p", {
					text:
						selected.running && this.edge === "end"
							? "The running end follows the current time."
							: "This endpoint cannot be resized here. Choose a period containing it, or select the other edge.",
				});
		}
		wrapper.createDiv({
			cls: "timekeep-df-timeline-status",
			text: this.message,
			attr: { role: "status", "aria-live": "polite", "data-status": "" },
		});
		if (focus)
			wrapper
				.querySelector<HTMLElement>(`[data-focus="${focus}"]`)
				?.focus({ preventScroll: true });
	}

	private describe(block: TimelineBlock, edge?: TimelineEdge, value?: number): string {
		const start = edge === "start" ? value! : block.start;
		const end = edge === "end" ? value! : block.end;
		return `${moment(start).format("D MMM YYYY HH:mm:ss")} → ${block.running ? "Now" : moment(end).format("D MMM YYYY HH:mm:ss")} · ${Math.round((end - start) / 6000) / 10} min`;
	}

	private axis(parent: HTMLElement, scale: TimelineScale): void {
		const axis = parent.createDiv({ cls: "timekeep-df-timeline-axis" });
		if (!scale.duration) return;
		const format = scale.segments.length === 1 ? "HH:mm" : "D MMM";
		for (let i = 0; i <= 4; i++) {
			const time = moment(
				timelineTime(scale, (scale.duration * i) / 4, i === 4 ? "end" : "start")
			);
			axis.createSpan({
				text: time.format(format),
				attr: { title: time.format("D MMM YYYY HH:mm Z") },
			});
		}
	}

	private track(parent: HTMLElement, scale: TimelineScale): HTMLElement {
		const track = parent.createDiv({
			cls: "timekeep-df-timeline-track",
			attr: {
				"data-scale-start": String(scale.segments[0]?.start),
				"data-scale-end": String(scale.segments.at(-1)?.end),
				"data-scale-duration": String(scale.duration),
			},
		});
		this.trackScales.set(track, scale);
		return track;
	}

	private position(el: HTMLElement, start: number, end: number, scale: TimelineScale): void {
		const left = timelineOffset(scale, start) / scale.duration;
		const right = timelineOffset(scale, end) / scale.duration;
		el.style.left = `${left * 100}%`;
		el.style.width = `${(right - left) * 100}%`;
		el.hidden = !timelineIntervalVisible(scale, start, end);
	}

	private bar(
		track: HTMLElement,
		block: TimelineBlock,
		lane: number,
		blocks: TimelineBlock[],
		kind: string
	): void {
		const scale = this.trackScales.get(track)!;
		const start = scale.segments[0].start,
			end = scale.segments.at(-1)!.end;
		const selected = block.entry.id === this.selectedId;
		const bar = track.createDiv({
			cls: "timekeep-df-timeline-bar",
			attr: { "data-bar-id": String(block.entry.id) },
		});
		bar.classList.toggle("is-selected", selected);
		bar.classList.toggle("is-running", block.running);
		bar.style.top = `${lane * 38 + 5}px`;
		this.position(bar, block.start, block.end, scale);
		const select = this.button(
			bar,
			`${block.start < start ? "‹ " : ""}${block.entry.name}${block.end > end ? " ›" : ""}`,
			"select"
		);
		select.dataset.blockId = String(block.entry.id);
		select.dataset.focus = `${kind}-block-${block.entry.id}`;
		select.classList.add("timekeep-df-timeline-bar-label");
		select.setAttribute(
			"aria-label",
			`${block.activityName} · ${block.entry.name}: ${this.describe(block)}`
		);
		select.setAttribute("aria-pressed", String(selected));
		select.title = select.getAttribute("aria-label")!;
		if (!selected) return;
		const window = this.editWindow();
		for (const edge of ["start", "end"] as const) {
			const value = edge === "start" ? block.start : block.end;
			if (
				!timelineTimeVisible(scale, value) ||
				!timelineEdgeBounds(block, edge, blocks, window, Date.now())
			)
				continue;
			bar.createEl("button", {
				cls: "timekeep-df-timeline-handle",
				text: "⋮",
				attr: {
					type: "button",
					"data-edge": edge,
					"data-block-id": String(block.entry.id),
					"data-focus": `${kind}-${block.entry.id}-${edge}`,
					"aria-label": `Resize ${edge} of ${block.activityName}, ${block.entry.name}`,
					title: `Drag ${edge}; arrow keys adjust by one minute`,
				},
			});
		}
	}

	private beginDrag(event: PointerEvent): void {
		if (event.button !== 0 || this.drag) return;
		const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]");
		const track = handle?.closest<HTMLElement>("[data-scale-start]");
		if (!handle || !track) return;
		const block = this.blocks().find((b) => b.entry.id === Number(handle.dataset.blockId));
		if (!block) return;
		const width = track.getBoundingClientRect().width;
		if (width <= 0) return;
		event.preventDefault();
		this.edge = handle.dataset.edge as TimelineEdge;
		handle.focus({ preventScroll: true });
		this.drag = {
			block,
			edge: this.edge,
			x: event.clientX,
			width,
			scale: this.trackScales.get(track)!,
			value: this.edge === "start" ? block.start : block.end,
			pointerId: event.pointerId,
			handle,
			moved: false,
		};
		handle.setPointerCapture?.(event.pointerId);
		this.wrapperEl?.classList.add("is-dragging");
	}

	private moveDrag(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (!drag.moved && Math.abs(event.clientX - drag.x) < 2) return;
		event.preventDefault();
		drag.moved = true;
		const original = drag.edge === "start" ? drag.block.start : drag.block.end;
		const offset =
			timelineOffset(drag.scale, original) +
			((event.clientX - drag.x) / drag.width) * drag.scale.duration;
		const candidate = timelineTime(drag.scale, offset, drag.edge);
		const value = snapTimelineEdge(
			drag.block,
			drag.edge,
			candidate,
			this.blocks(),
			this.editWindow(),
			Date.now(),
			Math.min(5 * 60_000, (drag.scale.duration / drag.width) * 8)
		);
		if (value === null) return;
		drag.value = value;
		const start = drag.edge === "start" ? value : drag.block.start;
		const end = drag.edge === "end" ? value : drag.block.end;
		this.wrapperEl
			?.querySelectorAll<HTMLElement>(`[data-bar-id="${drag.block.entry.id}"]`)
			.forEach((bar) => {
				const track = bar.parentElement!;
				this.position(bar, start, end, this.trackScales.get(track)!);
			});
		const times = this.wrapperEl?.querySelector<HTMLElement>("[data-times]");
		if (times) times.textContent = this.describe(drag.block, drag.edge, value);
		const status = this.wrapperEl?.querySelector<HTMLElement>("[data-status]");
		if (status)
			status.textContent = `${drag.edge === "start" ? "Start" : "End"}: ${moment(value).format("D MMM HH:mm")} · release to save`;
	}

	private endDrag(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		this.moveDrag(event);
		this.cancelDrag();
		if (drag.moved) this.commit(drag.block, drag.edge, drag.value);
		else this.render();
	}

	private cancelDrag(): void {
		const drag = this.drag;
		this.drag = null;
		if (drag?.handle.hasPointerCapture?.(drag.pointerId))
			drag.handle.releasePointerCapture(drag.pointerId);
		this.wrapperEl?.classList.remove("is-dragging");
	}

	private nudge(id: number, edge: TimelineEdge, minutes: number): void {
		const blocks = this.blocks();
		const block = blocks.find((b) => b.entry.id === id);
		if (!block) return;
		const value = snapTimelineEdge(
			block,
			edge,
			(edge === "start" ? block.start : block.end) + minutes * 60_000,
			blocks,
			this.editWindow(),
			Date.now()
		);
		if (value !== null) this.commit(block, edge, value);
	}

	private commit(block: TimelineBlock, edge: TimelineEdge, value: number): void {
		const state = this.timekeep.getState();
		const updated = resizeTimelineBlock(
			state.entries,
			block.entry,
			edge,
			value,
			this.editWindow(),
			Date.now()
		);
		if (!updated) {
			this.message =
				"The block changed or this time is no longer available. Please try again.";
			this.render();
			return;
		}
		if (value === (edge === "start" ? block.start : block.end)) {
			this.message = "This edge has reached its limit. Neighbouring blocks stay unchanged.";
			this.render();
			return;
		}
		const entries = updateEntry(state.entries, block.entry.id, updated);
		this.message = `Updated ${edge} to ${moment(value).format("D MMM HH:mm")}.`;
		this.focusTime = value;
		const path = timelineEntryPath(entries, updated.id)!;
		this.session.selection = {
			path,
			fingerprint: JSON.stringify(stripEntryRuntimeData(updated)),
		};
		this.timekeep.setState({ ...state, entries });
		this.render();
	}
}
