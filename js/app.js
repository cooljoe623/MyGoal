/* ============================================================
   APP.JS — application controller
   ============================================================ */

const App = (() => {

  let cachedStats = null;
  let pendingGoalPhoto = undefined; // undefined = no change, null = remove, string = new photo

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  function init() {
    Storage.migrateIfNeeded();
    applyTheme(Storage.getAppSettings().theme);

    // If cloud sync is configured, block the entire app behind a sign-in
    // gate immediately — before any content renders — so nothing is visible
    // until we know who's signed in (or that no one is).
    if (Sync.isConfigured()) showAuthGate('checking');

    bindNav();
    bindSidebarToggle();
    bindThemeToggle();
    bindGoalSwitcher();
    bindEntryForm();
    bindSettingsForm();
    bindHistoryPage();
    bindCalendarNav();
    bindModal();
    bindCelebrateOverlay();
    bindKeyboardShortcuts();
    bindWhatIfCalculator();
    bindCreateGoalModal();
    bindSyncUI();
    bindAuthGate();
    bindResetAppModal();
    CalendarView.init();

    document.getElementById('quoteText').textContent = Utils.quoteOfTheDay();
    document.getElementById('sidebarQuote').textContent = Utils.quoteOfTheDay();

    setDefaultEntryDate();
    Sync.init();
    renderEverything();
    registerServiceWorker();
    bindMidnightRefresh();
  }

  function renderEverything(skipSyncPush) {
    const stats = Dash.computeStats();
    cachedStats = stats;
    renderGoalSwitcher();
    renderHero(stats);
    renderProgress(stats);
    renderGauge(stats);
    renderKPIs(stats);
    renderTodaysTargets(stats);
    renderMilestones(stats);
    renderAnalyticsStats(stats);
    renderWeekdayAndCategoryText(stats);
    renderWhatIfCalculator(stats);
    renderAchievements(stats);
    renderHistoryTable();
    Charts.renderAll(stats);
    CalendarView.render();
    prefillEntryFormFromDate(document.getElementById('inputDatePicker').value);
    if (!skipSyncPush) Sync.scheduleSync();
  }

  /* ---------------------------------------------------------
     THEME
  --------------------------------------------------------- */
  function applyTheme(theme) {
    document.body.dataset.theme = theme === 'light' ? 'light' : 'dark';
  }
  function bindThemeToggle() {
    document.getElementById('btnThemeToggle').addEventListener('click', () => {
      const current = Storage.getAppSettings().theme;
      const next = current === 'light' ? 'dark' : 'light';
      Storage.saveAppSettings({ theme: next });
      applyTheme(next);
      const themeSel = document.getElementById('setTheme');
      if (themeSel) themeSel.value = next;
    });
  }

  /* ---------------------------------------------------------
     NAVIGATION
  --------------------------------------------------------- */
  const PAGE_ORDER = ['dashboard', 'entry', 'history', 'analytics', 'calendar', 'achievements', 'settings', 'about'];

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goToPage(btn.dataset.page));
    });
  }

  function goToPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');
    const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');
    closeSidebarMobile();
    if (page === 'calendar') CalendarView.render();
    if (page === 'analytics' || page === 'dashboard') Charts.renderAll(cachedStats || Dash.computeStats());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    document.getElementById('btnMenuToggle').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', closeSidebarMobile);
  }
  function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
  }

  /* ---------------------------------------------------------
     GOAL SWITCHER (sidebar)
  --------------------------------------------------------- */
  function bindGoalSwitcher() {
    document.getElementById('goalSwitcher').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '__new__') {
        renderGoalSwitcher(); // revert the select back to the active goal visually
        openCreateGoalModal();
        return;
      }
      Storage.setActiveGoalId(val);
      Notify.info(`Switched to "${Storage.getGoal(val).name}".`);
      renderEverything();
      loadSettingsForm();
    });
  }

  function renderGoalSwitcher() {
    const sel = document.getElementById('goalSwitcher');
    const goals = Storage.getGoals();
    const activeId = Storage.getActiveGoalId();
    sel.innerHTML = goals.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')
      + `<option value="__new__">➕ New Goal…</option>`;
    sel.value = activeId;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /* ---------------------------------------------------------
     CREATE GOAL MODAL
  --------------------------------------------------------- */
  function bindCreateGoalModal() {
    document.getElementById('createGoalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('newGoalName').value.trim();
      const amount = Number(document.getElementById('newGoalAmount').value);
      const deadline = document.getElementById('newGoalDeadline').value;
      if (!name || !amount || !deadline) { Notify.error('Name, amount, and deadline are required.'); return; }

      const goal = Storage.createGoal({
        name, targetAmount: amount, deadline,
        stretchGoal: Math.round(amount * 1.08),
      });
      Storage.setActiveGoalId(goal.id);
      closeCreateGoalModal();
      Notify.success(`"${name}" created — set as your active goal.`);
      renderEverything();
      Sync.pushNow(); // new goals are important enough to push immediately, not just debounced
      loadSettingsForm();
      goToPage('settings');
    });
    document.getElementById('createGoalCancel').addEventListener('click', closeCreateGoalModal);
    document.getElementById('newGoalDeadline').addEventListener('change', syncNewGoalDaysToSaveFromDeadline);
    document.getElementById('newGoalDaysToSave').addEventListener('input', syncNewGoalDeadlineFromDaysToSave);
  }
  function openCreateGoalModal() {
    document.getElementById('createGoalForm').reset();
    document.getElementById('createGoalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('newGoalName').focus(), 50);
  }
  function closeCreateGoalModal() {
    document.getElementById('createGoalOverlay').classList.remove('show');
  }

  /** Deadline in the Create Goal modal is implicitly "days from today", since
   *  a brand-new goal's start date defaults to today (there's no start-date
   *  field in this quick-create form — that's editable afterward in Settings). */
  function syncNewGoalDaysToSaveFromDeadline() {
    const deadline = document.getElementById('newGoalDeadline').value;
    const daysInput = document.getElementById('newGoalDaysToSave');
    if (deadline) {
      const days = Utils.daysBetween(Utils.todayStr(), deadline);
      if (days > 0) daysInput.value = days;
    }
  }
  function syncNewGoalDeadlineFromDaysToSave() {
    const days = Number(document.getElementById('newGoalDaysToSave').value);
    if (days > 0) {
      document.getElementById('newGoalDeadline').value = Dash.addDays(Utils.todayStr(), days);
    }
  }

  /* ---------------------------------------------------------
     HERO / COUNTDOWN
  --------------------------------------------------------- */
  function renderHero(stats) {
    const g = stats.goal || {};
    const goalName = g.name || 'My Goal';

    document.getElementById('heroGoal').textContent = Utils.formatCurrency(stats.goalAmount);
    document.getElementById('heroStretch').textContent = Utils.formatCurrency(g.stretchGoal);
    document.getElementById('heroDeadline').textContent = g.deadline ? Utils.prettyDate(g.deadline) : '—';
    document.getElementById('heroStart').textContent = g.startDate ? Utils.prettyDate(g.startDate) : '—';
    document.getElementById('countdownDays').textContent = Math.max(stats.daysRemaining, 0);

    document.getElementById('heroTitle').textContent = goalName.toUpperCase();
    document.title = `${goalName} — Savings Dashboard`;

    const initials = goalName.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'GM';
    document.getElementById('topbarBrandMark').textContent = initials;
    document.getElementById('topbarBrandName').textContent = goalName.toUpperCase();
    document.getElementById('sidebarBrandTitle').textContent = goalName.length > 18 ? goalName.slice(0, 18) + '…' : goalName;
    document.getElementById('sidebarBrandSub').textContent = 'MISSION';

    const photoEl = document.getElementById('heroPhoto');
    const fallbackEl = document.getElementById('heroSvgFallback');
    if (g.photo) {
      photoEl.src = g.photo;
      photoEl.hidden = false;
      fallbackEl.style.display = 'none';
    } else {
      photoEl.hidden = true;
      fallbackEl.style.display = '';
    }

    document.getElementById('aboutMissionText').textContent = `"${g.missionStatement || ''}"`;
  }

  /* ---------------------------------------------------------
     PROGRESS BAR + GAUGE
  --------------------------------------------------------- */
  function renderProgress(stats) {
    const pct = Utils.clamp(stats.percentage, 0, 100);
    const fill = document.getElementById('progressBarFill');
    requestAnimationFrame(() => { fill.style.width = pct + '%'; });
    document.getElementById('progressPercentText').textContent = pct.toFixed(1) + '%';
    document.getElementById('progressAmountText').textContent = Utils.formatCurrency(stats.currentSavings);
    document.getElementById('progressRemainingText').textContent = `${Utils.formatCurrency(stats.remaining)} remaining`;
  }

  function renderGauge(stats) {
    const pct = Utils.clamp(stats.percentage, 0, 100);
    const circle = document.getElementById('gaugeCircle');
    const radius = 68;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    requestAnimationFrame(() => {
      circle.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;
    });
    document.getElementById('gaugePercentText').textContent = Math.round(pct) + '%';
  }

  /* ---------------------------------------------------------
     KPI GRID
  --------------------------------------------------------- */
  function renderKPIs(stats) {
    document.getElementById('kpiCurrentSavings').textContent = Utils.formatCurrency(stats.currentSavings);
    document.getElementById('kpiRemaining').textContent = Utils.formatCurrency(stats.remaining);
    document.getElementById('kpiDaysRemaining').textContent = Math.max(stats.daysRemaining, 0);
    document.getElementById('kpiEstPurchase').textContent = stats.remaining > 0
      ? `${Utils.prettyDate(stats.estimatedPurchaseDate)} (${stats.daysNeededFromNow} day${stats.daysNeededFromNow === 1 ? '' : 's'})`
      : 'Goal reached!';
    document.getElementById('kpiEstPurchaseAtTarget').textContent = stats.remaining <= 0 ? 'Goal reached!' :
      (stats.estimatedPurchaseDateAtTarget
        ? `${Utils.prettyDate(stats.estimatedPurchaseDateAtTarget)} (${stats.daysNeededAtTarget} day${stats.daysNeededAtTarget === 1 ? '' : 's'})`
        : '— set a daily target in Settings —');
    document.getElementById('kpiDailyAvg').textContent = Utils.formatCurrency(stats.currentDailyAverage);
    document.getElementById('kpiWeeklyAvg').textContent = Utils.formatCurrency(stats.weeklyAverage);
    document.getElementById('kpiMonthlyAvg').textContent = Utils.formatCurrency(stats.monthlyAverage);
    document.getElementById('kpiCurrentStreak').textContent = `${stats.currentStreak} days`;
    document.getElementById('kpiLongestStreak').textContent = `${stats.longestStreak} days`;
    const ab = stats.daysAheadBehind;
    const abEl = document.getElementById('kpiAheadBehind');
    abEl.textContent = ab === 0 ? 'On pace' : (ab > 0 ? `${ab} days ahead` : `${Math.abs(ab)} days behind`);
    abEl.style.color = ab >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('kpiPercentage').textContent = stats.percentage.toFixed(1) + '%';
  }

  /* ---------------------------------------------------------
     TODAY'S TARGETS — resets automatically at local midnight
     (see the midnight-refresh timer), hides each target once
     it's been met for today, and shows the remaining balance
     when it's only partially met.
  --------------------------------------------------------- */
  function renderTodaysTargets(stats) {
    const grid = document.getElementById('todaysTargetsGrid');
    const cards = [];

    if ((stats.goal && stats.goal.dailyTarget) > 0) {
      if (!stats.todaysTargetMet) {
        cards.push(`
          <div class="glass-card kpi-card kpi-gold">
            <span class="kpi-label">Today's Overall Target — Remaining</span>
            <span class="kpi-value">${Utils.formatCurrency(stats.todaysRemaining)}</span>
          </div>
        `);
      }
    }

    stats.todaysSourceBreakdown.forEach(src => {
      if (src.target <= 0 || src.met) return; // fully met or no target set — nothing to show
      cards.push(`
        <div class="glass-card kpi-card">
          <span class="kpi-label">${escapeHtml(src.label)} — Remaining Today</span>
          <span class="kpi-value">${Utils.formatCurrency(src.remainingToday)}</span>
        </div>
      `);
    });

    if (!cards.length) {
      grid.innerHTML = `
        <div class="glass-card kpi-card kpi-gold">
          <span class="kpi-label">All Today's Targets</span>
          <span class="kpi-value">Met ✓</span>
        </div>
      `;
    } else {
      grid.innerHTML = cards.join('');
    }
  }

  /* ---------------------------------------------------------
     MILESTONES
  --------------------------------------------------------- */
  function renderMilestones(stats) {
    const row = document.getElementById('milestonesRow');
    const milestones = Dash.getMilestones(stats);
    row.innerHTML = milestones.map(m => `
      <div class="glass-card milestone-card ${m.unlocked ? 'unlocked' : ''}">
        <div class="milestone-badge">${m.unlocked ? '🏆' : '🔒'}</div>
        <div class="milestone-pct">${m.pct}%</div>
        <div class="milestone-amount">${Utils.formatCurrency(m.amount)}</div>
        <div class="milestone-status">${m.unlocked ? 'Unlocked' : 'Locked'}</div>
      </div>
    `).join('');
  }

  /* ---------------------------------------------------------
     ANALYTICS PAGE
  --------------------------------------------------------- */
  function renderAnalyticsStats(stats) {
    const a = Dash.analytics(stats);
    const grid = document.getElementById('analyticsStatsGrid');
    if (!a) {
      grid.innerHTML = `<div class="glass-card kpi-card"><span class="kpi-label">No data yet</span><span class="kpi-value small">Log entries to see analytics</span></div>`;
      document.getElementById('weekdayInsightText').textContent = 'Log a few entries to see weekday patterns.';
      document.getElementById('categoryTotalsList').innerHTML = '';
      return;
    }
    const cards = [];
    a.incomeSourceStats.forEach(src => {
      cards.push([`Highest ${src.label} Day`, `${Utils.formatCurrency(src.highestAmount)} — ${Utils.shortDate(src.highestEntry.date)}`]);
      cards.push([`Average ${src.label}`, Utils.formatCurrency(src.average)]);
    });
    cards.push(
      ['Best Week', a.bestWeek ? Utils.formatCurrency(a.bestWeek[1]) : '—'],
      ['Worst Week', a.worstWeek ? Utils.formatCurrency(a.worstWeek[1]) : '—'],
      ['Best Month', a.bestMonth ? `${Utils.formatCurrency(a.bestMonth[1])} — ${a.bestMonth[0]}` : '—'],
      ['Average Daily Savings', Utils.formatCurrency(stats.currentDailyAverage)],
      ['Projected Finish Date', stats.remaining > 0 ? Utils.prettyDate(a.forecastDate) : 'Achieved']
    );
    grid.innerHTML = cards.map(([label, val]) => `
      <div class="glass-card kpi-card">
        <span class="kpi-label">${escapeHtml(label)}</span>
        <span class="kpi-value small">${val}</span>
      </div>
    `).join('');
  }

  function renderWeekdayAndCategoryText(stats) {
    const a = Dash.analytics(stats);
    const wdEl = document.getElementById('weekdayInsightText');
    const catList = document.getElementById('categoryTotalsList');
    if (!a || !a.weekdayAverages.length) {
      wdEl.textContent = 'Log a few entries to see weekday patterns.';
    } else {
      const best = a.bestWeekday, worst = a.worstWeekday;
      wdEl.innerHTML = `Best day: <strong>${best.name}</strong> (avg ${Utils.formatCurrency(best.average)}) — Weakest day: <strong>${worst.name}</strong> (avg ${Utils.formatCurrency(worst.average)}).`;
    }
    if (!a || !a.categoryTotals.length) {
      catList.innerHTML = '<li class="cat-empty">No expenses logged yet.</li>';
    } else {
      catList.innerHTML = a.categoryTotals
        .sort((x, y) => y.total - x.total)
        .map(c => `<li><span>${c.category}</span><strong>${Utils.formatCurrency(c.total)}</strong></li>`)
        .join('');
    }
  }

  /* ---------------------------------------------------------
     WHAT-IF PACE CALCULATOR
  --------------------------------------------------------- */
  function bindWhatIfCalculator() {
    const slider = document.getElementById('whatifSlider');
    const input = document.getElementById('whatifInput');
    const sync = (val) => {
      slider.value = val;
      input.value = val;
      updateWhatIfResult(Number(val));
    };
    slider.addEventListener('input', () => sync(slider.value));
    input.addEventListener('input', () => sync(input.value));
  }

  function renderWhatIfCalculator(stats) {
    const g = stats.goal || {};
    const dailyTarget = Number(g.dailyTarget) || 1000;
    const slider = document.getElementById('whatifSlider');
    slider.min = 0;
    slider.max = Math.max(dailyTarget * 3, 500);
    slider.step = Math.max(Math.round(dailyTarget / 20), 1);
    if (!slider.dataset.touched) {
      slider.value = dailyTarget;
      document.getElementById('whatifInput').value = dailyTarget;
    }
    updateWhatIfResult(Number(slider.value));
  }

  function updateWhatIfResult(rate) {
    if (!cachedStats) return;
    document.getElementById('whatifSlider').dataset.touched = '1';
    const result = Dash.projectWithDailyRate(cachedStats, rate);
    const out = document.getElementById('whatifResult');
    if (cachedStats.remaining <= 0) {
      out.innerHTML = `Goal already reached! 🎉`;
      return;
    }
    if (!rate || !result.finishDate) {
      out.innerHTML = `Enter a daily amount above zero to see a projection.`;
      return;
    }
    const diff = result.daysDiffVsCurrentPace;
    let diffText = '';
    if (diff !== null) {
      if (diff > 0) diffText = `<span class="whatif-good">${diff} days sooner</span> than your current pace.`;
      else if (diff < 0) diffText = `<span class="whatif-bad">${Math.abs(diff)} days later</span> than your current pace.`;
      else diffText = `about the same as your current pace.`;
    }
    out.innerHTML = `At ${Utils.formatCurrency(rate)}/day, you'd finish on <strong>${Utils.prettyDate(result.finishDate)}</strong> — ${diffText}`;
  }

  /* ---------------------------------------------------------
     ACHIEVEMENTS PAGE
  --------------------------------------------------------- */
  function renderAchievements(stats) {
    const unlocked = new Set(Storage.getUnlockedAchievements(stats.goal ? stats.goal.id : null));
    const grid = document.getElementById('achievementsGrid');
    grid.innerHTML = Dash.ACHIEVEMENTS.map(a => `
      <div class="glass-card achievement-card ${unlocked.has(a.id) ? 'unlocked' : 'locked'}">
        <div class="achievement-icon">${a.icon}</div>
        <div class="achievement-label">${a.label}</div>
        <div class="achievement-desc">${a.desc}</div>
        <div class="achievement-state">${unlocked.has(a.id) ? 'Unlocked' : 'Locked'}</div>
      </div>
    `).join('');
  }

  /* ---------------------------------------------------------
     DAILY ENTRY FORM
  --------------------------------------------------------- */
  function setDefaultEntryDate() {
    document.getElementById('inputDatePicker').value = Utils.todayStr();
    document.getElementById('inputDatePicker').max = Utils.todayStr();
  }

  /** Rebuilds the income-source input rows to match the active goal's
   *  current list of sources — called whenever the entry form needs to
   *  reflect the goal in view (date change, goal switch, settings save). */
  function renderEntryIncomeFields(goal) {
    const container = document.getElementById('entryIncomeFields');
    const sources = (goal && goal.incomeSources) || [];
    if (!sources.length) {
      container.innerHTML = '<p class="section-sub">No income sources yet — add one in Settings.</p>';
      return;
    }
    container.innerHTML = sources.map(src => `
      <div class="form-row">
        <label>${escapeHtml(src.label)}</label>
        <input type="number" step="0.01" min="0" class="entry-income-input" data-source-id="${src.id}" placeholder="0.00">
      </div>
    `).join('');
    container.querySelectorAll('.entry-income-input').forEach(input => {
      input.addEventListener('input', updateNetPreview);
    });
  }

  function prefillEntryFormFromDate(dateStr) {
    if (!dateStr) return;
    const goal = Storage.getActiveGoal();
    renderEntryIncomeFields(goal);
    const entry = Storage.getEntryByDate(dateStr);
    document.getElementById('inputDate').value = dateStr;
    (goal && goal.incomeSources || []).forEach(src => {
      const input = document.querySelector(`.entry-income-input[data-source-id="${src.id}"]`);
      if (input) input.value = entry ? (Storage.incomeAmount(entry, src.id) || '') : '';
    });
    document.getElementById('inputOther').value = entry ? entry.other || '' : '';
    document.getElementById('inputExpenses').value = entry ? entry.expenses || '' : '';
    document.getElementById('inputExpenseCategory').value = entry ? (entry.expenseCategory || '') : '';
    document.getElementById('inputNotes').value = entry ? entry.notes || '' : '';
    updateEntryButtonLabel();
    updateNetPreview();
  }

  function updateEntryButtonLabel() {
    const btn = document.getElementById('btnSaveToday');
    const dateStr = document.getElementById('inputDatePicker').value;
    const exists = !!Storage.getEntryByDate(dateStr);
    btn.textContent = exists ? "Update Today's Entry" : 'Save Today';
  }

  function updateNetPreview() {
    const incomeTotal = Array.from(document.querySelectorAll('.entry-income-input'))
      .reduce((sum, input) => sum + (Number(input.value) || 0), 0);
    const other = Number(document.getElementById('inputOther').value) || 0;
    const expenses = Number(document.getElementById('inputExpenses').value) || 0;
    const net = incomeTotal + other - expenses;
    const el = document.getElementById('entryNetPreview');
    el.textContent = Utils.formatCurrency(net);
    el.style.color = net >= 0 ? 'var(--gold)' : 'var(--red)';
  }

  function bindEntryForm() {
    const form = document.getElementById('entryForm');
    const datePicker = document.getElementById('inputDatePicker');

    datePicker.addEventListener('change', () => prefillEntryFormFromDate(datePicker.value));
    ['inputOther', 'inputExpenses'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateNetPreview);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveToday');
      saveBtn.disabled = true;

      const dateStr = datePicker.value || Utils.todayStr();
      const wasExisting = !!Storage.getEntryByDate(dateStr);
      const expenses = Number(document.getElementById('inputExpenses').value) || 0;
      const incomes = {};
      document.querySelectorAll('.entry-income-input').forEach(input => {
        incomes[input.dataset.sourceId] = Number(input.value) || 0;
      });
      const entry = {
        date: dateStr,
        incomes,
        other: Number(document.getElementById('inputOther').value) || 0,
        expenses,
        expenseCategory: expenses > 0 ? (document.getElementById('inputExpenseCategory').value || 'Other') : '',
        notes: document.getElementById('inputNotes').value.trim()
      };
      Storage.upsertEntry(entry);

      setTimeout(() => {
        saveBtn.disabled = false;
        Notify.success(wasExisting ? 'Entry updated successfully.' : 'Entry saved successfully.');
        const stats = Dash.computeStats();
        const newMilestones = Dash.checkNewMilestones(stats);
        const newAchievements = Dash.checkNewAchievements(stats);
        renderEverything();
        if (newMilestones.length) celebrateMilestone(newMilestones[newMilestones.length - 1], stats);
        else if (newAchievements.length) celebrateAchievement(newAchievements[newAchievements.length - 1]);
      }, 250);
    });

    document.getElementById('btnDeleteLast').addEventListener('click', () => {
      confirmAction('Delete Last Entry', 'This will permanently remove the most recent entry for this goal. Continue?', () => {
        const removed = Storage.deleteLastEntry();
        if (removed) {
          Notify.success('Last entry deleted.');
          renderEverything();
        } else {
          Notify.info('No entries to delete.');
        }
      });
    });

    document.getElementById('btnResetDashboard').addEventListener('click', () => {
      const goalName = (Storage.getActiveGoal() || {}).name || 'this goal';
      confirmAction('Reset This Goal', `This permanently deletes every entry, streak, and achievement for "${goalName}". Your goal settings (name, targets, dates) and any other goals are kept. This cannot be undone.`, () => {
        Storage.resetGoalData(Storage.getActiveGoalId());
        Charts.destroyAll();
        Notify.warning('Goal data reset. Starting fresh.');
        setDefaultEntryDate();
        renderEverything();
        loadSettingsForm();
      });
    });

    document.getElementById('btnCancelEntry').addEventListener('click', () => {
      setDefaultEntryDate();
      prefillEntryFormFromDate(Utils.todayStr());
      goToPage('dashboard');
    });
  }

  function openEntryForDate(dateStr) {
    goToPage('entry');
    document.getElementById('inputDatePicker').value = dateStr;
    prefillEntryFormFromDate(dateStr);
  }

  /* ---------------------------------------------------------
     CELEBRATIONS
  --------------------------------------------------------- */
  function bindCelebrateOverlay() {
    document.getElementById('celebrateClose').addEventListener('click', () => {
      document.getElementById('celebrateOverlay').classList.remove('show');
    });
  }
  function celebrateMilestone(m, stats) {
    Utils.confettiBurst(160);
    const goalName = (stats.goal && stats.goal.name) || 'Your Goal';
    document.getElementById('celebrateTitle').textContent = m.pct === 100 ? `${goalName} Unlocked! 🎉` : 'Milestone Unlocked!';
    document.getElementById('celebrateMessage').textContent = `You've reached ${m.pct}% — ${Utils.formatCurrency(m.amount)} saved.`;
    document.getElementById('celebrateOverlay').classList.add('show');
    Notify.milestone(`Milestone reached: ${m.pct}% of your goal!`);
  }
  function celebrateAchievement(a) {
    Utils.confettiBurst(90);
    document.getElementById('celebrateTitle').textContent = `${a.icon} ${a.label}`;
    document.getElementById('celebrateMessage').textContent = a.desc;
    document.getElementById('celebrateOverlay').classList.add('show');
    Notify.milestone(`Achievement unlocked: ${a.label}`);
  }

  /* ---------------------------------------------------------
     HISTORY TABLE
  --------------------------------------------------------- */
  function renderHistoryTable(filter = '') {
    const tbody = document.getElementById('historyTableBody');
    const emptyMsg = document.getElementById('historyEmpty');
    const stats = Dash.computeStats();
    const sources = (stats.goal && stats.goal.incomeSources) || [];
    let entries = stats.entries.slice().reverse();

    if (filter) {
      const f = filter.toLowerCase();
      entries = entries.filter(e => e.date.includes(f) || (e.notes || '').toLowerCase().includes(f));
    }

    // Header row matches the active goal's current income sources
    document.getElementById('historyTableHeadRow').innerHTML =
      `<th>Date</th>${sources.map(s => `<th>${escapeHtml(s.label)}</th>`).join('')}<th>Other</th><th>Expenses</th><th>Net Savings</th><th>Running Total</th><th>Notes</th><th>Actions</th>`;

    emptyMsg.style.display = entries.length ? 'none' : 'block';

    tbody.innerHTML = entries.map(e => `
      <tr data-date="${e.date}">
        <td>${Utils.shortDate(e.date)}</td>
        ${sources.map(s => `<td>${Utils.formatCurrency(Storage.incomeAmount(e, s.id))}</td>`).join('')}
        <td>${Utils.formatCurrency(e.other)}</td>
        <td>${Utils.formatCurrency(e.expenses)}${e.expenseCategory ? `<span class="cat-tag">${e.expenseCategory}</span>` : ''}</td>
        <td class="${e.net >= 0 ? 'net-pos' : 'net-neg'}">${Utils.formatCurrency(e.net)}</td>
        <td>${Utils.formatCurrency(e.runningTotal)}</td>
        <td class="note-cell" title="${e.notes ? escapeHtml(e.notes) : ''}">${e.notes ? escapeHtml(e.notes) : '<span class="note-empty">—</span>'}</td>
        <td class="row-actions">
          <button class="icon-btn small" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn small" data-action="delete" title="Delete">✕</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(row => {
      const date = row.dataset.date;
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openEntryForDate(date));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        confirmAction('Delete Entry', `Delete the entry for ${Utils.prettyDate(date)}? This cannot be undone.`, () => {
          Storage.deleteEntryByDate(date);
          Notify.success('Entry deleted successfully.');
          renderEverything();
        });
      });
    });
  }

  function bindHistoryPage() {
    document.getElementById('historySearch').addEventListener('input', Utils.debounce((e) => {
      renderHistoryTable(e.target.value);
    }, 200));

    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
    document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
    document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
    document.getElementById('btnBackup').addEventListener('click', downloadBackup);
    document.getElementById('fileRestore').addEventListener('change', restoreBackupFile);
  }

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */
  function tableRowsForExport() {
    const stats = Dash.computeStats();
    const sources = (stats.goal && stats.goal.incomeSources) || [];
    // Disambiguate duplicate labels so they don't collide as object keys / CSV columns
    const seen = {};
    const columnNames = sources.map(s => {
      const base = s.label || 'Income';
      seen[base] = (seen[base] || 0) + 1;
      return seen[base] > 1 ? `${base} (${seen[base]})` : base;
    });
    return stats.entries.map(e => {
      const row = { Date: e.date };
      sources.forEach((s, i) => { row[columnNames[i]] = Storage.incomeAmount(e, s.id); });
      row.Other = e.other;
      row.Expenses = e.expenses;
      row.ExpenseCategory = e.expenseCategory || '';
      row.NetSavings = e.net;
      row.RunningTotal = e.runningTotal;
      row.Notes = e.notes || '';
      return row;
    });
  }

  function exportCSV() {
    const rows = tableRowsForExport();
    if (!rows.length) { Notify.info('No data to export.'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(
      rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
    ).join('\n');
    Utils.downloadBlob(new Blob([csv], { type: 'text/csv' }), 'goal-tracker-history.csv');
    Notify.success('CSV exported successfully.');
  }

  async function exportExcel() {
    const rows = tableRowsForExport();
    if (!rows.length) { Notify.info('No data to export.'); return; }
    if (typeof XLSX === 'undefined') {
      try {
        Notify.info('Loading Excel export…');
        await Utils.loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      } catch (err) {
        Notify.error('Could not load the Excel export library — check your connection.');
        return;
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'History');
    XLSX.writeFile(wb, 'goal-tracker-history.xlsx');
    Notify.success('Excel file exported successfully.');
  }

  async function exportPDF() {
    const rows = tableRowsForExport();
    if (!rows.length) { Notify.info('No data to export.'); return; }
    if (typeof jspdf === 'undefined') {
      try {
        Notify.info('Loading PDF export…');
        await Utils.loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      } catch (err) {
        Notify.error('Could not load the PDF export library — check your connection.');
        return;
      }
    }
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const goalName = (Storage.getActiveGoal() || {}).name || 'Goal Tracker';
    doc.setFontSize(16);
    doc.text(`${goalName} — History`, 14, 16);
    doc.setFontSize(9);
    let y = 26;
    const headers = Object.keys(rows[0]);
    doc.text(headers.join('   |   '), 14, y);
    y += 6;
    rows.forEach(r => {
      if (y > 280) { doc.addPage(); y = 16; }
      doc.text(headers.map(h => r[h]).join('   '), 14, y);
      y += 6;
    });
    doc.save('goal-tracker-history.pdf');
    Notify.success('PDF exported successfully.');
  }

  function downloadBackup() {
    const data = Storage.exportBackup();
    Utils.downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `goal-tracker-backup-${Utils.todayStr()}.json`);
    Notify.success('Backup downloaded — includes all goals.');
  }

  function restoreBackupFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    confirmAction('Restore Backup', 'This will overwrite current data with the contents of the backup file. Continue?', () => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          Storage.restoreBackup(data);
          Notify.success('Backup restored successfully.');
          applyTheme(Storage.getAppSettings().theme);
          renderEverything();
          loadSettingsForm();
        } catch (err) {
          Notify.error('Could not read backup file.');
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }

  /* ---------------------------------------------------------
     AUTH GATE (shown when Cloud Sync is configured — blocks all
     app content until the person is signed in with their account)
  --------------------------------------------------------- */
  function showAuthGate(mode) {
    const gate = document.getElementById('authGateScreen');
    const checking = document.getElementById('gateCheckingState');
    const form = document.getElementById('gateAuthForm');
    if (mode === 'checking') {
      checking.hidden = false;
      form.hidden = true;
    } else {
      checking.hidden = true;
      form.hidden = false;
      document.getElementById('gateError').textContent = '';
      setTimeout(() => document.getElementById('gateEmail').focus(), 50);
    }
    gate.classList.add('show');
  }
  function hideAuthGate() {
    document.getElementById('authGateScreen').classList.remove('show');
  }

  function bindAuthGate() {
    document.getElementById('btnGateSignIn').addEventListener('click', async () => {
      const email = document.getElementById('gateEmail').value.trim();
      const password = document.getElementById('gatePassword').value;
      const errEl = document.getElementById('gateError');
      errEl.textContent = '';
      if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
      try {
        await Sync.signIn(email, password);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    document.getElementById('btnGateSignUp').addEventListener('click', async () => {
      const email = document.getElementById('gateEmail').value.trim();
      const password = document.getElementById('gatePassword').value;
      const errEl = document.getElementById('gateError');
      errEl.textContent = '';
      if (!email || !password) { errEl.textContent = 'Enter an email and password.'; return; }
      if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
      try {
        await Sync.signUp(email, password);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    document.getElementById('btnGateForgotPassword').addEventListener('click', async () => {
      const email = document.getElementById('gateEmail').value.trim();
      const errEl = document.getElementById('gateError');
      errEl.style.color = '';
      if (!email) { errEl.textContent = 'Enter your email above first, then click this again.'; return; }
      try {
        await Sync.resetPassword(email);
        errEl.style.color = 'var(--green)';
        errEl.textContent = 'Password reset email sent — check your inbox.';
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    document.getElementById('btnGateResetApp').addEventListener('click', () => openResetAppModal());
  }

  /* ---------------------------------------------------------
     RESET APP (shared by the gate's "Reset App" and Settings'
     "Danger Zone" — wipes all local data, and also deletes the
     account + cloud data if currently signed in)
  --------------------------------------------------------- */
  function openResetAppModal() {
    const signedIn = Sync.isSignedIn();
    const email = Sync.currentEmail();
    document.getElementById('resetAppMessage').innerHTML = signedIn
      ? `This will try to permanently delete your account (<strong>${escapeHtml(email)}</strong>), all cloud data, and everything stored locally on this device. This cannot be undone. <em>Note: if your sign-in session isn't recent, Firebase may block the account deletion for security — if that happens, you'll still be signed out and local data will still be erased, but the account itself would remain (you could recover it via "Forgot password").</em>`
      : (Sync.isConfigured()
          ? `This permanently erases all data stored locally on this device. Your account (if you have one) will <strong>not</strong> be deleted — you can still sign in normally afterward, use "Forgot password" to regain access, or create a new account to start fresh.`
          : `This permanently erases all data stored locally on this device. This cannot be undone.`);
    document.getElementById('resetAppConfirmText').value = '';
    document.getElementById('resetAppError').textContent = '';
    document.getElementById('resetAppOverlay').classList.add('show');
    setTimeout(() => document.getElementById('resetAppConfirmText').focus(), 50);
  }
  function closeResetAppModal() {
    document.getElementById('resetAppOverlay').classList.remove('show');
  }

  function bindResetAppModal() {
    document.getElementById('resetAppCancel').addEventListener('click', closeResetAppModal);
    document.getElementById('resetAppConfirm').addEventListener('click', async () => {
      const errEl = document.getElementById('resetAppError');
      if (document.getElementById('resetAppConfirmText').value.trim() !== 'DELETE') {
        errEl.textContent = 'Type DELETE exactly to confirm.';
        return;
      }
      const confirmBtn = document.getElementById('resetAppConfirm');
      confirmBtn.disabled = true;
      let accountDeleted = false;
      let accountDeletionFailed = false;

      if (Sync.isSignedIn()) {
        try {
          await Sync.deleteAccount();
          accountDeleted = true;
        } catch (err) {
          // Most commonly Firebase's "requires-recent-login" security check —
          // it won't let an old/stale session delete the account outright.
          // Don't dead-end here: fall back to signing out (no password
          // needed) and wiping local data, so Reset App always succeeds at
          // getting the person to a clean, usable app either way.
          accountDeletionFailed = true;
          console.warn('Account deletion failed, falling back to local-only reset:', err.message);
          try { await Sync.signOutUser(); } catch (e2) { /* ignore */ }
        }
      }

      Storage.eraseEverything();
      Charts.destroyAll();
      confirmBtn.disabled = false;
      closeResetAppModal();
      setDefaultEntryDate();
      renderEverything();
      loadSettingsForm();

      if (accountDeletionFailed) {
        Notify.warning("Local data erased and you've been signed out. Your account itself couldn't be deleted for security reasons (it needs a recent sign-in) — it still exists with its cloud data. Use \"Forgot password\" to regain access if you want it back, or just continue fresh.", 9000);
      } else if (accountDeleted) {
        Notify.warning('Account and all data permanently deleted.');
      } else {
        Notify.warning('Everything erased. Starting fresh.');
      }
    });
  }

  /* ---------------------------------------------------------
     CLOUD SYNC (Firebase email/password)
  --------------------------------------------------------- */
  function bindSyncUI() {
    renderSyncStatus();

    document.getElementById('btnSyncSignOut').addEventListener('click', () => {
      confirmAction('Sign Out', 'This device will stop syncing until you sign in again. Local data already on this device stays put.', async () => {
        await Sync.signOutUser();
        Notify.info('Signed out.');
        renderSyncStatus();
      });
    });

    document.getElementById('btnSyncNow').addEventListener('click', async () => {
      Notify.info('Syncing…');
      await Sync.pullAndMerge();
      await Sync.pushNow();
      renderEverything();
      loadSettingsForm();
      Notify.success('Sync complete.');
    });

    document.getElementById('btnResetApp').addEventListener('click', () => openResetAppModal());
  }

  function renderSyncStatus() {
    const banner = document.getElementById('syncStatusBanner');
    const signedInPanel = document.getElementById('syncSignedInPanel');
    const dangerNote = document.getElementById('dangerZoneAccountNote');

    if (!Sync.isConfigured()) {
      banner.innerHTML = 'Cloud sync isn\'t set up yet. Your data stays on this device only. See <strong>SYNC_SETUP.md</strong> in the app folder for a 5-minute setup guide (free Firebase project + email/password sign-in).';
      signedInPanel.hidden = true;
      dangerNote.textContent = '';
      return;
    }

    if (Sync.isSignedIn()) {
      banner.innerHTML = 'Cloud sync is active. Changes on this device sync automatically to your account and to any other device signed in with it.';
      signedInPanel.hidden = false;
      document.getElementById('syncSignedInText').innerHTML = `Signed in as <strong>${escapeHtml(Sync.currentEmail())}</strong>.`;
      dangerNote.textContent = "If you're signed in, this also deletes your account and cloud data — you'd need to create a new account to use sync again.";
    } else {
      // Configured but not signed in — the sign-in gate covers this case
      // before Settings is ever reachable, so this is just a safety fallback.
      banner.innerHTML = 'Sign in to sync your goals across devices.';
      signedInPanel.hidden = true;
      dangerNote.textContent = '';
    }
  }

  // --- Hooks called by sync.js — kept on the public App API ---
  function onSyncSignedIn(user) {
    // Called the moment sign-in is CONFIRMED, before the (slower) background
    // data pull finishes — hides the gate and shows whatever's already
    // local immediately, rather than making people wait on a network round
    // trip just to see the app. If the pull brings in changes, that arrives
    // separately via onSyncRemoteUpdate below and updates the view then.
    hideAuthGate();
    renderSyncStatus();
    renderEverything();
    loadSettingsForm();
    Notify.success('Signed in — syncing…');
  }
  function onSyncSignedOut() {
    if (Sync.isConfigured()) showAuthGate('form');
    renderSyncStatus();
  }
  function onSyncRemoteUpdate(result) {
    renderEverything(true); // true = don't immediately re-push what we just pulled
    loadSettingsForm();
    Notify.info(result.addedGoals ? `Synced ${result.addedGoals} goal${result.addedGoals === 1 ? '' : 's'} from your account.` : 'Synced updates from your account.');
  }
  function onAccountSwitched(result) {
    Charts.destroyAll();
    setDefaultEntryDate();
    renderEverything(true);
    loadSettingsForm();
    const goalCount = Storage.getGoals().length;
    Notify.success(`Switched accounts — showing ${Sync.currentEmail()}'s ${goalCount} goal${goalCount === 1 ? '' : 's'}.`, 6000);
  }
  function onSyncPushed() {
    // Silent — avoid toast spam on every autosave. Status banner already says "active".
  }
  function onSyncError(err) {
    Notify.error('Sync error — will retry automatically.');
  }

  /* ---------------------------------------------------------
     SETTINGS PAGE
  --------------------------------------------------------- */
  function loadSettingsForm() {
    const goal = Storage.getActiveGoal() || {};
    const app = Storage.getAppSettings();

    document.getElementById('setGoalName').value = goal.name || '';
    document.getElementById('setMission').value = goal.missionStatement || '';
    document.getElementById('setGoal').value = goal.targetAmount || '';
    document.getElementById('setStretchGoal').value = goal.stretchGoal || '';
    document.getElementById('setStartDate').value = goal.startDate || '';
    document.getElementById('setDeadline').value = goal.deadline || '';
    document.getElementById('setDailyTarget').value = goal.dailyTarget || '';
    document.getElementById('setTheme').value = app.theme;
    document.getElementById('setCurrency').value = app.currency;
    pendingGoalPhoto = undefined;
    renderGoalPhotoPreview(goal.photo);
    syncDaysToSaveFromDeadline();
    renderIncomeSourcesEditor(goal);

    renderManageGoalsList();
    renderSyncStatus();
  }

  /* ---------------------------------------------------------
     INCOME SOURCES EDITOR (Settings) — add/rename/retarget/remove
  --------------------------------------------------------- */
  function renderIncomeSourcesEditor(goal) {
    const container = document.getElementById('incomeSourcesEditor');
    const sources = (goal && goal.incomeSources) || [];
    if (!sources.length) {
      container.innerHTML = '<p class="section-sub">No income sources yet — click "Add Income Source" above.</p>';
      return;
    }
    container.innerHTML = sources.map(src => `
      <div class="income-source-row" data-source-id="${src.id}">
        <input type="text" class="income-source-label" value="${escapeHtml(src.label)}" placeholder="Source name">
        <input type="number" class="income-source-target" value="${src.target || ''}" placeholder="Daily target (KSh)">
        <button type="button" class="icon-btn small btn-danger" data-remove-source="${src.id}" title="Remove source">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('[data-remove-source]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sourceId = btn.dataset.removeSource;
        const source = sources.find(s => s.id === sourceId);
        confirmAction('Remove Income Source', `Remove "${source ? source.label : 'this source'}"? Past entries keep their recorded amounts (still counted in your totals), but this labeled row disappears from future entries.`, () => {
          Storage.removeIncomeSource(Storage.getActiveGoalId(), sourceId);
          Notify.success('Income source removed.');
          renderEverything();
          loadSettingsForm();
        });
      });
    });
  }

  function collectIncomeSourceEdits() {
    // Reads the current editor DOM and returns [{id, label, target}, ...] —
    // used right before saving Settings so label/target edits are captured.
    return Array.from(document.querySelectorAll('.income-source-row')).map(row => ({
      id: row.dataset.sourceId,
      label: row.querySelector('.income-source-label').value.trim() || 'Income Source',
      target: Number(row.querySelector('.income-source-target').value) || 0
    }));
  }

  /* ---------------------------------------------------------
     DEADLINE BY DAYS-TO-SAVE (Settings)
  --------------------------------------------------------- */
  function syncDaysToSaveFromDeadline() {
    const start = document.getElementById('setStartDate').value;
    const deadline = document.getElementById('setDeadline').value;
    const daysInput = document.getElementById('setDaysToSave');
    if (start && deadline) {
      const days = Utils.daysBetween(start, deadline);
      if (days > 0) daysInput.value = days;
    }
  }
  function syncDeadlineFromDaysToSave() {
    const start = document.getElementById('setStartDate').value || Utils.todayStr();
    const days = Number(document.getElementById('setDaysToSave').value);
    if (days > 0) {
      document.getElementById('setDeadline').value = Dash.addDays(start, days);
    }
  }

  function renderGoalPhotoPreview(photoDataUrl) {
    const img = document.getElementById('goalPhotoPreview');
    const placeholder = document.getElementById('goalPhotoPlaceholder');
    if (photoDataUrl) {
      img.src = photoDataUrl;
      img.hidden = false;
      placeholder.hidden = true;
    } else {
      img.hidden = true;
      placeholder.hidden = false;
    }
  }

  function renderManageGoalsList() {
    const list = document.getElementById('manageGoalsList');
    const goals = Storage.getGoals();
    const activeId = Storage.getActiveGoalId();
    list.innerHTML = goals.map(g => {
      const stats = Dash.computeStats(g.id);
      return `
      <div class="goal-row ${g.id === activeId ? 'goal-row-active' : ''}">
        <div class="goal-row-info">
          <span class="goal-row-name">${escapeHtml(g.name)}${g.id === activeId ? ' <em>(active)</em>' : ''}</span>
          <span class="goal-row-meta">${Utils.formatCurrency(stats.currentSavings)} of ${Utils.formatCurrency(stats.goalAmount)} · ${stats.percentage.toFixed(0)}%</span>
        </div>
        <div class="goal-row-actions">
          ${g.id !== activeId ? `<button type="button" class="btn btn-outline small-btn" data-switch="${g.id}">Switch</button>` : ''}
          <button type="button" class="btn btn-outline btn-danger small-btn" data-delete="${g.id}" ${goals.length <= 1 ? 'disabled title="At least one goal must exist"' : ''}>Delete</button>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-switch]').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.setActiveGoalId(btn.dataset.switch);
        Notify.info('Switched active goal.');
        renderEverything();
        loadSettingsForm();
      });
    });
    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.delete;
        const g = Storage.getGoal(id);
        confirmAction('Delete Goal', `Permanently delete "${g.name}" and all of its entries and achievements? This cannot be undone.`, () => {
          Storage.deleteGoal(id);
          Charts.destroyAll();
          Notify.warning(`"${g.name}" deleted.`);
          renderEverything();
          Sync.pushNow();
          loadSettingsForm();
        });
      });
    });
  }

  function bindSettingsForm() {
    loadSettingsForm();

    document.getElementById('setGoalPhoto').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const compressed = await Utils.compressImageFile(file);
        pendingGoalPhoto = compressed;
        renderGoalPhotoPreview(compressed);
        Notify.info('Photo ready — click "Save Settings" to apply it.');
      } catch (err) {
        Notify.error('Could not process that image. Try a different file.');
      }
      e.target.value = '';
    });

    document.getElementById('btnRemoveGoalPhoto').addEventListener('click', () => {
      pendingGoalPhoto = null;
      renderGoalPhotoPreview(null);
    });

    document.getElementById('btnAddGoalFromSettings').addEventListener('click', openCreateGoalModal);

    document.getElementById('btnAddIncomeSource').addEventListener('click', () => {
      const goalId = Storage.getActiveGoalId();
      Storage.addIncomeSource(goalId, 'New Income Source', 0);
      Notify.success('Income source added — rename and set its target below.');
      renderEverything();
      loadSettingsForm();
    });

    document.getElementById('setDeadline').addEventListener('change', syncDaysToSaveFromDeadline);
    document.getElementById('setStartDate').addEventListener('change', syncDaysToSaveFromDeadline);
    document.getElementById('setDaysToSave').addEventListener('input', syncDeadlineFromDaysToSave);

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const goalId = Storage.getActiveGoalId();
      const goalPatch = {
        name: document.getElementById('setGoalName').value.trim() || 'My Goal',
        missionStatement: document.getElementById('setMission').value.trim(),
        incomeSources: collectIncomeSourceEdits(),
        targetAmount: Number(document.getElementById('setGoal').value) || 600000,
        stretchGoal: Number(document.getElementById('setStretchGoal').value) || 650000,
        startDate: document.getElementById('setStartDate').value || Utils.todayStr(),
        deadline: document.getElementById('setDeadline').value || '2027-07-01',
        dailyTarget: Number(document.getElementById('setDailyTarget').value) || 1820,
      };
      if (pendingGoalPhoto !== undefined) goalPatch.photo = pendingGoalPhoto;
      Storage.updateGoal(goalId, goalPatch);

      Storage.saveAppSettings({
        theme: document.getElementById('setTheme').value,
        currency: document.getElementById('setCurrency').value
      });

      pendingGoalPhoto = undefined;
      applyTheme(document.getElementById('setTheme').value);
      document.getElementById('whatifSlider').dataset.touched = '';
      Notify.success('Settings saved successfully.');
      renderEverything();
      Sync.pushNow();
      loadSettingsForm();
    });
  }

  /* ---------------------------------------------------------
     CALENDAR NAV
  --------------------------------------------------------- */
  function bindCalendarNav() {
    document.getElementById('calPrev').addEventListener('click', () => CalendarView.shift(-1));
    document.getElementById('calNext').addEventListener('click', () => CalendarView.shift(1));
  }

  /* ---------------------------------------------------------
     CONFIRM MODAL
  --------------------------------------------------------- */
  let pendingConfirmCallback = null;
  function bindModal() {
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalConfirm').addEventListener('click', () => {
      const cb = pendingConfirmCallback;
      closeModal();
      if (cb) cb();
    });
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') closeModal();
    });
  }
  function confirmAction(title, message, onConfirm) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    pendingConfirmCallback = onConfirm;
    document.getElementById('modalOverlay').classList.add('show');
  }
  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
    pendingConfirmCallback = null;
  }

  /* ---------------------------------------------------------
     KEYBOARD SHORTCUTS
  --------------------------------------------------------- */
  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const gated = document.getElementById('authGateScreen').classList.contains('show');
      const creatingGoal = document.getElementById('createGoalOverlay').classList.contains('show');
      const resettingApp = document.getElementById('resetAppOverlay').classList.contains('show');

      // The Reset App modal can be triggered from the gate itself and
      // auto-focuses its confirm-text input, so this needs to be checked
      // before the general input/textarea handling below.
      if (e.key === 'Escape' && resettingApp) { closeResetAppModal(); return; }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        if (!gated && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          document.getElementById('entryForm').requestSubmit();
        }
        return;
      }

      if (gated) return; // no other shortcuts reach the app while the auth gate is up

      if (e.key === 'Escape') {
        if (creatingGoal) { closeCreateGoalModal(); return; }
        closeModal();
        document.getElementById('celebrateOverlay').classList.remove('show');
      }
      if (creatingGoal || resettingApp) return;

      if (e.key.toLowerCase() === 'n') { goToPage('entry'); }
      const idx = Number(e.key);
      if (idx >= 1 && idx <= PAGE_ORDER.length) goToPage(PAGE_ORDER[idx - 1]);
    });
  }

  /* ---------------------------------------------------------
     MIDNIGHT REFRESH — "today" (and therefore today's targets,
     days remaining, streaks, etc.) rolls over at local midnight.
     A left-open tab won't re-render purely from time passing, so
     this polls for the date changing and forces a refresh when it
     does — plus a check on regaining focus, since background tabs
     can have their timers throttled by the browser.
  --------------------------------------------------------- */
  let lastKnownToday = null;

  function bindMidnightRefresh() {
    lastKnownToday = Utils.todayStr();
    setInterval(checkForNewDay, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForNewDay();
    });
    window.addEventListener('focus', checkForNewDay);
  }

  function checkForNewDay() {
    const today = Utils.todayStr();
    if (today !== lastKnownToday) {
      lastKnownToday = today;
      setDefaultEntryDate();
      renderEverything();
      Notify.info("A new day has started — today's targets have reset.");
    }
  }

  /* ---------------------------------------------------------
     SERVICE WORKER
  --------------------------------------------------------- */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  return {
    init, openEntryForDate,
    onSyncSignedIn, onSyncSignedOut, onSyncRemoteUpdate, onSyncPushed, onSyncError, onAccountSwitched
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
