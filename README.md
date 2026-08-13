<h1>
  <img src="images/timekeep.svg" width="100%" height="50">

</h1>

<center><p>Obsidian plugin for time tracking</p></center>

![License](https://img.shields.io/github/license/moremeyou/obsidian-timekeep-df?style=for-the-badge)
![CI](https://img.shields.io/github/actions/workflow/status/moremeyou/obsidian-timekeep-df/ci.yml?style=for-the-badge&label=CI)

> [!NOTE]
> This repository is the public **Timekeep DF** development derivative of
> [Jacob Tread's Obsidian Timekeep](https://github.com/jacobtread/obsidian-timekeep).
> It is installed with plugin id `obsidian-timekeep-df` and is intentionally isolated
> so it can run alongside the official `timekeep` plugin. Fork API consumers must use
> `app.plugins.plugins["obsidian-timekeep-df"].api`.

This plugin provides a simple and easy way to track time spent on various tasks. After tracking your time, you can export the tracked time as a **Markdown Table**, **CSV**, **JSON**, or **PDF**.

## ✨ What’s new in Timekeep DF

### Focused live-work dashboard

- The primary card makes the current **Activity**, active **Block** path, and live hours/minutes/seconds **Duration** easy to scan.
- A large, centered Start/Stop control uses consistent icon geometry across desktop, tablet, and mobile.
- The companion card shows the selected Day, Week, Month, or Year total. It uses the theme’s green state while within capacity and red when over capacity.
- With no timer running, the focus card says **Get to work!** or **Stop working!** depending on whether the selected period is over its working-hours target.
- Range navigation, Today, the native range selector, and the formatted date sit above the focus cards.

### Activity and Block table refinements

- The hierarchy is now consistently named **Activity → Block** throughout the interface. Top-level rows are Activities; their child work sessions are Blocks.
- Start/Stop is the leftmost column, followed by Activity, Duration, %, Start, and End; Edit stays at the far right. Numeric and time columns remain stable so changing values do not make the table jitter, while Activity receives the flexible width.
- Expanded Activities and all of their Blocks share the top-level Activity background and one outline. Adjacent Activities remain visually separate, and hover behavior is unchanged.
- Activity start/end values are derived from the earliest and latest complete descendant dates and times. A running descendant updates the parent end live.
- Start and End cells show local time only, but the complete dates and timestamps remain stored. Table durations omit seconds; the live dashboard Duration retains seconds.
- Empty rows are hidden in the selected calendar window. An Activity remains visible when any descendant Block has duration in that window.
- Automatic Block names restart at **Block 1** for each local calendar day; Block names do not need to be globally unique.

### Day, Week, Month, and Year views

- Every tracker has a native Day/Week/Month/Year selector, previous/next navigation, a Today button, and a clear date or date-range label.
- Navigation cannot move beyond the period containing today. Start/Stop is available only in the current selected period because it represents real-time tracking.
- Views are non-destructive windows—not midnight resets. They filter and clip calculations without rewriting, splitting, or discarding stored sessions, including sessions that cross a boundary.
- The registry retains each tracker’s selected view and navigation state for the current Obsidian session without adding parameters to the note or changing the tracker schema.
- The **%** column is calculated against the selected view’s capacity, rounds upward to 0.1%, and can exceed 100%.

### Current and historical entry workflows

- In the current period, adding an Activity starts it immediately; every Activity/Block play control toggles to Stop while that row is active.
- In a previous period, adding an Activity opens its editor immediately and never starts a live timer. Registry-backed autocomplete reuses the matching Activity instead of creating duplicate top-level names.
- In a previous period, each Activity’s real-time control becomes **+**. It creates or reopens a correctly numbered child Block and opens the editor immediately.
- A historical draft with no positive duration stays out of the normal filtered table. Canceling it leaves no visible zero-duration row; saving valid times makes it part of that period.

### Native, safer editing

- Start and End use separate native date and time pickers on every device, with configurable 12-hour or 24-hour display.
- Editors initialize in local time and save at minute precision, zeroing seconds and milliseconds without dropping the stored date.
- **-5 Min** and **+5 Min** adjustments sit alongside Save, Cancel, and Delete. Invalid or empty date/time input does not replace a valid stored timestamp.
- Desktop editing remains inline. Tablet and mobile use compact screen-aware modals so controls are not sized from the horizontally scrolling table.
- Save and Delete use clear Lucide icons, delete confirmation has a compact responsive layout, and redundant close controls have been removed.

### Responsive controls and exports

- Button backgrounds, borders, corner radii, icon sizes, and vertical alignment are explicitly normalized across desktop and touch devices.
- The responsive table preserves usable Activity width on mobile and keeps the action controls reachable at both edges.
- **ADD ACTIVITY** and **EXPORT** share a card below the table. Desktop/tablet use two columns; mobile stacks the sections with an Export label and compact **MD**, **CSV**, **JSON**, and **PDF** buttons.
- Markdown, CSV, JSON, PDF, and registered custom exports use the same selected view, row filtering, and boundary clipping as the table. Export snapshots never mutate stored tracker data.

### Safe side-by-side isolation

- Timekeep DF remains isolated under plugin id `obsidian-timekeep-df`, `df-timekeep` code blocks, `.timekeep-df` files, its own settings/data, scoped styles, and isolated PDF globals.
- The official Timekeep plugin continues to own `timekeep` code blocks and `.timekeep` files. Timekeep DF never claims or silently converts them.

## ⚙️ Time and capacity settings

Timekeep DF adds these settings under **Settings → Timekeep DF**:

| Setting | Default | Purpose |
| --- | --- | --- |
| Clock format | 24-hour | Selects 12-hour or 24-hour timestamp display and native-picker hints. |
| Default timesheet view | Day | Chooses the initial Day, Week, Month, or Year window. |
| Total daily working hours | 8 | Calculates the **%** column and Day capacity. |
| Total days per week | 5 | Scales Week, Month, and Year capacity. |

## ➕ Create a tracker

![Tracker](images/tracker.png)

Use the command `Timekeep DF: Insert Tracker`, or add the fork-specific code block below:

````
```df-timekeep

```
````

## ✏️ Editing & Deleting

If you accidentally gave an Activity or Block an incorrect name, or started its timer late, you can use the editing feature to update the stored data or delete the entry.

Start and end timestamps use the platform's native date and time pickers on desktop, tablet, and mobile. Choose **12-hour** or **24-hour** under **Settings → Timekeep DF → Clock format**. Saved edits use minute precision: seconds and milliseconds are zeroed. Seconds remain visible only in the live Duration card.

Expanded Activities visually group their Block rows and derive the Activity's displayed start/end times from the earliest and latest full date/time values across all descendant sessions. Table rows show time only; the complete date and timestamp remain stored.

Each tracker has **Day**, **Week**, **Month**, and **Year** calendar views with previous, next, and Today navigation. Forward navigation stops at the period containing today. Sessions crossing a view boundary are clipped for display and calculation only—the original timestamps are never rewritten. **Default timesheet view** starts at Day. The **%** column uses **Total daily working hours** (8 by default); Week, Month, and Year capacity also uses **Total days per week** (5 by default). The registry retains each tracker's selected view for the current Obsidian session without adding view parameters to the note.

The tracker header prioritizes the current Activity, its active Block path, and a live hours/minutes/seconds elapsed value. The selected Day, Week, Month, or Year total remains visible as secondary context.

Each view shows only Activities and Blocks with tracked duration in its selected calendar window. Parent Activities remain visible when a descendant Block has duration. The tracker export buttons—Markdown, CSV, JSON, PDF, and registered custom formats—apply the same filter and clip overlapping sessions to the window; stored tracker data is not modified.

For current periods, the row control starts or stops real-time tracking. For historical periods, that control becomes **+** and opens a new Block in the editor. Adding an Activity in a historical period also opens the editor immediately and never starts a live timer. A historical draft becomes part of the visible window only after it has a valid positive duration.

![Editing](images/editing.png)

## 👀 How it's stored

This plugin is heavily inspired by [ObsidianSimpleTimeTracker](https://github.com/Ellpeck/ObsidianSimpleTimeTracker). Timekeep DF stores tracking data as JSON within a `df-timekeep` code block, or in a standalone `.timekeep-df` file.

> [!IMPORTANT]
> The official plugin owns `timekeep` code blocks and `.timekeep` files. Timekeep DF
> owns `df-timekeep` code blocks and `.timekeep-df` files. The JSON inside them has the
> same schema, but the fork does not automatically claim or convert official trackers.
> Rename or migrate a tracker only when you deliberately want to transfer ownership.

Activity and Block start/stop times are stored as timestamps, making it possible for you to start your time tracker, then close Obsidian and have the tracking continue when you open it again.

Below is an example of how this is stored:

```json
{
    "entries": [
        {
            "name": "Example Activity",
            "startTime": "2024-03-17T06:32:36.118Z",
            "endTime": "2024-03-17T06:32:37.012Z",
            "subEntries": null
        }
    ]
}
```

## 📝 Export Formats

Below are the various formats that timekeeping data can be exported to:

### Markdown Table

| Activity           | Start             | End               | Duration |
| ------------------ | ----------------- | ----------------- | -------- |
| Example Activity   | 24-03-17 19:32 | 24-03-17 19:32 | 0s       |
| **Total**          |                   |                   | **0s**   |

```md
| Activity           | Start             | End               | Duration |
| ------------------ | ----------------- | ----------------- | -------- |
| Example Activity   | 24-03-17 19:32 | 24-03-17 19:32 | 0s       |
| **Total**          |                   |                   | **0s**   |
```

### CSV

```csv
Activity,Start,End,Duration
Example Activity,24-03-17 19:32,24-03-17 19:32,0s
```

> [!NOTE]
> In the plugin settings, you can choose to omit the first line of the CSV containing the column names:

### JSON

The JSON export format simply copies the JSON stored inside the timekeep:

```json
{"entries":[{"name":"Example Activity","startTime":"2024-03-17T06:32:36.118Z","endTime":"2024-03-17T06:32:37.012Z","subEntries":null}]}
```

### Generated PDFs

Below is an example of a PDF generated by Timekeep DF. These PDFs are generated using pdfmake locally.

![Generated PDF](images/pdf.png)

## 🔣 Using with templates

If you would like to create a timekeep through a template plugin, you can do so by using the JSON for a timekeep directly.

If you have frequently used entry names you can define them in your template by specifying `null` for both the `startTime` and `endTime`:

```json
{"entries":[{"name":"Example Activity","startTime":"2024-03-17T06:32:36.118Z","endTime":"2024-03-17T06:32:37.012Z","subEntries":null}]}
```

This will create an entry that is not yet started; you can start it by clicking the play button without having to type out the name.

## 👀 Status Bar Icons

Timekeep DF will show its running timers in the Obsidian status bar, allowing you to see whats happening at a glance, you can then quickly open the file or stop the timer
right from the status bar.

![Status Bar](images/status_bar.png)

*Status bar icons are only available if the registry setting is enabled as well as the status bar setting 

## 🦾 API

Timekeep DF exposes a JS API which can be used by other scripts such as with [Dataview](https://blacksmithgu.github.io/obsidian-dataview/api/intro/)

You can access the plugin API through:

```js
// Get the timekeep plugin API
const timekeepPlugin = this.app.plugins.plugins["obsidian-timekeep-df"].api;

// Extract the timekeeps from the file text
const timekeeps = timekeepPlugin.parser.extractTimekeepCodeblocks(text);
```

Below is a Dataview example for showing the total elapsed time for all timekeeps in the current file:

````
```dataviewjs
// Get the currently open file
const activeFile = this.app.workspace.getActiveFile();
if(!activeFile || !activeFile.name) return;

// Read the file
const text = await this.app.vault.read(activeFile);

// Get the timekeep plugin API
const timekeepPlugin = this.app.plugins.plugins["obsidian-timekeep-df"].api;

// Extract the timekeeps from the file text
const timekeeps = timekeepPlugin.parser.extractTimekeepCodeblocks(text);

// Current time is required for unfinished entries
const currentTime = moment();

let totalRunningDuration = 0;

for (const timekeep of timekeeps) {
  totalRunningDuration += timekeepPlugin.queries.getTotalDuration(timekeep.entries, currentTime);
}

// Total running duration is in milliseconds
dv.span(totalRunningDuration);
```
````

## Known issues

### Jumpy rendering behavior on modification

If your lists become longer you will likely see some jumpy/flickery behavior with timekeep when making modifications (add/save/delete/collapse/expand), this is a limitation of how Obsidian re-renders the app.

Because Obsidian re-creates the entire app when the code block changes (Since the timekeep data is stored in the codeblock, modifications cause this to happen. Thus the DOM is thrown away causing a full re-render). The registry now retains calendar view navigation during the current plugin session; persisted tracker fields such as collapsed state remain in tracker data.

I do not believe this can be fixed but PRs are welcome if you are aware of a way to fix this.

## 📄 License

This project is licensed under the [MIT License](./LICENSE.md)
