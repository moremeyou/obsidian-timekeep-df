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

![Tracker](images/tracker.png)

This plugin provides a command for inserting time trackers: `Timekeep DF: Insert Tracker`. Alternatively, a Timekeep DF tracker can be created with the fork-specific code block below:

````
```df-timekeep

```
````

## ✨ Timekeep DF highlights

- **A glanceable work dashboard.** The top cards emphasize the current Activity, active Block path, live duration, and selected-period total. Capacity-aware color states show whether the selected Day, Week, Month, or Year is within or over its configured working-hours target. When no timer is running, the focus card prompts **Get to work!** or **Stop working!** according to that capacity.
- **A clearer Activity → Block hierarchy.** Top-level work is named **Activity** and its child sessions are named **Blocks**. Expanded groups share the Activity color and outline, while the Activity row reports the earliest descendant start and latest descendant end using the complete stored dates and times. Automatic Block numbering restarts for each local calendar day.
- **Calendar-window navigation.** Every tracker can be viewed by Day, Week, Month, or Year, with previous/next and Today controls. Navigation cannot move beyond the period containing today. The registry retains each tracker’s selected window for the current Obsidian session without adding parameters to the note.
- **Window-aware calculations and exports.** Rows, totals, percentages, Markdown, CSV, JSON, PDF, and custom exports all use the selected calendar window. Sessions that cross a boundary are clipped only in the derived view/export; their stored timestamps remain intact.
- **Safe historical entry.** Start/Stop remains reserved for the current period. In an earlier period, adding an Activity—or using the **+** control on an existing Activity—opens its editor without starting a live timer. Unsaved, zero-duration drafts stay out of the normal filtered view, and registry-backed name matching avoids duplicate Activities.
- **Native, responsive editing.** Date and time use platform-native pickers with configurable 12-hour or 24-hour display. Desktop editing stays in context; tablet and mobile use compact modals designed for the visible screen rather than the horizontally scrolling table. Save, Cancel, Delete, **-5 Min**, and **+5 Min** controls share consistent device-aware styling.
- **A denser responsive table.** Start/Stop sits at the left edge, Edit at the right, and the Activity column receives the flexible width. Time columns display time only, while full dates remain stored. Table durations omit seconds for stability; the live Duration card retains hours, minutes, and seconds.

## ⚙️ Time and capacity settings

Timekeep DF adds these settings under **Settings → Timekeep DF**:

| Setting | Default | Purpose |
| --- | --- | --- |
| Clock format | 24-hour | Selects 12-hour or 24-hour timestamp display and native-picker hints. |
| Default timesheet view | Day | Chooses the initial Day, Week, Month, or Year window. |
| Total daily working hours | 8 | Calculates the **%** column and Day capacity. |
| Total days per week | 5 | Scales Week, Month, and Year capacity. |

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
