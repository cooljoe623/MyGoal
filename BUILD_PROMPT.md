# BUILD PROMPT: Personal Goal Savings Tracker (PWA)

Copy everything below into a coding AI (Claude, GPT, etc.) as a single instruction to build the complete application from scratch.

---

You are an elite Senior Full Stack Developer and UI/UX Designer.

Build a COMPLETE, production-quality Progressive Web App (PWA) called a **Personal Goal Savings Tracker**. This is not a demo — build it as a polished, commercial-grade personal finance dashboard.

## PURPOSE

The app helps a person save toward one or more financial goals (e.g. a car, a laptop, an emergency fund) by logging daily income/expenses, watching progress accumulate automatically toward a target amount and deadline, and staying motivated through visual feedback (progress bars, streaks, milestones, achievements).

It must NOT be hardcoded to any single goal, brand, or currency. Everything — goal name, target amount, deadline, photo, income category labels — is user-configurable, and the app supports **multiple independent goals**, each with its own name, photo, targets, and history, switchable from the UI.

## TECH CONSTRAINTS

- HTML5, CSS3, vanilla JavaScript only. No frameworks (no React/Vue/etc).
- Chart.js (via CDN) for charts. Optionally SheetJS (xlsx) and jsPDF (via CDN) for export.
- Must run by opening `index.html` directly — no build step, no server required.
- Must work fully offline after first load (register a service worker that caches the app shell; CDN scripts are the only things that need network on first load).
- All data persists in `localStorage`. Never lose data except through an explicit, confirmed reset/delete.
- Fully responsive: desktop, laptop, tablet, phone. Sidebar collapses to a slide-out drawer on mobile with a hamburger-triggered top bar.
- Installable as a PWA (`manifest.json` + icons + service worker).

## VISUAL THEME

Luxury Black & Gold, "premium fintech dashboard" feel — think Stripe/Notion/TradingView, not a spreadsheet.

