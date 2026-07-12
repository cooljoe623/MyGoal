# Subaru Forester Mission

A premium, offline-first Progressive Web App for tracking daily savings toward a
**KSh 600,000** Subaru Forester by **1 July 2027** (internal goal: 1 June 2027,
stretch goal: KSh 650,000).

## Running it

No build step, no server, no internet connection required for core functionality.

1. Open `index.html` in any modern browser (Chrome, Edge, Safari, Firefox).
2. Optionally "Install" it from the browser's address bar / menu to use it as a
   standalone app (PWA) on desktop or mobile.

The only things that require an internet connection on first load are the
Google Fonts, Chart.js, SheetJS (Excel export), and jsPDF (PDF export) CDN
scripts. Once loaded once, the service worker caches the app shell so the
dashboard, entry form, history, calendar, and analytics keep working fully
offline afterward.

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
history, calendar, and analytics to that goal's data. `theme`, `currency`,
and the PIN are shared across all goals.

Settings → **Manage Goals** lists every goal with options to switch or
delete it (deleting removes that goal's entries and achievements along with
it — PIN + confirmation gated, and blocked if it's your only goal).

**Reset This Goal** (on the Daily Entry page) only wipes the *active* goal's
entries/streaks/achievements — its name, targets, and photo stay put, and
other goals are untouched. Backups (History → Download Backup) always
include *every* goal, not just the active one.

## Expense categories

The Expenses field on Daily Entry is paired with a category (Transport,
Data/Airtime, Materials, Food, Other). Analytics shows a doughnut chart and
totals list of where money is actually going.

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

## PIN lock

Go to **Settings → Security** to set a 4–8 digit PIN. Once set:

- Opening the app shows a lock screen — you must enter the PIN to see anything.
- **Reset Everything** and **Restore Backup** also require the PIN, since both
  overwrite or erase all your data.
- The PIN itself is never stored in plain text — it's hashed (SHA-256) before
  being saved to `localStorage`.

**Important limitation:** this is a client-only app with no server, so there's
no way to recover a forgotten PIN through email/support. The only recovery
path is the "Forgot your PIN?" link on the lock screen, which erases *all*
local data (entries, settings, achievements, and the PIN) so you can start
over — restore from a backup file afterward if you have one. Because of this,
treat the PIN as a privacy screen against casual snooping (e.g. someone
picking up your phone), not as strong security — anyone with direct access to
this browser's developer tools/storage could still bypass it.

## Making it your own

This app isn't locked to a Subaru Forester — go to **Settings** and you can set:

- **Goal Name** — shown in the hero, sidebar, browser tab, and celebration messages
- **Goal Photo** — upload a photo of whatever you're saving for; it replaces the
  default illustration in the hero. Photos are automatically downscaled and
  compressed to a JPEG data URL before being stored, so large phone photos
  won't blow past `localStorage`'s ~5–10MB browser quota
- **Mission Statement** — your own "why," shown on the About page
- **Income Source labels** — rename "Printing Income" / "Trading Profit" to
  whatever your actual income sources are (side hustle, salary, freelance, etc.)
- **Goal amount, stretch goal, deadlines, and daily targets** — all editable

Everything else (KPIs, milestones, streaks, charts, calendar, achievements,
projections) recalculates automatically off whatever numbers and labels you
set — the underlying engine was already goal-agnostic, it just displayed
Forester-specific text by default.

> **One goal at a time:** the app currently tracks a single active goal and
> its full history. If you finish this goal and want to start a new one,
> use *Reset Everything* in Daily Entry (or download a backup first if you
> want to keep the old goal's history), then set the new goal name/photo/
> targets in Settings. If you'd like to track multiple goals *simultaneously*
> with separate histories, that's a bigger structural change — let me know
> and I can add goal-switching.

## Data model

Every entry is stored in `localStorage` under `sfm_entries` as:

```json
{ "date": "2026-07-07", "printing": 300, "trading": 1520, "other": 0, "expenses": 0, "notes": "" }
```

Net savings for a day = `printing + trading + other − expenses`. Saving a date
that already has a record **updates** it in place — no duplicate dates are
ever created.

Settings (`sfm_settings`), unlocked achievements (`sfm_achievements`), and
mission metadata such as the start date (`sfm_meta`) are stored separately.
"Reset Everything" clears all four keys and reinitializes a fresh mission
start date.

## Features implemented

- Luxury black/gold/carbon-fiber dashboard theme with glassmorphism cards
- Animated progress bar + circular completion gauge
- Full KPI grid (current savings, remaining, targets, streaks, pace, etc.)
- 25/50/75/100% milestones with unlock badges + confetti celebration
- Daily entry form with live net-savings preview, update-in-place logic,
  delete-last-entry, and full reset (with confirmation)
- Edit history table with search, inline edit/delete, and running totals
- CSV / Excel / PDF export, plus one-click JSON backup and restore
- Analytics page (highest days, best/worst week & month, averages, forecast)
- Color-coded monthly calendar (green/yellow/red/gray) — click a day to edit it
- Achievements grid (first 10k, first month, streak milestones, goal reached)
- Toast notifications, confirmation modals, and a milestone celebration overlay
- Dark/light theme toggle, daily motivational quote, live countdown timers
- Keyboard shortcuts (`1`–`8` to jump pages, `N` for new entry, `Ctrl/Cmd+S`
  to save, `Esc` to close dialogs)
- Fully responsive layout (desktop, laptop, tablet, phone) with a slide-out
  sidebar on small screens
- Installable PWA with offline service worker caching

## Customizing your targets

Go to **Settings** to change the goal amount, stretch goal, deadline,
internal goal date, daily/printing/trading targets, theme, and currency —
every KPI and chart recalculates instantly.
