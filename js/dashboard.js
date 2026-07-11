/* ============================================================
   DASHBOARD.JS — stats engine: KPIs, milestones, achievements,
   analytics (weekday insights, expense categories, what-if pace)
   ============================================================ */

const Dash = (() => {

  const MILESTONE_PCTS = [25, 50, 75, 100];
  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const EXPENSE_CATEGORIES = ['Transport', 'Data/Airtime', 'Materials', 'Food', 'Other'];

  const ACHIEVEMENTS = [
    { id: 'first10k', label: 'First KSh 10,000', desc: 'Cross ten thousand shillings saved.', icon: '💰',
      test: (s) => s.currentSavings >= 10000 },
    { id: 'firstMonth', label: 'First Month', desc: '30 days into the mission.', icon: '📅',
      test: (s) => s.missionDay >= 30 },
    { id: 'days50', label: '50 Days Consistent', desc: 'Logged 50 days of entries.', icon: '🔥',
      test: (s) => s.totalEntries >= 50 },
    { id: 'days100', label: '100 Days', desc: 'Logged 100 days of entries.', icon: '🏁',
      test: (s) => s.totalEntries >= 100 },
    { id: 'days150', label: '150 Days', desc: 'Logged 150 days of entries.', icon: '🎯',
      test: (s) => s.totalEntries >= 150 },
    { id: 'halfway', label: 'Halfway There', desc: 'Reached 50% of the goal.', icon: '⛽',
      test: (s) => s.percentage >= 50 },
    { id: 'threeQuarters', label: 'Three Quarters', desc: 'Reached 75% of the goal.', icon: '🛣️',
      test: (s) => s.percentage >= 75 },
    { id: 'goalAchieved', label: 'Goal Achieved', desc: 'The goal is yours.', icon: '🏆',
      test: (s) => s.percentage >= 100 },
  ];

  /** Compute the full statistics object for a goal (defaults to the active goal). */
  function computeStats(goalId) {
    const goal = goalId ? Storage.getGoal(goalId) : Storage.getActiveGoal();
    const entries = Storage.getEntries(goal ? goal.id : null);
    const today = Utils.todayStr();

    let currentSavings = 0;
    const withNet = entries.map(e => {
      const net = Storage.netOf(e);
      currentSavings += net;
      return Object.assign({}, e, { net, runningTotal: currentSavings });
    });

    const targetAmount = Number(goal && goal.targetAmount) || 600000;
    const remaining = Math.max(targetAmount - currentSavings, 0);
    const percentage = Utils.clamp((currentSavings / targetAmount) * 100, 0, 999);

    const startDate = (goal && goal.startDate) || today;
    const missionDay = Utils.daysBetween(startDate, today) + 1;
    const deadline = (goal && goal.deadline) || '2027-07-01';
    const internalDeadline = (goal && goal.internalDeadline) || deadline;
    const daysRemaining = Utils.daysBetween(today, deadline);
    const daysRemainingInternal = Utils.daysBetween(today, internalDeadline);

    const totalEntries = withNet.length;
    const currentDailyAverage = totalEntries ? currentSavings / Math.max(missionDay, 1) : 0;

    const weekMap = {}, monthMap = {}, weekdayMap = {}, categoryMap = {};
    withNet.forEach(e => {
      const wk = isoWeekKey(e.date);
      const mo = e.date.slice(0, 7);
      const wd = new Date(e.date + 'T00:00:00').getDay();
      weekMap[wk] = (weekMap[wk] || 0) + e.net;
      monthMap[mo] = (monthMap[mo] || 0) + e.net;
      if (!weekdayMap[wd]) weekdayMap[wd] = { sum: 0, count: 0 };
      weekdayMap[wd].sum += e.net;
      weekdayMap[wd].count += 1;
      if (e.expenses) {
        const cat = e.expenseCategory || 'Other';
        categoryMap[cat] = (categoryMap[cat] || 0) + Number(e.expenses);
      }
    });
    const weekVals = Object.values(weekMap);
    const monthVals = Object.values(monthMap);
    const weeklyAverage = weekVals.length ? weekVals.reduce((a, b) => a + b, 0) / weekVals.length : 0;
    const monthlyAverage = monthVals.length ? monthVals.reduce((a, b) => a + b, 0) / monthVals.length : 0;

    const dailyTarget = Number(goal && goal.dailyTarget) || 0;
    const { currentStreak, longestStreak } = computeStreaks(withNet, dailyTarget);

    const expectedByNow = dailyTarget * missionDay;
    const diffAmount = currentSavings - expectedByNow;
    const daysAheadBehind = dailyTarget ? Math.round(diffAmount / dailyTarget) : 0;

    const paceForProjection = currentDailyAverage > 0 ? currentDailyAverage : (dailyTarget || 1);
    const daysNeededFromNow = remaining > 0 ? Math.ceil(remaining / paceForProjection) : 0;
    const estimatedPurchaseDate = addDays(today, daysNeededFromNow);

    // A second, more optimistic/consistent projection: "if you hit your
    // daily target every remaining day from today onward" — independent of
    // your actual average so far, which may be dragged down by early or
    // inconsistent days.
    const daysNeededAtTarget = remaining > 0 && dailyTarget > 0 ? Math.ceil(remaining / dailyTarget) : 0;
    const estimatedPurchaseDateAtTarget = dailyTarget > 0 ? addDays(today, daysNeededAtTarget) : null;

    const todaysEntry = Storage.getEntryByDate(today, goal ? goal.id : null);

    return {
      goal, entries: withNet, today,
      currentSavings, goalAmount: targetAmount, remaining, percentage,
      missionDay, daysRemaining, daysRemainingInternal,
      totalEntries, currentDailyAverage, weeklyAverage, monthlyAverage,
      currentStreak, longestStreak, daysAheadBehind,
      estimatedPurchaseDate, estimatedPurchaseDateAtTarget, todaysEntry,
      weekMap, monthMap, weekdayMap, categoryMap
    };
  }

  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return Utils.toDateStr(d);
  }

  function computeStreaks(entriesWithNet, dailyTarget) {
    if (!entriesWithNet.length) return { currentStreak: 0, longestStreak: 0 };
    const byDate = {};
    entriesWithNet.forEach(e => byDate[e.date] = e.net);

    const dates = entriesWithNet.map(e => e.date).sort();
    let longest = 0, running = 0, prevDate = null;
    dates.forEach(date => {
      const hit = byDate[date] >= dailyTarget;
      if (hit) {
        if (prevDate && Utils.daysBetween(prevDate, date) === 1) running += 1;
        else running = 1;
        longest = Math.max(longest, running);
      } else {
        running = 0;
      }
      prevDate = date;
    });

    let current = 0;
    const today = Utils.todayStr();
    let cursor = byDate[today] !== undefined ? today : dates[dates.length - 1];
    while (byDate[cursor] !== undefined && byDate[cursor] >= dailyTarget) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
    return { currentStreak: current, longestStreak: longest };
  }

  /** Determine which milestones are unlocked, return array with unlocked flag */
  function getMilestones(stats) {
    return MILESTONE_PCTS.map(pct => ({
      pct,
      amount: Math.round(stats.goalAmount * (pct / 100)),
      unlocked: stats.percentage >= pct
    }));
  }

  /** Check for newly crossed milestones (call after saving an entry) */
  function checkNewMilestones(stats) {
    const newly = [];
    const gid = stats.goal ? stats.goal.id : null;
    getMilestones(stats).forEach(m => {
      if (m.unlocked && !Storage.hasMilestoneFlag(m.pct, gid)) {
        Storage.setMilestoneFlag(m.pct, gid);
        newly.push(m);
      }
    });
    return newly;
  }

  /** Check for newly unlocked achievements */
  function checkNewAchievements(stats) {
    const newly = [];
    const gid = stats.goal ? stats.goal.id : null;
    ACHIEVEMENTS.forEach(a => {
      if (a.test(stats) && Storage.unlockAchievement(a.id, gid)) {
        newly.push(a);
      }
    });
    return newly;
  }

  function analytics(stats) {
    const entries = stats.entries;
    if (!entries.length) return null;

    const highestIncome1 = entries.reduce((m, e) => (e.income1 || 0) > (m.income1 || 0) ? e : m, entries[0]);
    const highestIncome2 = entries.reduce((m, e) => (e.income2 || 0) > (m.income2 || 0) ? e : m, entries[0]);

    const weeks = Object.entries(stats.weekMap);
    const months = Object.entries(stats.monthMap);
    const bestWeek = weeks.length ? weeks.reduce((m, w) => w[1] > m[1] ? w : m) : null;
    const worstWeek = weeks.length ? weeks.reduce((m, w) => w[1] < m[1] ? w : m) : null;
    const bestMonth = months.length ? months.reduce((m, mo) => mo[1] > m[1] ? mo : m) : null;

    const avgIncome1 = entries.reduce((s, e) => s + (Number(e.income1) || 0), 0) / entries.length;
    const avgIncome2 = entries.reduce((s, e) => s + (Number(e.income2) || 0), 0) / entries.length;

    // Weekday insights
    const weekdayAverages = Object.entries(stats.weekdayMap).map(([wd, v]) => ({
      weekday: Number(wd), name: WEEKDAY_NAMES[Number(wd)], average: v.sum / v.count, count: v.count
    })).sort((a, b) => a.weekday - b.weekday);
    let bestWeekday = null, worstWeekday = null;
    if (weekdayAverages.length) {
      bestWeekday = weekdayAverages.reduce((m, w) => w.average > m.average ? w : m);
      worstWeekday = weekdayAverages.reduce((m, w) => w.average < m.average ? w : m);
    }

    // Expense category breakdown
    const categoryTotals = EXPENSE_CATEGORIES.map(cat => ({
      category: cat, total: stats.categoryMap[cat] || 0
    })).filter(c => c.total > 0);
    const totalExpenses = categoryTotals.reduce((s, c) => s + c.total, 0);

    return {
      highestIncome1, highestIncome2, bestWeek, worstWeek, bestMonth,
      avgIncome1, avgIncome2,
      forecastDate: stats.estimatedPurchaseDate,
      weekdayAverages, bestWeekday, worstWeekday,
      categoryTotals, totalExpenses
    };
  }

  /** What-if pace calculator: given a hypothetical flat daily savings rate,
   *  project the finish date and how many days sooner/later that is versus
   *  the current actual pace. */
  function projectWithDailyRate(stats, hypotheticalDailyRate) {
    const rate = Number(hypotheticalDailyRate) || 0;
    const today = stats.today;
    if (rate <= 0 || stats.remaining <= 0) {
      return { finishDate: null, daysFromNow: null, daysDiffVsCurrentPace: 0 };
    }
    const daysFromNow = Math.ceil(stats.remaining / rate);
    const finishDate = addDays(today, daysFromNow);

    const currentPaceDays = stats.remaining > 0 && stats.currentDailyAverage > 0
      ? Math.ceil(stats.remaining / stats.currentDailyAverage)
      : null;
    const daysDiffVsCurrentPace = currentPaceDays !== null ? (currentPaceDays - daysFromNow) : null;

    return { finishDate, daysFromNow, daysDiffVsCurrentPace };
  }

  return {
    ACHIEVEMENTS, MILESTONE_PCTS, EXPENSE_CATEGORIES, WEEKDAY_NAMES,
    computeStats, getMilestones, checkNewMilestones, checkNewAchievements,
    analytics, projectWithDailyRate, addDays
  };
})();
