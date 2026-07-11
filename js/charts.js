/* ============================================================
   CHARTS.JS — Chart.js instances and update logic
   ============================================================ */

const Charts = (() => {
  const instances = {};
  const GOLD = '#d4af37';
  const GOLD_SOFT = 'rgba(212,175,55,0.25)';
  const WHITE_SOFT = 'rgba(255,255,255,0.55)';
  const GRID = 'rgba(255,255,255,0.06)';
  const RED = '#e05d5d';
  const GREEN = '#5ecb8f';
  const PALETTE = ['#d4af37', '#f4d976', '#8a6d1a', '#5ecb8f', '#e05d5d', '#7d9bd4'];

  Chart.defaults.color = WHITE_SOFT;
  Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";

  function baseOptions(extra = {}) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: WHITE_SOFT, boxWidth: 12, padding: 16 } },
        tooltip: {
          backgroundColor: '#141414',
          titleColor: GOLD,
          bodyColor: '#fff',
          borderColor: GOLD_SOFT,
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: WHITE_SOFT } },
        y: { grid: { color: GRID }, ticks: { color: WHITE_SOFT } }
      }
    }, extra);
  }

  function makeOrUpdate(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (instances[id]) {
      instances[id].data = config.data;
      instances[id].options = config.options;
      instances[id].update();
    } else {
      instances[id] = new Chart(canvas.getContext('2d'), config);
    }
  }

  function lastN(entries, n) {
    return entries.slice(Math.max(entries.length - n, 0));
  }

  function renderAll(stats) {
    const entries = stats.entries;
    const last14 = lastN(entries, 14);
    const label1 = (stats.goal && stats.goal.incomeLabel1) || 'Income 1';
    const label2 = (stats.goal && stats.goal.incomeLabel2) || 'Income 2';

    // Daily income
    makeOrUpdate('chartDaily', {
      type: 'bar',
      data: {
        labels: last14.map(e => Utils.shortDate(e.date)),
        datasets: [{
          label: 'Net Savings',
          data: last14.map(e => e.net),
          backgroundColor: last14.map(e => e.net >= (stats.goal ? stats.goal.dailyTarget : 0) ? GOLD : 'rgba(212,175,55,0.35)'),
          borderRadius: 6,
          maxBarThickness: 28
        }]
      },
      options: baseOptions()
    });

    // Weekly income
    const weekEntries = Object.entries(stats.weekMap).slice(-10);
    makeOrUpdate('chartWeekly', {
      type: 'bar',
      data: {
        labels: weekEntries.map(w => w[0].split('-W')[1] ? 'W' + w[0].split('-W')[1] : w[0]),
        datasets: [{ label: 'Weekly Savings', data: weekEntries.map(w => w[1]), backgroundColor: GOLD, borderRadius: 6 }]
      },
      options: baseOptions()
    });

    // Monthly income
    const monthEntries = Object.entries(stats.monthMap).slice(-12);
    makeOrUpdate('chartMonthly', {
      type: 'bar',
      data: {
        labels: monthEntries.map(m => m[0]),
        datasets: [{ label: 'Monthly Savings', data: monthEntries.map(m => m[1]), backgroundColor: '#8a6d1a', borderRadius: 6 }]
      },
      options: baseOptions()
    });

    // Income 1 vs Income 2
    makeOrUpdate('chartPrintTrade', {
      type: 'line',
      data: {
        labels: last14.map(e => Utils.shortDate(e.date)),
        datasets: [
          { label: label1, data: last14.map(e => e.income1 || 0), borderColor: GOLD, backgroundColor: GOLD_SOFT, tension: 0.35, fill: true },
          { label: label2, data: last14.map(e => e.income2 || 0), borderColor: '#f4d976', backgroundColor: 'rgba(244,217,118,0.15)', tension: 0.35, fill: true }
        ]
      },
      options: baseOptions()
    });

    // Savings growth (cumulative)
    makeOrUpdate('chartGrowth', {
      type: 'line',
      data: {
        labels: entries.map(e => Utils.shortDate(e.date)),
        datasets: [{
          label: 'Running Total', data: entries.map(e => e.runningTotal),
          borderColor: GOLD, backgroundColor: 'rgba(212,175,55,0.12)', fill: true, tension: 0.3, pointRadius: 0
        }]
      },
      options: baseOptions()
    });

    // Goal projection: actual vs target pace line, projected to deadline
    const projLabels = [];
    const actualData = [];
    const targetData = [];
    const start = stats.goal ? stats.goal.startDate : stats.today;
    const deadline = stats.goal ? stats.goal.deadline : stats.today;
    const totalSpan = Math.max(Utils.daysBetween(start, deadline), 1);
    const byDate = {};
    entries.forEach(e => byDate[e.date] = e.runningTotal);
    let runningActual = null;
    for (let i = 0; i <= totalSpan; i += Math.max(Math.floor(totalSpan / 40), 1)) {
      const d = Dash.addDays(start, i);
      projLabels.push(Utils.shortDate(d));
      if (byDate[d] !== undefined) runningActual = byDate[d];
      actualData.push(d <= stats.today ? runningActual : null);
      targetData.push(Math.min((stats.goal ? stats.goal.dailyTarget : 0) * (i + 1), stats.goalAmount));
    }
    makeOrUpdate('chartProjection', {
      type: 'line',
      data: {
        labels: projLabels,
        datasets: [
          { label: 'Actual', data: actualData, borderColor: GOLD, borderWidth: 3, pointRadius: 0, tension: 0.25, spanGaps: true },
          { label: 'Target Pace', data: targetData, borderColor: 'rgba(255,255,255,0.3)', borderDash: [6, 6], pointRadius: 0, borderWidth: 2 },
          { label: 'Goal', data: projLabels.map(() => stats.goalAmount), borderColor: GREEN, borderDash: [2, 4], pointRadius: 0, borderWidth: 1 }
        ]
      },
      options: baseOptions()
    });

    // Expenses
    makeOrUpdate('chartExpense', {
      type: 'bar',
      data: {
        labels: last14.map(e => Utils.shortDate(e.date)),
        datasets: [{ label: 'Expenses', data: last14.map(e => e.expenses || 0), backgroundColor: RED, borderRadius: 6, maxBarThickness: 28 }]
      },
      options: baseOptions()
    });

    // Weekday insights
    const analytics = Dash.analytics(stats);
    if (analytics && analytics.weekdayAverages.length) {
      makeOrUpdate('chartWeekday', {
        type: 'bar',
        data: {
          labels: analytics.weekdayAverages.map(w => w.name.slice(0, 3)),
          datasets: [{
            label: 'Average Net Savings',
            data: analytics.weekdayAverages.map(w => w.average),
            backgroundColor: analytics.weekdayAverages.map(w =>
              analytics.bestWeekday && w.weekday === analytics.bestWeekday.weekday ? GREEN :
              analytics.worstWeekday && w.weekday === analytics.worstWeekday.weekday ? RED : GOLD
            ),
            borderRadius: 6
          }]
        },
        options: baseOptions({ plugins: { legend: { display: false } } })
      });
    }

    // Expense category breakdown
    if (analytics && analytics.categoryTotals.length) {
      makeOrUpdate('chartExpenseCategory', {
        type: 'doughnut',
        data: {
          labels: analytics.categoryTotals.map(c => c.category),
          datasets: [{
            data: analytics.categoryTotals.map(c => c.total),
            backgroundColor: analytics.categoryTotals.map((_, i) => PALETTE[i % PALETTE.length]),
            borderColor: '#0a0a0a',
            borderWidth: 2
          }]
        },
        options: baseOptions({ scales: {} })
      });
    }
  }

  function destroyAll() {
    Object.values(instances).forEach(c => c.destroy());
    Object.keys(instances).forEach(k => delete instances[k]);
  }

  return { renderAll, destroyAll };
})();
