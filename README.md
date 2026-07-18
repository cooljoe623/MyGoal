# Goal Savings Tracker

A premium, offline-first Progressive Web App for tracking daily savings
toward one or more financial goals — originally built around a Subaru
Forester example, now fully generic (see "Making it your own" below).

## Running it

No build step, no server, no internet connection required for core functionality.

1. Open `index.html` in any modern browser (Chrome, Edge, Safari, Firefox).
2. Optionally "Install" it from the browser's address bar / menu to use it as a
   standalone app (PWA) on desktop or mobile.

The only things that require an internet connection on first load are Google
Fonts, Chart.js, and — if Cloud Sync is configured — the Firebase SDK. Excel
(SheetJS) and PDF (jsPDF) export libraries are loaded on demand the first
time you actually click those export buttons, not on every page load, so
they don't slow down opening the app. Once loaded, the service worker caches
everything so the dashboard, entry form, history, calendar, and analytics
keep working fully offline afterward. All scripts load with `defer` so the
page renders as soon as its own HTML/CSS are ready rather than waiting on
every script to download first.

## Project structure

```
/
├── index.html              Single-page app shell — all "pages" are sections
├── manifest.json            PWA manifest
├── service-worker.js        Offline caching
├── css/
│   ├── styles.css           Theme tokens, layout, components
│   ├── animations.css       Keyframes, confetti, transitions
│   └── responsive.css       Tablet / mobile breakpoints
├── js/
│   ├── utils.js              Formatting, dates, counters, confetti
│   ├── storage.js            LocalStorage data layer (entries, settings, achievements)
│   ├── notifications.js      Toast notifications
│   ├── dashboard.js          Stats engine — KPIs, milestones, achievements, weekday/expense analytics, what-if pace projection
│   ├── charts.js              Chart.js chart definitions/updates
│   ├── calendar.js            Monthly calendar grid rendering
│   ├── firebase-config.js    Your Firebase project keys (placeholder until you set up sync)
│   ├── sync.js                Firebase Auth + Firestore sync (optional, no-op until configured)
│   └── app.js                 Main controller — navigation, forms, exports
└── assets/icons/             PWA icons
```

> **Note on structure:** the brief described separate HTML pages
> (`dashboard.html`, `history.html`, etc). This build instead uses a single
> `index.html` with section-based client-side routing between "Dashboard",
> "Daily Entry", "History", "Analytics", "Calendar", "Achievements",
> "Settings", and "About" — this keeps the app installable as one PWA, fully
> offline, and avoids page-reload flicker, while the JS/CSS are still split
> into the requested logical files.

## Multiple goals

The sidebar has an **Active Goal** switcher — pick any existing goal or create
a new one from there (name, target amount, and deadline are the only
required fields; everything else can be filled in later under Settings).
Each goal has its own name, photo, income labels, targets, dates, entries,
streaks, and achievements — switching goals switches the entire dashboard,
history, calendar, and analytics to that goal's data. `theme` and `currency`
are shared across all goals.

