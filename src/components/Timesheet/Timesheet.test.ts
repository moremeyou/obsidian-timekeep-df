// @vitest-environment happy-dom

import type { App } from "obsidian";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomOutputFormat } from "@/output";

import { createMockContainer, MockModal, MockPlatform, MockVault } from "@/__mocks__/obsidian";
import { defaultSettings, type TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";

import { Timesheet } from "./Timesheet";

import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";
import { TimekeepViewMode } from "@/timekeep/view";

import { TimekeepAutocomplete } from "@/service/autocomplete";
import { TimekeepRegistry } from "@/service/registry";

describe("Timesheet", () => {
	let containerEl: HTMLElement;
	let vault: MockVault;
	let app: App;
	let timekeep: Store<Timekeep>;
	let settings: Store<TimekeepSettings>;
	let customOutputFormats: Store<Record<string, CustomOutputFormat>>;
	let registry: TimekeepRegistry;
	let autocomplete: TimekeepAutocomplete;
	let component: Timesheet;

	beforeEach(() => {
		MockPlatform.isMobile = false;
		MockPlatform.isPhone = false;
		app = {} as App;
		timekeep = createStore(defaultTimekeep());
		vault = new MockVault();
		containerEl = createMockContainer();
		settings = createStore(defaultSettings);
		customOutputFormats = createStore({});
		registry = new TimekeepRegistry(vault.asVault(), settings);
		autocomplete = new TimekeepAutocomplete(registry, settings);

		component = new Timesheet(
			containerEl,
			app,
			timekeep,
			settings,
			customOutputFormats,
			autocomplete
		);
	});

	it("should load without error", () => {
		expect(() => component.load()).not.toThrow();
	});

	it("uses its owning container as a responsive query host on desktop", () => {
		component.load();

		expect(containerEl.classList.contains(Timesheet.RESPONSIVE_HOST_CLASS)).toBe(true);

		component.unload();
		expect(containerEl.classList.contains(Timesheet.RESPONSIVE_HOST_CLASS)).toBe(false);
	});

	it("leaves the existing mobile layout outside the desktop query system", () => {
		MockPlatform.isMobile = true;
		component.load();

		expect(containerEl.classList.contains(Timesheet.RESPONSIVE_HOST_CLASS)).toBe(false);
	});

	it("puts calendar controls above the current-work focus panel and table", () => {
		component.load();
		const children = Array.from(component.wrapperEl?.children ?? []);
		const focusIndex = children.findIndex((child) =>
			child.classList.contains("timekeep-df-focus-panel")
		);
		const viewIndex = children.findIndex((child) =>
			child.classList.contains("timekeep-df-view-controls")
		);
		const tableIndex = children.findIndex((child) =>
			child.classList.contains("timekeep-df-table-wrapper")
		);

		expect(viewIndex).toBe(0);
		expect(focusIndex).toBeGreaterThan(viewIndex);
		expect(tableIndex).toBeGreaterThan(focusIndex);
	});

	it("places Add Activity and Export in a two-column utility grid below the table", () => {
		component.load();

		const children = Array.from(component.wrapperEl?.children ?? []);
		const tableIndex = children.findIndex((child) =>
			child.classList.contains("timekeep-df-table-wrapper")
		);
		const utilityGridIndex = children.findIndex((child) =>
			child.classList.contains("timekeep-df-utility-grid")
		);
		const utilityGrid = component.wrapperEl?.querySelector(".timekeep-df-utility-grid");
		const headings = Array.from(
			utilityGrid?.querySelectorAll(".timekeep-df-utility-heading") ?? []
		).map((heading) => heading.textContent);

		expect(tableIndex).toBeGreaterThanOrEqual(0);
		expect(utilityGridIndex).toBeGreaterThan(tableIndex);
		expect(headings).toEqual(["ADD ACTIVITY", "EXPORT"]);
		expect(utilityGrid?.classList.contains("timekeep-df-utility-card")).toBe(true);
		expect(utilityGrid?.querySelector(".timekeep-df-utility-cell--add form")).not.toBeNull();
		expect(
			utilityGrid?.querySelector(".timekeep-df-utility-cell--export .timekeep-df-actions")
		).not.toBeNull();
		expect(
			utilityGrid?.querySelector(".timekeep-df-utility-mobile-export-label")?.textContent
		).toBe("EXPORT:");
	});

	it("keeps Add Activity enabled while viewing a historical range", () => {
		component.load();
		component.viewState.setState({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2020-01-01",
			followCurrent: false,
		});

		const addButton = component.wrapperEl?.querySelector<HTMLButtonElement>(
			'.timekeep-df-utility-cell--add button[aria-label="Add Activity"]'
		);
		expect(addButton?.disabled).toBe(false);
	});

	it.each(["normal", "timeline"] as const)(
		"opens a historical Activity editor on the first Add click in %s view",
		(activityView) => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-08-12T12:00:00"));
			component.load();
			component.viewState.setState({
				mode: TimekeepViewMode.DAY,
				anchorDate: "2026-08-11",
				activityView,
				followCurrent: false,
			});
			const addForm = component.wrapperEl?.querySelector<HTMLFormElement>(
				".timekeep-df-utility-cell--add form"
			);
			addForm!.querySelector<HTMLInputElement>(".timekeep-df-name")!.value =
				"Historical Activity";

			addForm!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

			const modal = Array.from(MockModal.instances).find((instance) =>
				instance.modalEl.classList.contains("timekeep-df-row-edit-modal")
			);
			expect(modal).toBeDefined();
			expect(component.wrapperEl?.querySelector("form.timekeep-df-editing")).toBeNull();
			expect(
				modal?.contentEl.querySelector<HTMLInputElement>(
					'form.timekeep-df-editing input[name="name"]'
				)?.value
			).toBe("Historical Activity");
			vi.useRealTimers();
		}
	);

	it.each([false, true])(
		"places Normal and Timeline tabs directly above the table on mobile-platform=%s (desktop/tablet)",
		(isMobile) => {
			MockPlatform.isMobile = isMobile;
			component.load();
			const tabs = containerEl.querySelector('[role="tablist"]')!;
			expect(Array.from(tabs.children).map((tab) => tab.textContent)).toEqual([
				"Normal",
				"Timeline",
			]);
			expect(tabs.nextElementSibling?.classList.contains("timekeep-df-table-wrapper")).toBe(
				true
			);
			const initialRange = component.viewState.getState();
			(tabs.children[1] as HTMLButtonElement).click();
			expect(component.viewState.getState()).toMatchObject(initialRange);
			expect(
				containerEl.querySelector<HTMLElement>(".timekeep-df-table-wrapper")!.hidden
			).toBe(true);
			expect(containerEl.querySelector(".timekeep-df-timeline")).not.toBeNull();
			(tabs.children[0] as HTMLButtonElement).click();
			expect(
				containerEl.querySelector<HTMLElement>(".timekeep-df-table-wrapper")!.hidden
			).toBe(false);
			expect(containerEl.querySelector(".timekeep-df-timeline")).toBeNull();
			component.unload();
		}
	);

	it("keeps phones on the normal table even with a retained timeline preference", () => {
		MockPlatform.isPhone = true;
		MockPlatform.isMobile = true;
		component.viewState.setState({
			...component.viewState.getState(),
			activityView: "timeline",
		});
		component.load();
		expect(containerEl.querySelector('[role="tablist"]')).toBeNull();
		expect(containerEl.querySelector(".timekeep-df-timeline")).toBeNull();
		expect(containerEl.querySelector<HTMLElement>(".timekeep-df-table-wrapper")!.hidden).toBe(
			false
		);
		component.unload();
		MockPlatform.isPhone = false;
	});

	it("supports arrow-key tab selection without resetting the range", () => {
		component.load();
		const tabs = containerEl.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(tabs[1].getAttribute("aria-selected")).toBe("true");
		expect(tabs[0].tabIndex).toBe(-1);
		component.unload();
	});
});
