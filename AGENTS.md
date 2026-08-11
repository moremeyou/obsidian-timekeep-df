# Timekeep DF Agent Guide

This file governs work in this repository. Timekeep DF is a public development derivative of [Jacob Tread's Obsidian Timekeep](https://github.com/jacobtread/obsidian-timekeep), not an upstream release or an Obsidian marketplace submission. Preserve upstream history, attribution, user documentation, the MIT license, and the bundled font license.

Upstream's `CONTRIBUTING.md` prohibits LLM-generated code, documentation, issues, and artwork. The owner has authorized agent work only in this derivative. Never send derivative changes to upstream through a push, pull request, issue, or other contribution channel.

## Baseline and repository roles

- Exact upstream baseline: `3fb48a36fccf9b4595018ebf333de120490c75d1` from upstream `main`.
- Source version: `2.1.3`; `git describe` at the baseline is `2.1.3-5-g3fb48a3`, so the baseline is five commits after the `2.1.3` tag rather than the tagged release itself.
- `origin`: `https://github.com/moremeyou/obsidian-timekeep-df.git`, the owner's writable **public** fork.
- `upstream`: `https://github.com/jacobtread/obsidian-timekeep.git`, a read-only source of upstream history. Fetch from it when requested; never push to it.
- Setup branch: `setup/local-dev-plugin`.
- Canonical local checkout: `/Users/davidfasullo/Library/CloudStorage/GoogleDrive-moremeyou@gmail.com/My Drive/GIT/obsidian-timekeep-df`.
- Obsidian vault: `/Users/davidfasullo/Desktop/dBrain`.
- Fork plugin directory: `/Users/davidfasullo/Desktop/dBrain/.obsidian/plugins/obsidian-timekeep-df`.
- Official plugin directory, which this project must never modify: `/Users/davidfasullo/Desktop/dBrain/.obsidian/plugins/timekeep`.

The fork and every committed path or document are public. Do not commit credentials, tokens, private notes, vault content, machine secrets, or generated plugin data.

## Identity and compatibility invariants

These identifiers are immutable unless the owner explicitly starts a compatibility migration:

| Surface                    | Required value                                    |
| -------------------------- | ------------------------------------------------- |
| Manifest/package plugin ID | `obsidian-timekeep-df`                            |
| Display name               | `Timekeep DF`                                     |
| Internal custom view type  | `timekeep-df`                                     |
| Runtime API lookup         | `app.plugins.plugins["obsidian-timekeep-df"].api` |

Keep `registerView`, the `.timekeep` extension's target view, `TimekeepFileView.getViewType()`, and registry leaf lookup aligned to `timekeep-df`. Do not globally replace the word `timekeep`.

The following are deliberate user-data compatibility surfaces and must remain unchanged during setup or ordinary refactoring:

- Markdown fenced-code language: `timekeep` (the opening fence is three backticks followed by `timekeep`).
- Standalone file extension: `.timekeep`.
- Stored JSON format: root `entries`, with entry `name`, `startTime`, `endTime`, and `subEntries`; group `collapsed` and `folder` fields remain compatible. Numeric IDs are runtime-only and must continue to be stripped before save.

Changing the manifest ID isolates Obsidian's plugin settings and data under `.obsidian/plugins/obsidian-timekeep-df/data.json`; it does not migrate official Timekeep settings automatically. The Markdown blocks and `.timekeep` files in the vault remain shared user data. Local command IDs may stay unchanged because Obsidian namespaces them with the manifest ID.

## Simultaneous activation is not verified

The official plugin and Timekeep DF may be installed side by side, but keep official Timekeep disabled whenever Timekeep DF is enabled for development or testing. Do not claim simultaneous activation is safe until a later compatibility decision and explicit verification resolve all of these collisions:

- Both register the `timekeep` Markdown processor and can render or write the same block.
- Both register the `.timekeep` extension to different custom view types; effective ownership may depend on load/registration behavior.
- Both scan and can modify the same Markdown and `.timekeep` vault files.
- Both add similar status-bar items and a `New Timekeep` folder-menu item. Commands are identity-namespaced, but these surfaces are duplicated.
- Styles use unscoped global `.timekeep-*` selectors. Future fork styling can affect official-plugin DOM and vice versa.
- Existing document-global DOM IDs can collide, including `timekeepBlockName`, `timekeepSuggestions`, `timekeepSuggestion-*`, `merge-select-all`, and `timekeep-*`; some are also ARIA reference targets.

There are no custom URI/protocol handlers, custom elements, browser-storage keys, editor extensions, or explicit browser-global application registrations in the baseline.

## Architecture map

- `src/main.ts` is the composition root. It loads and saves settings, constructs the public API, registry, and autocomplete service, and registers commands, the Markdown processor, custom file view/extension, folder menu, and status bar.
- `src/timekeep/` is the domain layer: Valibot schema and serialization, parser, queries, sorting, creation, immutable update/start/stop operations, and runtime IDs.
- `src/views/TimekeepMarkdownView.ts` and `src/views/TimekeepFileView.ts` adapt Markdown blocks and standalone files into the shared `TimekeepView`.
- `src/save/` contains persistence adapters. Markdown writes replace only the located fenced block with `vault.process`; standalone files serialize the complete timekeep JSON.
- `src/components/` contains the Obsidian component tree. `Timesheet` composes counters, start/running controls, the table, and export actions around small observable stores from `src/store.ts`.
- `src/service/registry.ts` indexes Markdown and `.timekeep` files, follows vault create/modify/rename/delete events, and feeds autocomplete, status-bar, locator, and merged-export workflows. `src/service/autocomplete.ts` derives entry-name suggestions from it.
- `src/commands/` and `src/modals/` are Obsidian entry points and multi-file workflows.
- `src/export/` implements JSON/raw, CSV, Markdown-table, and locally generated PDF output.
- `src/api.ts` exposes domain modules, utilities, settings/custom-format stores, registry/autocomplete APIs, file creation, stop operations, and custom output-format registration. Legacy top-level plugin methods remain for compatibility.
- `vite.config.js` bundles `src/main.ts` as CommonJS and `src/styles.css`; fonts are inlined. `scripts/build.js` copies the manifest into `dist/` after the Vite build.
- Tests live beside production modules as `*.test.ts`; fixtures are under `src/**/__fixtures__`, and Obsidian/Electron mocks are under `src/__mocks__/`.

## Toolchain and commands

CI selects Node 20. Current Vite and related dependencies require an effective minimum of Node `20.19`; use Node 20.19 or newer within a supported major. The package manager is pinned by `package.json` to pnpm `10.33.4`.

Preserve `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `patches/pdfmake.patch`. Install with the frozen lockfile; do not use `npm install`, regenerate the lockfile, or modernize dependencies as incidental work.

```sh
pnpm install --frozen-lockfile  # exact dependency install
pnpm dev                        # watch build into the local test-vault plugin folder
pnpm fmt:check                  # formatting verification
pnpm fmt                        # formatter; use only when formatting changes are intended
pnpm lint                       # type-aware lint
pnpm lint:fix                   # automatic lint fixes; inspect its diff
pnpm test                       # Vitest run with V8 coverage
pnpm build                      # production build into dist/
pnpm copy:df                    # validate and deploy an already-current build
pnpm deploy:df                  # production build, then deploy, then verify
```

`pnpm run version` updates `manifest.json` and `versions.json` and stages them; use it only for an intentional version change. Do not create a release or marketplace submission during development setup.

`pnpm dev` watches the repository and copies `main.js`, `styles.css`, and `manifest.json` into `test-vault/.obsidian/plugins/<manifest.id>`. The test-vault plugin state is ignored. Only `test-vault/Dataview-Longest-Ordered-Example.md` and `test-vault/Obsidian Timekeep.md` are tracked examples; preserve edits to them and never treat the test vault as disposable user state.

## Generated artifacts

Production output is ignored and must not be committed unless the owner deliberately changes release policy. The exact runtime whitelist is:

1. `dist/manifest.json`
2. `dist/main.js`
3. `dist/styles.css`

No other repository file belongs in the deployed plugin directory. `dist/`, root `main.js`, source maps, `coverage/`, test-vault runtime state, and `data.json` are ignored. Font assets are inlined into the bundle, so they are not separate runtime files.

## Safe deployment contract

Deployment is strictly sequential: **build first, copy second, verify third**.

- `pnpm deploy:df` validates the fork ID/name/internal view type, runs and awaits the production build, copies only the three whitelisted files, then verifies identity, the embedded build identifier, and SHA-256 equality for every source/deployed pair.
- `pnpm copy:df` skips the build but requires an already-current production build and performs the same identity, build-identifier, input-fingerprint, and SHA-256 checks. It must refuse missing output, output older than relevant source/build inputs, or any build-input content/path mismatch.
- The default vault is `/Users/davidfasullo/Desktop/dBrain`; the default destination is `.obsidian/plugins/obsidian-timekeep-df` beneath it.
- `OBSIDIAN_VAULT=/path/to/vault` changes the vault root.
- `TIMEKEEP_DF_PLUGIN_DIR=/exact/plugin/folder` sets the exact destination, whose final folder must be named `obsidian-timekeep-df`. Do not combine it with `OBSIDIAN_VAULT` or command-line destination options.
- The helper may create the fork destination when absent. It must never delete the destination, copy the repository wholesale, touch `.obsidian/plugins/timekeep`, overwrite/remove `data.json`, or alter unrelated destination files.
- Successful output must print the resolved destination, whitelist, source/deployed hashes, build-input SHA-256 fingerprint, and the non-executing build identifier embedded in `dist/main.js`. Matching files prove the disk deployment, not that Obsidian has loaded the module.

After every deployment, reload Obsidian or disable and re-enable **Timekeep DF** before trusting runtime behavior. If runtime behavior contradicts source, compare the repository `dist/main.js` and deployed `main.js` SHA-256 hashes before debugging source; if hashes match, reload the plugin/module next.

## Change discipline

- Before every editing phase, run `git status --short --branch`, inspect the complete relevant diff, and check staged changes separately. Repeat after formatting, builds, deployment, and tests.
- Preserve all user and concurrent-agent changes. Never use reset, checkout, clean, restore, or broad deletion to discard work. Do not overwrite an unexpected target.
- Keep setup changes limited to identity isolation, deployment tooling, and documentation. No visual changes, functional modifications, refactors, bug fixes, speculative features, or dependency upgrades belong in the setup checkpoint.
- Preserve the upstream README's user documentation and attribution. Keep machine-specific deployment and agent workflow detail here rather than expanding the README.
- Do not change the fenced language, file extension, or stored JSON without an explicit compatibility decision from the owner.
- Do not push to `upstream`; do not create an upstream issue/PR, release, or marketplace submission.

## Known-good setup checkpoint

The setup verification record is:

- `pnpm install --frozen-lockfile`: passed.
- `pnpm fmt:check`: inherited upstream failure only in `src/components/TimesheetNameInput/TimesheetNameInput.test.ts`; do not describe it as introduced by fork setup or silently fix it in this checkpoint.
- `pnpm lint`: passed.
- `pnpm test`: passed, 58 test files and 469 tests.
- `pnpm build`: passed and produced exactly `dist/manifest.json`, `dist/main.js`, and `dist/styles.css`.

This checkpoint establishes the public fork, isolated plugin identity, preserved user-data formats, safe deployment workflow, and documentation. The next planned task is a deeper architectural assessment before any visual or functional modifications are planned or implemented.
