# Hayati Log

A local daily and monthly report app built to replace AppFlowy. It runs as a Tauri desktop app (or as a plain web page in dev mode).

## Run

```bash
npm install
npm run tauri:dev
```

Use `npm run dev` to work on it in a browser at http://localhost:5188. It reads and writes the same data file as the app.

Build the Mac app:

```bash
npm run tauri:build
```

The app lands in `src-tauri/target/release/bundle/macos/Hayati Log.app`, and an installer disk image in `src-tauri/target/release/bundle/dmg/Hayati Log_<version>_aarch64.dmg`.

## Data

All data lives in one JSON file:

`~/Library/Application Support/com.hayati.report/report.json`

The app copies it into `backups/report-YYYY-MM-DD.json` once a day and keeps the last 30 copies. In Settings, **Export Data** saves a copy of the file, and **Restore Data** lists every backup (newest first) to restore from, or imports an exported file. A restore replaces everything and can be undone with ⌘Z.

Only keep one copy open at a time (the app *or* the dev browser tab). Both write to the same file, and whichever saves last wins.

## Features

### Daily log

- **Quick Start / End** — the header next to the month title has `‹ date ›` (click the date for a calendar), Start and End boxes, and **→** to write them into that day's row. The row is created if it doesn't exist.
- **Easy time typing** — any time box accepts `4 30 a` (4:30 AM), `14 30`, `2:30p` or `5am`. Durations accept `1 30`, `1:30`, `1h 30m` or `90m`.
- **Edit in the cell** — every cell edits in place; there are no pop-ups except the date calendar. Type straight onto a selected text cell. Enter saves and moves down, Tab moves sideways, Shift+Enter adds a line, Esc closes.
- **Cell types** — the **+** at the end of the header asks for **Text**, **Text + checklist** or **Checklist**. Other types (number, select, time…) are under a column's **Type** menu.
- **Text + checklist** (Day Plan, Work Focus, Work Done, Work Notes) — one list mixing text lines and to-dos. The add row's icon switches between text (the default) and to-do. Drag rows by their ⠿ handle to reorder.
- **To-do buttons** (shown on hover) — **→** copies the to-do into the next day's Pending, **↓** carries it to the next day's same column, **×** deletes. Click a lit → or ↓ again to undo.
- **Formatting** — select text in a cell for a toolbar: bold, italic, underline, strike, code and the note colours. Formatting shows as you type.
- **Toolbar** — search (click the icon to open), filter, sort and properties sit on the right of the month goal.

### Sidebar

- **Search** — the icon beside the logo opens search across days and notes.
- **Memos** — **+** beside the logo adds a sticker memo (rich text, `- ` for bullets). Hover for its colour and ×. Empty memos remove themselves.
- **Time block quick start** — the bottom row (text set in Settings) opens a group › category picker. While a block runs it shows a live stopwatch; click it to **Pause / Resume** or **Stop**.
- **Settings** is the gear on the "Last saved" line.

### Time Blocks page

- `‹ date ›` matches the daily log; the calendar marks days with blocks in green.
- The eye icon hides the quick-start panel, timeline and totals. They start hidden for today and shown on other days.

### Monthly Report

- The state chart's **Work/Rest** bars stack rest (bottom) and work (top) time from those time-block groups.
- **By cycle phase** shows total work and rest hours for each phase (PF, OV, LT, L, P).

### Settings

- **Colours** — General app accents (each with where it's used), 6 note text and 6 text background colours, to-do checkbox, 6 memo backgrounds and time-block group colours (rename and delete in place).
- **Routine** — repeat a Day Plan to-do on chosen weekdays (**Day**) or a day of the month (**Date**, including last day). It's added once on the day itself.
- **Time-Block Categories** — sidebar start text, categories (rename in place), and a folded archive with **Restore** and **Delete permanently** (two clicks; ⌘Z undoes).

## When a new day starts

There is no day boundary setting. The app works it out from your own Start and End entries:

- **Today switches** at the time of your most recent End (bedtime). An evening End (after noon) switches at midnight instead. With no End yet, the most recent Start is used, and with neither, 4 AM.
- **Typed times** earlier than that day's Start count as after midnight, so a 2 AM bedtime stays on the day you were up. Without a Start on the row, the most recent Start is used. A time typed into Start itself is checked against the day-switch time.

"Most recent" means the row with the latest date that has the value filled in. Times already entered are never recalculated.

## Shortcuts

- **⌘Z / ⌘⇧Z** — undo / redo. If you last changed a note, memo or Weekly Plan block, it undoes that first, then app actions like deleted days or notes.
- **Esc** — closes a cell editor and leaves any text field, so ⌘Z reaches app undo.
- **⌘D** — in the table, copies the cell above into the selected cell. In a note, memo or Weekly Plan, duplicates the current block.
- **Enter / Tab** — in a table cell, save and move down / sideways. **Shift+Enter** adds a line.

## Importing from AppFlowy

```bash
npm run import:appflowy -- --dry-run
npm run import:appflowy -- --force
```

This reads AppFlowy's local SQLite cache read-only and pulls in:

- the monthly daily-log tables
- the time-block tables inside day pages

Where AppFlowy has duplicate monthly tables, the most recently edited value wins for each cell. Cycle-day tags (D1 Period … D33 Late) become period-start dates, so the Cycle column counts itself. `--force` replaces the current file, and a copy is kept in `backups/` first.

## Layout

- `src/lib/` — time parsing, default schema and colours, store, undo and persistence
- `src/components/Table.jsx` — Notion-style table
- `src/components/cells.jsx` — table cell views and editors (text, mixed lists, checklists, time, tags, cycle)
- `src/components/FormatBar.jsx` — cell formatting toolbar and rich text
- `src/components/QuickEntry.jsx` — header Start / End entry
- `src/components/DatePicker.jsx` — calendar and `‹ date ›` control
- `src/components/TimeBlocks.jsx`, `TimeBlocksPage.jsx` — time blocks
- `src/components/MonthReport.jsx` — monthly report
- `src/components/WeeklyPlan.jsx` — weekly plan
- `src/components/NoteEditor.jsx`, `NotePanel.jsx` — notes (BlockNote editor, also used by Weekly Plan and memos)
- `src/components/Sidebar.jsx` — sidebar, search, memos and the time-block stopwatch
- `src/components/Settings.jsx` — settings, colours, routines, export and restore
- `src-tauri/` — desktop shell (load, save, backups and backup listing in `src/lib.rs`)
