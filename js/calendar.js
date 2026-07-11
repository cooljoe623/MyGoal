/* ============================================================
   CALENDAR.JS — monthly calendar grid
   ============================================================ */

const CalendarView = (() => {
  let viewYear, viewMonth; // month is 0-indexed

  function init() {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }

  function shift(delta) {
    viewMonth += delta;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    render();
  }

  function statusFor(dateStr, goal) {
    const entry = Storage.getEntryByDate(dateStr, goal ? goal.id : null);
    if (!entry) return 'none';
    const net = Storage.netOf(entry);
    if (net >= (goal ? goal.dailyTarget : 0)) return 'hit';
    if (net > 0) return 'partial';
    return 'missed';
  }

  function render() {
    if (viewYear === undefined) init();
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarLabel');
    if (!grid || !label) return;

    const goal = Storage.getActiveGoal();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = `${monthNames[viewMonth]} ${viewYear}`;

    grid.innerHTML = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const h = document.createElement('div');
      h.className = 'cal-head';
      h.textContent = d;
      grid.appendChild(h);
    });

    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell cal-blank';
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = Utils.toDateStr(new Date(viewYear, viewMonth, day));
      const status = statusFor(dateStr, goal);
      const cell = document.createElement('div');
      cell.className = `cal-cell cal-${status}`;
      cell.innerHTML = `<span class="cal-day-num">${day}</span>`;
      if (dateStr === Utils.todayStr()) cell.classList.add('cal-today');
      cell.addEventListener('click', () => App.openEntryForDate(dateStr));
      grid.appendChild(cell);
    }
  }

  return { init, shift, render };
})();
