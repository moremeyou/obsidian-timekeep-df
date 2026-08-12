// @vitest-environment happy-dom

import type { App } from "obsidian";

import { beforeEach, describe, expect, it } from "vitest";

import type { CustomOutputFormat } from "@/output";

import { createMockContainer, MockVault } from "@/__mocks__/obsidian";
import { defaultSettings, type TimekeepSettings } from "@/settings";
import { createStore, type Store } from "@/store";

import { Timesheet } from "./Timesheet";

import { defaultTimekeep, type Timekeep } from "@/timekeep/schema";

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
		expect(headings).toEqual(["Add Activity", "Export"]);
		expect(utilityGrid?.querySelector(".timekeep-df-utility-cell--add form")).not.toBeNull();
		expect(
			utilityGrid?.querySelector(".timekeep-df-utility-cell--export .timekeep-df-actions")
		).not.toBeNull();
	});
});