Settings → **Manage Goals** lists every goal with options to switch or
delete it (deleting removes that goal's entries and achievements along with
it — confirmation gated, and blocked if it's your only goal).

**Reset This Goal** (on the Daily Entry page) only wipes the *active* goal's
entries/streaks/achievements — its name, targets, and photo stay put, and
other goals are untouched. Backups (History → Download Backup) always
include *every* goal, not just the active one.

## Income sources

Income isn't limited to two fixed fields anymore. Settings → **Income
Sources** lets you add as many named sources as you want (each with its own
daily target), rename or retarget any of them, or remove one entirely.
Removing a source doesn't touch historical entries — past amounts still
count toward your totals, they just won't have a labeled column going
forward. Daily Entry, History, Analytics charts, and CSV/Excel/PDF exports
all pick up your current source list and labels automatically — export
column headers always match whatever you've named your sources.

## Deadline by days-to-save

In Settings, instead of only picking a deadline date, you can type a number
of days into **"...or set Deadline by days to save"** — it computes the
Deadline date as Start Date + that many days. The two fields stay in sync in
both directions: editing the date recalculates the day count, and editing
the day count recalculates the date.

## Today's Targets (resets at local midnight)

The Dashboard shows a **Today's Targets** section: your overall daily target
and each income source's target, but only the ones you haven't hit yet —
once a target is met for the day it disappears from the section rather than
sitting there as a redundant number. If it's only partially met, it shows
the remaining balance instead of the full target amount. "Today" is your
device's local calendar day (midnight to midnight); if you leave a browser
tab open across midnight, the app detects the date change automatically
(checked every minute, plus whenever the tab regains focus) and refreshes
without needing a manual reload.

## Expense categories

The Expenses field on Daily Entry is paired with a category (Transport,
Data/Airtime, Materials, Food, Other). Analytics shows a doughnut chart and
totals list of where money is actually going.

## Notes

Whatever you type in the Notes field on Daily Entry is searchable and
visible later on the **History** page — it's shown as its own column
(truncated with the full text on hover) right next to that day's numbers,
and the History search box matches against note text as well as dates.
Click a row's edit button to open that day back up in Daily Entry if you
want to read or change the full note.

## Weekday insights & the What-If calculator

Analytics also shows your average net savings per day of the week (with the
best/worst day called out) and an interactive **What-If Pace Calculator** —
drag the slider or type a hypothetical daily savings amount and see the
projected finish date update live, compared against your current actual pace.

## Cloud sync (optional)

By default the app is 100% local/offline — nothing leaves your device. If you
want your data to sync between your phone and other devices, connect it to
your own free Firebase project (email/password sign-in) by following
**[SYNC_SETUP.md](./SYNC_SETUP.md)** — about 5–10 minutes, no coding.

Once connected, Settings → **Cloud Sync** lets you create an account or sign
in; from then on, changes on any signed-in device sync to the others in the
background. Sync uses last-write-wins per entry/goal (see SYNC_SETUP.md for
exactly how conflicts and deletions are handled — it's a deliberately simple
approach, not a full conflict-free sync system).

## Account-gated access

If Cloud Sync is configured (see above), the app requires sign-in before
showing anything — a full-screen gate blocks all content until you sign in
or create an account. This replaced an earlier local PIN-lock feature: once
your data is behind a real account login, a separate device PIN was
redundant, so it was removed in favor of just the one gate.

A few things worth knowing about how the gate behaves:

- If Cloud Sync **isn't** configured, there's no gate at all — the app works
  exactly as it always has, fully offline, no account needed.
- Firebase persists your signed-in session locally, so you won't be asked to
  sign in again on the same device/browser after the first time — including
  offline, since the session itself doesn't require a live connection to
  confirm (only signing in or up for the first time does).
- **Reset This Goal**, **Delete Goal**, and **Restore Backup** are still
  gated behind their own confirmation dialogs to prevent accidental clicks,
  but no longer require re-entering a PIN — being signed into the app at all
  is now the access control.

### Reset App (replaces password reset)

There's no "forgot password" email flow in this app. Instead, both the
sign-in gate and Settings → **Danger Zone** have a **Reset App** button:

- Type `DELETE` to confirm (no accidental clicks).
- If you're signed in, it deletes your account and all cloud data, then
  wipes local data too — you'd create a new account afterward to use sync
  again.
- If you're not signed in (e.g. you forgot your password and are stuck at
  the gate), it wipes local data on this device only — your account and its
  cloud data are **not** touched, since deleting a Firebase account requires
  being authenticated as that account. This gets you an unblocked, usable
  app again, but it does not recover access to the old account — you'd need
  to remember the password to sign back into it, or just create a new one.

Worth knowing plainly: removing password reset means a genuinely forgotten
password has no in-app recovery path for that specific account's data — only
a fresh start. If that trade-off doesn't suit you, Firebase's password reset
could be re-added; it was removed here on request.

