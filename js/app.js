/* ============================================================
   APP.JS — application controller
   ============================================================ */

const App = (() => {

  let cachedStats = null;
  let pendingGoalPhoto = undefined; // undefined = no change, null = remove, string = new photo
  let goalActionResolver = null;    // for the create/delete-goal quick modals

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  function init() {
    Storage.migrateIfNeeded();
    applyTheme(Storage.getAppSettings().theme);
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
    bindPinLock();
    bindWhatIfCalculator();
    bindCreateGoalModal();
    bindSyncUI();
    CalendarView.init();

    document.getElementById('quoteText').textContent = Utils.quoteOfTheDay();
    document.getElementById('sidebarQuote').textContent = Utils.quoteOfTheDay();

    setDefaultEntryDate();
    Sync.init();
    renderEverything();
    registerServiceWorker();
    checkLockOnStartup();
  }

  function renderEverything() {
    const stats = Dash.computeStats();
    cachedStats = stats;
    renderGoalSwitcher();
    renderHero(stats);
    renderProgress(stats);
    renderGauge(stats);
    renderKPIs(stats);
    renderMilestones(stats);
    renderAnalyticsStats(stats);
    renderWeekdayAndCategoryText(stats);
    renderWhatIfCalculator(stats);
    renderAchievements(stats);
    renderHistoryTable();
    Charts.renderAll(stats);
    CalendarView.render();
    prefillEntryFormFromDate(document.getElementById('inputDatePicker').value);
    Sync.scheduleSync();
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
        internalDeadline: deadline,
      });
      Storage.setActiveGoalId(goal.id);
      closeCreateGoalModal();
      Notify.success(`"${name}" created — set as your active goal.`);
      renderEverything();
      loadSettingsForm();
      goToPage('settings');
    });
    document.getElementById('createGoalCancel').addEventListener('click', closeCreateGoalModal);
  }
  function openCreateGoalModal() {
    document.getElementById('createGoalForm').reset();
    document.getElementById('createGoalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('newGoalName').focus(), 50);
  }
  function closeCreateGoalModal() {
    document.getElementById('createGoalOverlay').classList.remove('show');
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
    document.getElementById('heroInternal').textContent = g.internalDeadline ? Utils.prettyDate(g.internalDeadline) : '—';
    document.getElementById('heroStart').textContent = g.startDate ? Utils.prettyDate(g.startDate) : '—';
    document.getElementById('countdownDays').textContent = Math.max(stats.daysRemaining, 0);
    document.getElementById('countdownInternalDays').textContent = Math.max(stats.daysRemainingInternal, 0);

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

    document.getElementById('labelPrinting').textContent = g.incomeLabel1 || 'Income Source 1';
    document.getElementById('labelTrading').textContent = g.incomeLabel2 || 'Income Source 2';
    document.getElementById('kpiPrintTargetLabel').textContent = `${g.incomeLabel1 || 'Income Source 1'} Target`;
    document.getElementById('kpiTradeTargetLabel').textContent = `${g.incomeLabel2 || 'Income Source 2'} Target`;

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
    const g = stats.goal || {};
    document.getElementById('kpiCurrentSavings').textContent = Utils.formatCurrency(stats.currentSavings);
    document.getElementById('kpiRemaining').textContent = Utils.formatCurrency(stats.remaining);
    document.getElementById('kpiTodayTarget').textContent = Utils.formatCurrency(g.dailyTarget);
    document.getElementById('kpiPrintTarget').textContent = Utils.formatCurrency(g.incomeTarget1);
    document.getElementById('kpiTradeTarget').textContent = Utils.formatCurrency(g.incomeTarget2);
    document.getElementById('kpiDaysRemaining').textContent = Math.max(stats.daysRemaining, 0);
    document.getElementById('kpiEstPurchase').textContent = stats.remaining > 0 ? Utils.prettyDate(stats.estimatedPurchaseDate) : 'Goal reached!';
    document.getElementById('kpiEstPurchaseAtTarget').textContent = stats.remaining <= 0 ? 'Goal reached!' :
      (stats.estimatedPurchaseDateAtTarget ? Utils.prettyDate(stats.estimatedPurchaseDateAtTarget) : '— set a daily target in Settings —');
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
    const g = stats.goal || {};
    const grid = document.getElementById('analyticsStatsGrid');
    if (!a) {
      grid.innerHTML = `<div class="glass-card kpi-card"><span class="kpi-label">No data yet</span><span class="kpi-value small">Log entries to see analytics</span></div>`;
      document.getElementById('weekdayInsightText').textContent = 'Log a few entries to see weekday patterns.';
      document.getElementById('categoryTotalsList').innerHTML = '';
      return;
    }
    const label1 = g.incomeLabel1 || 'Income 1';
    const label2 = g.incomeLabel2 || 'Income 2';
    const cards = [
      [`Highest ${label1} Day`, `${Utils.formatCurrency(a.highestIncome1.income1)} — ${Utils.shortDate(a.highestIncome1.date)}`],
      [`Highest ${label2} Day`, `${Utils.formatCurrency(a.highestIncome2.income2)} — ${Utils.shortDate(a.highestIncome2.date)}`],
      ['Best Week', a.bestWeek ? Utils.formatCurrency(a.bestWeek[1]) : '—'],
      ['Worst Week', a.worstWeek ? Utils.formatCurrency(a.worstWeek[1]) : '—'],
      ['Best Month', a.bestMonth ? `${Utils.formatCurrency(a.bestMonth[1])} — ${a.bestMonth[0]}` : '—'],
      [`Average ${label1}`, Utils.formatCurrency(a.avgIncome1)],
      [`Average ${label2}`, Utils.formatCurrency(a.avgIncome2)],
      ['Average Daily Savings', Utils.formatCurrency(stats.currentDailyAverage)],
      ['Projected Finish Date', stats.remaining > 0 ? Utils.prettyDate(a.forecastDate) : 'Achieved'],
    ];
    grid.innerHTML = cards.map(([label, val]) => `
      <div class="glass-card kpi-card">
        <span class="kpi-label">${label}</span>
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

  function prefillEntryFormFromDate(dateStr) {
    if (!dateStr) return;
    const entry = Storage.getEntryByDate(dateStr);
    document.getElementById('inputDate').value = dateStr;
    document.getElementById('inputPrinting').value = entry ? entry.income1 || '' : '';
    document.getElementById('inputTrading').value = entry ? entry.income2 || '' : '';
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
    const printing = Number(document.getElementById('inputPrinting').value) || 0;
    const trading = Number(document.getElementById('inputTrading').value) || 0;
    const other = Number(document.getElementById('inputOther').value) || 0;
    const expenses = Number(document.getElementById('inputExpenses').value) || 0;
    const net = printing + trading + other - expenses;
    const el = document.getElementById('entryNetPreview');
    el.textContent = Utils.formatCurrency(net);
    el.style.color = net >= 0 ? 'var(--gold)' : 'var(--red)';
  }

  function bindEntryForm() {
    const form = document.getElementById('entryForm');
    const datePicker = document.getElementById('inputDatePicker');

    datePicker.addEventListener('change', () => prefillEntryFormFromDate(datePicker.value));
    ['inputPrinting', 'inputTrading', 'inputOther', 'inputExpenses'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateNetPreview);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveToday');
      saveBtn.disabled = true;

      const dateStr = datePicker.value || Utils.todayStr();
      const wasExisting = !!Storage.getEntryByDate(dateStr);
      const expenses = Number(document.getElementById('inputExpenses').value) || 0;
      const entry = {
        date: dateStr,
        income1: Number(document.getElementById('inputPrinting').value) || 0,
        income2: Number(document.getElementById('inputTrading').value) || 0,
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
      requirePin('PIN Required', 'Enter your PIN to reset this goal.', () => {
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
    let entries = stats.entries.slice().reverse();

    if (filter) {
      const f = filter.toLowerCase();
      entries = entries.filter(e => e.date.includes(f) || (e.notes || '').toLowerCase().includes(f));
    }

    emptyMsg.style.display = entries.length ? 'none' : 'block';

    tbody.innerHTML = entries.map(e => `
      <tr data-date="${e.date}">
        <td>${Utils.shortDate(e.date)}</td>
        <td>${Utils.formatCurrency(e.income1)}</td>
        <td>${Utils.formatCurrency(e.income2)}</td>
        <td>${Utils.formatCurrency(e.other)}</td>
        <td>${Utils.formatCurrency(e.expenses)}${e.expenseCategory ? `<span class="cat-tag">${e.expenseCategory}</span>` : ''}</td>
        <td class="${e.net >= 0 ? 'net-pos' : 'net-neg'}">${Utils.formatCurrency(e.net)}</td>
        <td>${Utils.formatCurrency(e.runningTotal)}</td>
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
    const g = stats.goal || {};
    const label1 = g.incomeLabel1 || 'Income1';
    const label2 = g.incomeLabel2 || 'Income2';
    return stats.entries.map(e => ({
      Date: e.date, [label1]: e.income1, [label2]: e.income2, Other: e.other,
      Expenses: e.expenses, ExpenseCategory: e.expenseCategory || '',
      NetSavings: e.net, RunningTotal: e.runningTotal, Notes: e.notes || ''
    }));
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

  function exportExcel() {
    const rows = tableRowsForExport();
    if (!rows.length) { Notify.info('No data to export.'); return; }
    if (typeof XLSX === 'undefined') { Notify.error('Excel export library unavailable offline.'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'History');
    XLSX.writeFile(wb, 'goal-tracker-history.xlsx');
    Notify.success('Excel file exported successfully.');
  }

  function exportPDF() {
    const rows = tableRowsForExport();
    if (!rows.length) { Notify.info('No data to export.'); return; }
    if (typeof jspdf === 'undefined') { Notify.error('PDF export library unavailable offline.'); return; }
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
    requirePin('PIN Required', 'Enter your PIN to restore a backup. This will overwrite current data.', () => {
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
     PIN LOCK
  --------------------------------------------------------- */
  let pinPromptResolver = null;

  function checkLockOnStartup() {
    if (Storage.isPinEnabled()) showLockScreen();
  }

  function showLockScreen() {
    const goal = Storage.getActiveGoal();
    document.getElementById('lockGoalName').textContent = `${(goal && goal.name) || 'Your goal'} is locked.`;
    document.getElementById('lockPinInput').value = '';
    document.getElementById('lockError').textContent = '';
    document.getElementById('lockScreen').classList.add('show');
    setTimeout(() => document.getElementById('lockPinInput').focus(), 50);
  }
  function hideLockScreen() {
    document.getElementById('lockScreen').classList.remove('show');
  }

  function bindPinLock() {
    document.getElementById('lockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = document.getElementById('lockPinInput').value;
      const ok = await Storage.verifyPin(pin);
      if (ok) {
        hideLockScreen();
      } else {
        document.getElementById('lockError').textContent = 'Incorrect PIN. Try again.';
        document.getElementById('lockPinInput').value = '';
        document.getElementById('lockPinInput').focus();
      }
    });

    document.getElementById('btnForgotPin').addEventListener('click', () => {
      document.getElementById('forgotPinConfirmText').value = '';
      document.getElementById('forgotPinOverlay').classList.add('show');
    });
    document.getElementById('forgotPinCancel').addEventListener('click', () => {
      document.getElementById('forgotPinOverlay').classList.remove('show');
    });
    document.getElementById('forgotPinConfirm').addEventListener('click', () => {
      if (document.getElementById('forgotPinConfirmText').value.trim() !== 'ERASE') {
        Notify.error('Type ERASE exactly to confirm.');
        return;
      }
      Storage.eraseEverything();
      Charts.destroyAll();
      document.getElementById('forgotPinOverlay').classList.remove('show');
      hideLockScreen();
      Notify.warning('All local data erased. Starting fresh.');
      setDefaultEntryDate();
      renderEverything();
      loadSettingsForm();
    });

    document.getElementById('pinPromptForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = document.getElementById('pinPromptInput').value;
      const ok = await Storage.verifyPin(pin);
      if (ok) {
        const resolve = pinPromptResolver;
        closePinPrompt();
        if (resolve) resolve(true);
      } else {
        document.getElementById('pinPromptError').textContent = 'Incorrect PIN. Try again.';
        document.getElementById('pinPromptInput').value = '';
        document.getElementById('pinPromptInput').focus();
      }
    });
    document.getElementById('pinPromptCancel').addEventListener('click', () => {
      const resolve = pinPromptResolver;
      closePinPrompt();
      if (resolve) resolve(false);
    });
  }

  function closePinPrompt() {
    document.getElementById('pinPromptOverlay').classList.remove('show');
    pinPromptResolver = null;
  }

  function requirePin(title, message, onSuccess) {
    if (!Storage.isPinEnabled()) { onSuccess(); return; }
    document.getElementById('pinPromptTitle').textContent = title;
    document.getElementById('pinPromptMessage').textContent = message;
    document.getElementById('pinPromptInput').value = '';
    document.getElementById('pinPromptError').textContent = '';
    document.getElementById('pinPromptOverlay').classList.add('show');
    setTimeout(() => document.getElementById('pinPromptInput').focus(), 50);
    pinPromptResolver = (confirmed) => { if (confirmed) onSuccess(); };
  }

  /* ---------------------------------------------------------
     CLOUD SYNC (Firebase email/password)
  --------------------------------------------------------- */
  function bindSyncUI() {
    renderSyncStatus();

    document.getElementById('btnSyncSignIn').addEventListener('click', async () => {
      const email = document.getElementById('syncEmail').value.trim();
      const password = document.getElementById('syncPassword').value;
      if (!email || !password) { Notify.error('Enter your email and password.'); return; }
      try {
        await Sync.signIn(email, password);
        Notify.success('Signed in — syncing…');
      } catch (err) {
        Notify.error(err.message);
      }
    });

    document.getElementById('btnSyncSignUp').addEventListener('click', async () => {
      const email = document.getElementById('syncEmail').value.trim();
      const password = document.getElementById('syncPassword').value;
      if (!email || !password) { Notify.error('Enter an email and password.'); return; }
      if (password.length < 6) { Notify.error('Password must be at least 6 characters.'); return; }
      try {
        await Sync.signUp(email, password);
        Notify.success('Account created — this device is now synced.');
      } catch (err) {
        Notify.error(err.message);
      }
    });

    document.getElementById('btnSyncForgotPassword').addEventListener('click', async () => {
      const email = document.getElementById('syncEmail').value.trim();
      if (!email) { Notify.error('Enter your email above first, then click this again.'); return; }
      try {
        await Sync.resetPassword(email);
        Notify.success('Password reset email sent — check your inbox.');
      } catch (err) {
        Notify.error(err.message);
      }
    });

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
  }

  function renderSyncStatus() {
    const banner = document.getElementById('syncStatusBanner');
    const authForm = document.getElementById('syncAuthForm');
    const signedInPanel = document.getElementById('syncSignedInPanel');

    if (!Sync.isConfigured()) {
      banner.innerHTML = 'Cloud sync isn\'t set up yet. Your data stays on this device only. See <strong>SYNC_SETUP.md</strong> in the app folder for a 5-minute setup guide (free Firebase project + email/password sign-in).';
      authForm.hidden = true;
      signedInPanel.hidden = true;
      return;
    }

    if (Sync.isSignedIn()) {
      banner.innerHTML = 'Cloud sync is active. Changes on this device sync automatically to your account and to any other device signed in with it.';
      authForm.hidden = true;
      signedInPanel.hidden = false;
      document.getElementById('syncSignedInText').innerHTML = `Signed in as <strong>${escapeHtml(Sync.currentEmail())}</strong>.`;
    } else {
      banner.innerHTML = 'Sign in or create an account to sync your goals across devices. Your data stays local-only until you do.';
      authForm.hidden = false;
      signedInPanel.hidden = true;
    }
  }

  // --- Hooks called by sync.js — kept on the public App API ---
  function onSyncSignedIn(user, result) {
    renderSyncStatus();
    renderEverything();
    loadSettingsForm();
    if (result && !result.firstSync && (result.addedGoals || result.updatedGoals || result.addedEntries || result.updatedEntries)) {
      Notify.success(`Synced — merged ${result.addedEntries + result.updatedEntries} entr${(result.addedEntries + result.updatedEntries) === 1 ? 'y' : 'ies'} from the cloud.`);
    } else {
      Notify.success('Signed in and synced.');
    }
  }
  function onSyncSignedOut() {
    renderSyncStatus();
  }
  function onSyncRemoteUpdate(result) {
    renderEverything();
    loadSettingsForm();
    Notify.info('Updated from another device.');
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
    document.getElementById('setLabel1').value = goal.incomeLabel1 || '';
    document.getElementById('setLabel2').value = goal.incomeLabel2 || '';
    document.getElementById('setGoal').value = goal.targetAmount || '';
    document.getElementById('setStretchGoal').value = goal.stretchGoal || '';
    document.getElementById('setStartDate').value = goal.startDate || '';
    document.getElementById('setDeadline').value = goal.deadline || '';
    document.getElementById('setInternalDeadline').value = goal.internalDeadline || '';
    document.getElementById('setDailyTarget').value = goal.dailyTarget || '';
    document.getElementById('setPrintTarget').value = goal.incomeTarget1 || '';
    document.getElementById('setTradeTarget').value = goal.incomeTarget2 || '';
    document.getElementById('setTheme').value = app.theme;
    document.getElementById('setCurrency').value = app.currency;
    pendingGoalPhoto = undefined;
    renderGoalPhotoPreview(goal.photo);

    const pinEnabled = Storage.isPinEnabled();
    document.getElementById('pinStatusLabel').textContent = pinEnabled ? 'PIN Lock — Enabled' : 'PIN Lock — Disabled';
    document.getElementById('btnRemovePin').hidden = !pinEnabled;
    document.getElementById('setPinNew').value = '';
    document.getElementById('setPinConfirm').value = '';

    renderManageGoalsList();
    renderSyncStatus();
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
        requirePin('PIN Required', `Enter your PIN to delete "${g.name}".`, () => {
          confirmAction('Delete Goal', `Permanently delete "${g.name}" and all of its entries and achievements? This cannot be undone.`, () => {
            Storage.deleteGoal(id);
            Charts.destroyAll();
            Notify.warning(`"${g.name}" deleted.`);
            renderEverything();
            loadSettingsForm();
          });
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

    document.getElementById('btnSavePin').addEventListener('click', () => {
      const newPin = document.getElementById('setPinNew').value;
      const confirmPin = document.getElementById('setPinConfirm').value;
      if (!/^\d{4,8}$/.test(newPin)) { Notify.error('PIN must be 4–8 digits.'); return; }
      if (newPin !== confirmPin) { Notify.error('PINs do not match.'); return; }

      const apply = async () => {
        await Storage.setPin(newPin);
        Notify.success('PIN saved.');
        loadSettingsForm();
      };
      if (Storage.isPinEnabled()) {
        requirePin('Confirm Current PIN', 'Enter your current PIN to set a new one.', apply);
      } else {
        apply();
      }
    });

    document.getElementById('btnRemovePin').addEventListener('click', () => {
      requirePin('Remove PIN', 'Enter your current PIN to remove PIN protection.', () => {
        Storage.disablePin();
        Notify.success('PIN protection removed.');
        loadSettingsForm();
      });
    });

    document.getElementById('btnAddGoalFromSettings').addEventListener('click', openCreateGoalModal);

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const goalId = Storage.getActiveGoalId();
      const goalPatch = {
        name: document.getElementById('setGoalName').value.trim() || 'My Goal',
        missionStatement: document.getElementById('setMission').value.trim(),
        incomeLabel1: document.getElementById('setLabel1').value.trim() || 'Income Source 1',
        incomeLabel2: document.getElementById('setLabel2').value.trim() || 'Income Source 2',
        targetAmount: Number(document.getElementById('setGoal').value) || 600000,
        stretchGoal: Number(document.getElementById('setStretchGoal').value) || 650000,
        startDate: document.getElementById('setStartDate').value || Utils.todayStr(),
        deadline: document.getElementById('setDeadline').value || '2027-07-01',
        internalDeadline: document.getElementById('setInternalDeadline').value || '2027-06-01',
        dailyTarget: Number(document.getElementById('setDailyTarget').value) || 1820,
        incomeTarget1: Number(document.getElementById('setPrintTarget').value) || 300,
        incomeTarget2: Number(document.getElementById('setTradeTarget').value) || 1520,
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
      const locked = document.getElementById('lockScreen').classList.contains('show');
      const pinPrompting = document.getElementById('pinPromptOverlay').classList.contains('show');
      const forgotOpen = document.getElementById('forgotPinOverlay').classList.contains('show');
      const creatingGoal = document.getElementById('createGoalOverlay').classList.contains('show');

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        if (!locked && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          document.getElementById('entryForm').requestSubmit();
        }
        return;
      }

      if (locked) return;

      if (e.key === 'Escape') {
        if (pinPrompting) { closePinPrompt(); return; }
        if (forgotOpen) { document.getElementById('forgotPinOverlay').classList.remove('show'); return; }
        if (creatingGoal) { closeCreateGoalModal(); return; }
        closeModal();
        document.getElementById('celebrateOverlay').classList.remove('show');
      }
      if (pinPrompting || forgotOpen || creatingGoal) return;

      if (e.key.toLowerCase() === 'n') { goToPage('entry'); }
      const idx = Number(e.key);
      if (idx >= 1 && idx <= PAGE_ORDER.length) goToPage(PAGE_ORDER[idx - 1]);
    });
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
    onSyncSignedIn, onSyncSignedOut, onSyncRemoteUpdate, onSyncPushed, onSyncError
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
