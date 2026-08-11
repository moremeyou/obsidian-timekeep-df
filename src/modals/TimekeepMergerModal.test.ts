// @vitest-environment happy-dom

import type { App } from "obsidian";

import { describe, expect, it } from "vitest";

import { MockVault } from "@/__mocks__/obsidian";
import { defaultSettings } from "@/settings";
import { createStore } from "@/store";

import { TimekeepMergerModal } from "./TimekeepMergerModal";

import { TimekeepRegistry } from "@/service/registry";

describe("TimekeepMergerModal", () => {
	it("uses unique fork-scoped checkbox IDs with matching labels", () => {
		const vault = new MockVault();
		const settings = createStore(defaultSettings);
		const registry = new TimekeepRegistry(vault.asVault(), settings);
		const app = { vault: vault.asVault() } as App;
		const file = vault.addFile("tracker.timekeep-df", '{"entries":[]}');

		const first = new TimekeepMergerModal(app, registry, settings);
		const second = new TimekeepMergerModal(app, registry, settings);
		for (const modal of [first, second]) {
			modal.listContainer = modal.contentEl.createDiv();
			modal.filteredResults = [{ id: 7, file, timekeep: { entries: [] } }];
			modal.renderList();
		}

		const checkboxes = [first, second].map(
			(modal) =>
				modal.contentEl.querySelector<HTMLInputElement>(".timekeep-df-merge-item-checkbox")!
		);
		const labels = [first, second].map(
			(modal) => modal.contentEl.querySelector<HTMLLabelElement>("label")!
		);

		expect(new Set(checkboxes.map((checkbox) => checkbox.id)).size).toBe(2);
		expect(
			checkboxes.every((checkbox) => /^timekeep-df-merger-\d+-item-7$/.test(checkbox.id))
		).toBe(true);
		expect(labels.map((label) => label.htmlFor)).toEqual(
			checkboxes.map((checkbox) => checkbox.id)
		);
		expect(document.querySelectorAll("[id='timekeep-7']")).toHaveLength(0);
	});
});