## Making it your own

This app isn't locked to a Subaru Forester — go to **Settings** and you can set:

- **Goal Name** — shown in the hero, sidebar, browser tab, and celebration messages
- **Goal Photo** — upload a photo of whatever you're saving for; it replaces the
  default illustration in the hero. Photos are automatically downscaled and
  compressed to a JPEG data URL before being stored, so large phone photos
  won't blow past `localStorage`'s ~5–10MB browser quota
- **Mission Statement** — your own "why," shown on the About page
- **Income sources** — add, rename, retarget, or remove as many named income
  sources as you want (see "Income sources" above)
- **Goal amount, stretch goal, deadlines, and daily targets** — all editable

Everything else (KPIs, milestones, streaks, charts, calendar, achievements,
projections) recalculates automatically off whatever numbers and labels you
set — the underlying engine was already goal-agnostic, it just displayed
Forester-specific text by default.

Multiple goals are fully supported — see "Multiple goals" above for how to
create, switch between, and manage them.

## Data model

Every entry is stored in `localStorage` under `sfm_entries`, tagged with
which goal it belongs to:

```json
{
  "date": "2026-07-07",
  "goalId": "id_abc123",
  "incomes": { "id_source1": 300, "id_source2": 1520 },
  "other": 0,
  "expenses": 0,
  "expenseCategory": "",
  "notes": ""
}
```

Net savings for a day = sum of all values in `incomes` + `other` − `expenses`.
Saving a date that already has a record for that goal **updates** it in
place — no duplicate dates are ever created.

Goals (`sfm_goals`) hold each goal's own name, photo, income source list
(`incomeSources: [{ id, label, target }]`), targets, and dates. App-wide
settings — `theme`, `currency` — live separately in `sfm_settings`, since
they apply across every goal. "Reset This Goal" (Daily Entry) clears one
goal's entries/achievements/streaks while keeping its settings; deleting a
goal entirely (Settings → Manage Goals) removes its data along with it.

## Features implemented

- Luxury black/gold/carbon-fiber dashboard theme with glassmorphism cards
- Multiple goals with independent names, photos, income sources, and history
- Dynamic, user-defined income sources (add/rename/retarget/remove any time)
- Animated progress bar + circular completion gauge
- Today's Targets section that hides each target once met and shows the
  remaining balance otherwise — auto-refreshes at local midnight
- Deadline by date, or by typing a number of days to save
- Full KPI grid (current savings, remaining, streaks, pace, both actual-pace
  and target-pace purchase-date projections, etc.)
- 25/50/75/100% milestones with unlock badges + confetti celebration
- Daily entry form with live net-savings preview, update-in-place logic,
  delete-last-entry, and a per-goal reset (with confirmation)
- Edit history table with search, inline edit/delete, and running totals —
  columns always match your current income sources
- CSV / Excel / PDF export with matching dynamic column headers, plus
  one-click JSON backup and restore covering every goal
- Analytics: per-source highest-day/averages, best/worst week & month,
  weekday patterns, expense category breakdown, and an interactive What-If
  pace calculator
- Color-coded monthly calendar (green/yellow/red/gray) — click a day to edit it
- Achievements grid, tracked per goal
- Optional cloud sync (Firebase email/password) with a mandatory sign-in
  gate when configured, last-write-wins merge across devices
- Toast notifications, confirmation modals, and a milestone celebration overlay
- Dark/light theme toggle, daily motivational quote, live countdown timers
- Keyboard shortcuts (`1`–`8` to jump pages, `N` for new entry, `Ctrl/Cmd+S`
  to save, `Esc` to close dialogs)
- Fully responsive layout (desktop, laptop, tablet, phone) with a slide-out
  sidebar on small screens
- Installable PWA with offline service worker caching

## Customizing your targets

Go to **Settings** to change the goal amount, stretch goal, deadline (by
date or by days-to-save), daily target, income sources, theme, and
currency — every KPI and chart recalculates instantly.
