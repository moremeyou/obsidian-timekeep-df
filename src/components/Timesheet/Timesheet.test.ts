// @vitest-environment happy-dom

import type { App } from "obsidian";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomOutputFormat } from "@/output";

import { createMockContainer, MockVault } from "@/__mocks__/obsidian";
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

	it("opens a historical Activity editor on the first Add click", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00"));
		component.load();
		component.viewState.setState({
			mode: TimekeepViewMode.DAY,
			anchorDate: "2026-08-11",
			followCurrent: false,
		});
		const addForm = component.wrapperEl?.querySelector<HTMLFormElement>(
			".timekeep-df-utility-cell--add form"
		);
		addForm!.querySelector<HTMLInputElement>(".timekeep-df-name")!.value =
			"Historical Activity";

		addForm!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

		expect(component.wrapperEl?.querySelector("form.timekeep-df-editing")).not.toBeNull();
		expect(
			component.wrapperEl?.querySelector<HTMLInputElement>(
				'form.timekeep-df-editing input[name="name"]'
			)?.value
		).toBe("Historical Activity");
		vi.useRealTimers();
	});
});