- Palette: near-black background (#0a0a0a), carbon-gray panels, gold accent (#d4af37) with a soft gold highlight (#f4d976) and deep gold (#8a6d1a), off-white text, green for positive/ahead-of-pace, red for negative/behind-pace, yellow for partial/warning.
- Glassmorphism cards: translucent panels, subtle borders, soft shadows, backdrop blur.
- Rounded corners throughout (16–24px on cards).
- Subtle repeating diagonal-line "carbon fiber" texture as a background accent (very low opacity), not overpowering.
- Two typefaces: a geometric/display font for numbers and headings (e.g. Space Grotesk), a clean humanist sans for body text (e.g. Manrope), loaded from Google Fonts.
- A circular gauge styled like a car dashboard tachometer for "% complete" — this is the app's signature visual element.
- Smooth animated counters, animated progress bar fills, hover lift on cards, confetti burst + celebration modal on milestone unlocks, toast notifications for every save/update/delete/reset action.
- Dark mode is default; provide a light mode toggle that swaps the CSS custom properties.
- No real trademarked photos/logos in default assets — use an original SVG illustration as the default hero visual when the user hasn't uploaded their own goal photo.

## DATA MODEL

Design localStorage around **multiple goals**, each fully independent:

```
Goal {
  id: string (unique)
  name: string                    // e.g. "Subaru Forester", "New Laptop"
  photo: string | null            // base64 data URL, resized/compressed client-side before storing
  missionStatement: string
  incomeLabel1: string            // e.g. "Printing Income" — fully renameable
  incomeLabel2: string            // e.g. "Trading Profit" — fully renameable
  targetAmount: number
  stretchGoal: number
  startDate: string (yyyy-mm-dd)  // user-editable, defaults to creation date
  deadline: string (yyyy-mm-dd)
  internalDeadline: string (yyyy-mm-dd)
  dailyTarget: number
  incomeTarget1: number
  incomeTarget2: number
  createdAt: ISO timestamp
}

Entry {
  id: string
  goalId: string                  // which goal this entry belongs to
  date: string (yyyy-mm-dd)       // one entry per date per goal — saving an existing date UPDATES it, never duplicates
  income1: number                 // maps to the goal's incomeLabel1
  income2: number                 // maps to the goal's incomeLabel2
  other: number
  expenses: number
  expenseCategory: string         // one of a small fixed set, see Expense Categories below
  notes: string
  updatedAt: ISO timestamp
}

AppSettings (global, applies across all goals) {
  theme: 'dark' | 'light'
  currency: string                // display prefix, e.g. "KSh", "USD"
  activeGoalId: string
  pinEnabled: boolean
  pinHash: string | null          // SHA-256 hash via Web Crypto — never store the raw PIN
}

Per-goal unlocked achievements and crossed-milestone flags must be tracked
PER GOAL (not shared globally) — e.g. keyed as `${goalId}:${achievementId}`.
```

Net savings for a day = `income1 + income2 + other − expenses`. Current total savings for a goal = running sum of net savings across all its entries, in date order.

## MULTI-GOAL BEHAVIOR

- Exactly one goal is "active" at a time; all dashboard/history/analytics/calendar/achievements views operate on the active goal only.
- A goal switcher lives in the sidebar (e.g. a dropdown or a compact "current goal" chip you click to open a switch/create panel) — always visible, one click to change goals or create a new one.
- Creating a new goal: a short form (name, target amount, deadline are the minimum required fields; everything else can use sensible defaults and be edited later in Settings).
- Settings edits the ACTIVE goal's fields (name, photo, targets, dates, income labels) plus has a separate "Manage Goals" list to rename, switch, or delete any goal.
- Deleting a goal deletes its entries, unlocked achievements, and milestone flags along with it. Requires confirmation (and PIN if enabled). If it was the active goal, switch to another remaining goal, or prompt to create a new one if none remain.
- `theme`, `currency`, and PIN protection are app-wide, not per-goal.

## EXPENSE CATEGORIES

The Daily Entry form's Expenses field is paired with a category dropdown: **Transport, Data/Airtime, Materials, Food, Other**. Every entry with a nonzero expense stores a category. Analytics shows a breakdown (chart + totals) of spend by category, filterable to the active goal.

## PAGES / SECTIONS

Implement as a single-page app with client-side section switching (a sidebar nav + `.page` divs toggled via JS) rather than literal separate HTML files — this keeps navigation instant and offline caching simple. Sidebar items:

### 1. Dashboard
- Hero section: goal photo (or default SVG illustration if none uploaded), goal name as the big title, a short subtitle/tagline, and a row of stat chips: Start Date, Goal Amount, Stretch Goal, Deadline, Internal Goal Date.
- Live countdown chips: days to deadline, days to internal goal.
- A rotating daily motivational quote.
- Large animated horizontal progress bar (current amount / percentage / remaining amount).
- Circular gauge (tachometer-style) showing % complete.
- KPI grid: Current Savings, Remaining Amount, Today's Target, Income 1 Target, Income 2 Target, Days Remaining, Estimated Purchase Date (projected from current pace), Daily/Weekly/Monthly Average, Current Streak, Longest Streak, Days Ahead/Behind Target (color-coded), Savings Percentage.
- Milestone row: 25/50/75/100% cards that visually unlock (badge + animation + confetti) as they're crossed.
- Savings Growth chart (cumulative running total over time) and Goal Projection chart (actual pace vs. target pace vs. goal line) inline.

### 2. Daily Entry
- Date picker (defaults to today, editable to backfill/edit any past date).
- Fields: Income 1 (labeled per goal setting), Income 2 (labeled per goal setting), Other Income, Expenses + Expense Category dropdown, Notes.
- Live net-savings preview as you type.
- Save button that reads "Save Today" for a new date and "Update Today's Entry" when a record for that date already exists — saving the same date always updates in place, never creates a duplicate.
- Delete Last Entry, Reset Dashboard (PIN + confirmation gated), Cancel.

### 3. History
- Full table: Date, Income 1, Income 2, Other, Expenses (with category), Net Savings, Running Total, Actions (Edit/Delete per row, delete requires confirmation).
- Search/filter by date or note text.
- Export to CSV, Excel (.xlsx via SheetJS), and PDF (via jsPDF).
- One-click JSON backup download and a restore-from-backup file input (PIN gated, since it overwrites data).

### 4. Analytics
- Stat cards: Highest Trading/Income Day, Highest Printing/Income Day, Best/Worst Week, Best Month, Average Income 1/2, Average Daily Savings, Projected Finish Date.
- **Weekday Insights**: average net savings per weekday (Mon–Sun) as a small bar chart, plus a callout naming the best and worst weekday.
- **Expense Category breakdown**: doughnut/bar chart of total spend by category, plus a small totals list.
- **What-If Pace Calculator**: an interactive control (slider + number input) where the user enters a hypothetical daily savings amount; the UI live-recalculates and displays the resulting projected completion date and how many days sooner/later that is vs. the current actual pace — no page reload, updates on input.
- Charts: Daily Income, Weekly Income, Monthly Income, Income1-vs-Income2, Expenses.

### 5. Calendar
- Month grid, color-coded per day: green (daily target hit), yellow (partial — logged but below target), red (missed — logged with net ≤ 0), gray (no entry). Prev/month/next navigation. Clicking a day opens Daily Entry pre-filled with that date's record (or blank, for a new backfill).

### 6. Achievements
- Badge grid, locked/unlocked visual states, per-goal: First KSh 10,000 saved, First Month (30 days into the mission), 50/100/150 Days Consistent (entries logged), Halfway (50%), Three Quarters (75%), Goal Achieved (100%). Unlocking triggers confetti + a celebration modal.

### 7. Settings
- **Your Goal**: name, photo upload (auto-resize/compress client-side before storing as base64), goal amount, stretch goal, start date, deadline, internal goal date, mission statement, income source labels + their individual targets, daily target.
- **Manage Goals**: list all goals, switch/rename/delete, create new goal.
- **Security**: set/change/remove a PIN (4–8 digits, SHA-256 hashed); when enabled, a full-screen lock overlay gates app access on load, and Reset/Restore Backup require PIN re-entry. Include a clearly-labeled "Forgot your PIN?" recovery path that wipes all local data (since there is no server to recover a PIN through) — require the user to type a confirmation word before wiping.
- **Display**: theme (dark/light), currency symbol.

### 8. About
- Editable mission statement display, keyboard shortcut reference (page-jump number keys, `N` for new entry, `Ctrl/Cmd+S` to save, `Esc` to close dialogs).

## INTERACTION DETAILS

- Toast notifications for every save/update/delete/reset/export/backup action, plus milestone/achievement unlocks.
- A single reusable confirmation modal component for all "are you sure?" prompts.
- A single reusable PIN-prompt modal used to gate Reset, Restore Backup, and PIN changes — resolves as a promise-like callback so any critical action can wrap itself in it; skips straight through if no PIN is set.
- Disable the Save button while a save is processing to prevent double-submits.
- Keyboard shortcuts must not fire while typing in a form field, while the lock screen is showing, or while a PIN prompt is open.
- Respect `prefers-reduced-motion` by shortening/disabling animations.

## FILE STRUCTURE

```
/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   ├── styles.css        (theme tokens, layout, components)
│   ├── animations.css    (keyframes, confetti, transitions)
│   └── responsive.css    (breakpoints)
├── js/
│   ├── utils.js          (formatting, dates, counters, confetti, image compression, PIN hashing)
│   ├── storage.js        (localStorage layer: goals, entries, settings, achievements)
│   ├── notifications.js  (toast system)
│   ├── dashboard.js      (stats engine: KPIs, milestones, achievements, analytics, weekday/expense aggregation, what-if projection math)
│   ├── charts.js         (Chart.js definitions/updates)
│   ├── calendar.js       (monthly grid rendering)
│   └── app.js            (navigation, forms, goal switching, PIN flows, exports, main controller)
├── assets/icons/          (PWA icons)
└── README.md
```

## CODE QUALITY

Clean, commented, modular code with a clear separation between the data layer (`storage.js`), the stats/business logic (`dashboard.js`), and the UI controller (`app.js`). No global namespace pollution — wrap each module in an IIFE exposing a small public API. No duplicate logic between files. Every localStorage read/write goes through `storage.js`, never accessed directly elsewhere.

## FINAL BAR

Someone opening this app for the first time — regardless of what they're saving for — should be able to name their goal, optionally attach a photo of it, set a target and deadline, and start logging daily entries within a minute, while the whole experience feels like a premium fintech product they'd actually want to open every day.
