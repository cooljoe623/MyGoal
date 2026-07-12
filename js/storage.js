/* ============================================================
   STORAGE.JS — LocalStorage persistence layer (multi-goal)
   ============================================================ */

const Storage = (() => {

  const KEYS = {
    goals: 'sfm_goals',              // array of goal objects
    activeGoal: 'sfm_active_goal',   // string: active goal id
    entries: 'sfm_entries',          // array of entries, each tagged with goalId
    settings: 'sfm_settings',        // app-wide: theme, currency, pin
    achievements: 'sfm_achievements' // map: { [goalId]: [achievementId, ...] }
  };

  const DEFAULT_APP_SETTINGS = {
    theme: 'dark',
    currency: 'KSh',
    pinEnabled: false,
    pinHash: null
  };

  const DEFAULT_GOAL_FIELDS = {
    name: 'My Goal',
    photo: null,
    missionStatement: '',
    incomeLabel1: 'Income Source 1',
    incomeLabel2: 'Income Source 2',
    targetAmount: 600000,
    stretchGoal: 650000,
    deadline: '2027-07-01',
    internalDeadline: '2027-06-01',
    dailyTarget: 1820,
    incomeTarget1: 300,
    incomeTarget2: 1520
  };

  function _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Storage read error for', key, e);
      return fallback;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write error for', key, e);
      return false;
    }
  }

  /* ---------- One-time migration from the single-goal schema ---------- */
  function migrateIfNeeded() {
    const existingGoals = _read(KEYS.goals, null);
    if (existingGoals) return; // already on the multi-goal schema

    const oldSettings = _read('sfm_settings', null);
    const oldMeta = _read('sfm_meta', null);
    const oldEntries = _read('sfm_entries', []);
    const oldAchievements = _read('sfm_achievements', []);
    const looksLegacy = oldSettings && (oldSettings.goal !== undefined || oldSettings.goalName !== undefined);

    if (looksLegacy) {
      const id = Utils.uid();
      const goal = Object.assign({}, DEFAULT_GOAL_FIELDS, {
        id,
        name: oldSettings.goalName || DEFAULT_GOAL_FIELDS.name,
        photo: oldSettings.goalPhoto || null,
        missionStatement: oldSettings.missionStatement || '',
        incomeLabel1: oldSettings.incomeLabel1 || DEFAULT_GOAL_FIELDS.incomeLabel1,
        incomeLabel2: oldSettings.incomeLabel2 || DEFAULT_GOAL_FIELDS.incomeLabel2,
        targetAmount: oldSettings.goal || DEFAULT_GOAL_FIELDS.targetAmount,
        stretchGoal: oldSettings.stretchGoal || DEFAULT_GOAL_FIELDS.stretchGoal,
        startDate: (oldMeta && oldMeta.startDate) || Utils.todayStr(),
        deadline: oldSettings.deadline || DEFAULT_GOAL_FIELDS.deadline,
        internalDeadline: oldSettings.internalDeadline || DEFAULT_GOAL_FIELDS.internalDeadline,
        dailyTarget: oldSettings.dailyTarget || DEFAULT_GOAL_FIELDS.dailyTarget,
        incomeTarget1: oldSettings.printingTarget || DEFAULT_GOAL_FIELDS.incomeTarget1,
        incomeTarget2: oldSettings.tradingTarget || DEFAULT_GOAL_FIELDS.incomeTarget2,
        createdAt: (oldMeta && oldMeta.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const migratedEntries = (oldEntries || []).map(e => ({
        id: e.id || Utils.uid(),
        goalId: id,
        date: e.date,
        income1: Number(e.printing) || 0,
        income2: Number(e.trading) || 0,
        other: Number(e.other) || 0,
        expenses: Number(e.expenses) || 0,
        expenseCategory: e.expenseCategory || (Number(e.expenses) > 0 ? 'Other' : ''),
        notes: e.notes || '',
        updatedAt: e.updatedAt || new Date().toISOString()
      }));

      _write(KEYS.goals, [goal]);
      _write(KEYS.activeGoal, id);
      _write(KEYS.entries, migratedEntries);
      _write(KEYS.achievements, { [id]: oldAchievements || [] });
      _write(KEYS.settings, {
        theme: oldSettings.theme || 'dark',
        currency: oldSettings.currency || 'KSh',
        pinEnabled: oldSettings.pinEnabled || false,
        pinHash: oldSettings.pinHash || null
      });

      [25, 50, 75, 100].forEach(pct => {
        const oldKey = `sfm_milestone_${pct}`;
        if (localStorage.getItem(oldKey)) {
          localStorage.setItem(`sfm_milestone_${id}_${pct}`, '1');
          localStorage.removeItem(oldKey);
        }
      });

      localStorage.removeItem('sfm_meta');
    } else {
      createDefaultGoalIfNone();
    }
  }

  function createDefaultGoalIfNone() {
    const goals = _read(KEYS.goals, []);
    if (goals.length) return;
    const goal = Object.assign({}, DEFAULT_GOAL_FIELDS, {
      id: Utils.uid(),
      startDate: Utils.todayStr(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    _write(KEYS.goals, [goal]);
    _write(KEYS.activeGoal, goal.id);
  }

  /* ---------- App-wide settings (theme, currency, PIN) ---------- */
  function getAppSettings() {
    return Object.assign({}, DEFAULT_APP_SETTINGS, _read(KEYS.settings, {}));
  }
  function saveAppSettings(patch) {
    const merged = Object.assign({}, getAppSettings(), patch);
    _write(KEYS.settings, merged);
    return merged;
  }

  /* ---------- Goals ---------- */
  function getGoals() {
    return _read(KEYS.goals, []);
  }
  function getGoal(id) {
    return getGoals().find(g => g.id === id) || null;
  }
  function getActiveGoalId() {
    const id = _read(KEYS.activeGoal, null);
    if (id && getGoal(id)) return id;
    const goals = getGoals();
    return goals.length ? goals[0].id : null;
  }
  function setActiveGoalId(id) {
    _write(KEYS.activeGoal, id);
  }
  function getActiveGoal() {
    const id = getActiveGoalId();
    return id ? getGoal(id) : null;
  }

  function createGoal(fields) {
    const goals = getGoals();
    const goal = Object.assign({}, DEFAULT_GOAL_FIELDS, fields, {
      id: Utils.uid(),
      startDate: (fields && fields.startDate) || Utils.todayStr(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    goals.push(goal);
    _write(KEYS.goals, goals);
    return goal;
  }

  function updateGoal(id, patch) {
    const goals = getGoals();
    const idx = goals.findIndex(g => g.id === id);
    if (idx < 0) return null;
    goals[idx] = Object.assign({}, goals[idx], patch, { updatedAt: new Date().toISOString() });
    _write(KEYS.goals, goals);
    return goals[idx];
  }

  function deleteGoal(id) {
    let goals = getGoals().filter(g => g.id !== id);
    _write(KEYS.goals, goals);

    const entries = _read(KEYS.entries, []).filter(e => e.goalId !== id);
    _write(KEYS.entries, entries);

    const achMap = _read(KEYS.achievements, {});
    delete achMap[id];
    _write(KEYS.achievements, achMap);

    [25, 50, 75, 100].forEach(pct => localStorage.removeItem(`sfm_milestone_${id}_${pct}`));

    if (getActiveGoalId() === id || _read(KEYS.activeGoal, null) === id) {
      _write(KEYS.activeGoal, goals.length ? goals[0].id : null);
    }
    if (!goals.length) createDefaultGoalIfNone();
    return getActiveGoalId();
  }

  /* ---------- Entries (scoped by goalId) ---------- */
  // Entry shape: { id, goalId, date, income1, income2, other, expenses, expenseCategory, notes, updatedAt }
  function getEntries(goalId) {
    const gid = goalId || getActiveGoalId();
    return _read(KEYS.entries, [])
      .filter(e => e.goalId === gid)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getEntryByDate(dateStr, goalId) {
    return getEntries(goalId).find(e => e.date === dateStr) || null;
  }

  function upsertEntry(entry, goalId) {
    const gid = goalId || getActiveGoalId();
    const all = _read(KEYS.entries, []);
    const idx = all.findIndex(e => e.goalId === gid && e.date === entry.date);
    entry.goalId = gid;
    entry.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      entry.id = all[idx].id;
      all[idx] = entry;
    } else {
      entry.id = entry.id || Utils.uid();
      all.push(entry);
    }
    _write(KEYS.entries, all);
    return entry;
  }

  function deleteEntryByDate(dateStr, goalId) {
    const gid = goalId || getActiveGoalId();
    const all = _read(KEYS.entries, []).filter(e => !(e.goalId === gid && e.date === dateStr));
    _write(KEYS.entries, all);
  }

  function deleteLastEntry(goalId) {
    const gid = goalId || getActiveGoalId();
    const list = getEntries(gid);
    if (!list.length) return null;
    const last = list[list.length - 1];
    deleteEntryByDate(last.date, gid);
    return last;
  }

  function netOf(entry) {
    return (Number(entry.income1) || 0) + (Number(entry.income2) || 0) +
      (Number(entry.other) || 0) - (Number(entry.expenses) || 0);
  }

  /* ---------- Achievements (scoped by goalId) ---------- */
  function getUnlockedAchievements(goalId) {
    const gid = goalId || getActiveGoalId();
    const map = _read(KEYS.achievements, {});
    return map[gid] || [];
  }
  function unlockAchievement(achId, goalId) {
    const gid = goalId || getActiveGoalId();
    const map = _read(KEYS.achievements, {});
    const list = map[gid] || [];
    if (!list.includes(achId)) {
      list.push(achId);
      map[gid] = list;
      _write(KEYS.achievements, map);
      return true;
    }
    return false;
  }

  /* ---------- Milestone-crossed flags (scoped by goalId) ---------- */
  function hasMilestoneFlag(pct, goalId) {
    const gid = goalId || getActiveGoalId();
    return !!localStorage.getItem(`sfm_milestone_${gid}_${pct}`);
  }
  function setMilestoneFlag(pct, goalId) {
    const gid = goalId || getActiveGoalId();
    localStorage.setItem(`sfm_milestone_${gid}_${pct}`, '1');
  }

  /* ---------- PIN lock (app-wide) ---------- */
  async function setPin(pin) {
    const hash = await Utils.hashPin(pin);
    saveAppSettings({ pinEnabled: true, pinHash: hash });
  }
  function disablePin() {
    saveAppSettings({ pinEnabled: false, pinHash: null });
  }
  async function verifyPin(pin) {
    const s = getAppSettings();
    if (!s.pinHash) return false;
    const hash = await Utils.hashPin(pin);
    return hash === s.pinHash;
  }
  function isPinEnabled() {
    return !!getAppSettings().pinEnabled;
  }

  /* ---------- Reset scopes ---------- */

  /** Wipe only the given goal's progress data (entries, achievements, milestones)
   *  but keep the goal's own settings (name, photo, targets, dates) intact. */
  function resetGoalData(goalId) {
    const gid = goalId || getActiveGoalId();
    const entries = _read(KEYS.entries, []).filter(e => e.goalId !== gid);
    _write(KEYS.entries, entries);
    const achMap = _read(KEYS.achievements, {});
    delete achMap[gid];
    _write(KEYS.achievements, achMap);
    [25, 50, 75, 100].forEach(pct => localStorage.removeItem(`sfm_milestone_${gid}_${pct}`));
  }

  /** Nuclear option: wipe absolutely everything, including all goals, all
   *  entries, app settings, and the PIN. Used by the Forgot PIN recovery flow. */
  function eraseEverything() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    [25, 50, 75, 100]; // no-op, per-goal keys are cleared implicitly since goals are gone
    createDefaultGoalIfNone();
  }

  /* ---------- Backup / Restore (all goals) ---------- */
  function exportBackup() {
    return {
      goals: getGoals(),
      activeGoalId: getActiveGoalId(),
      entries: _read(KEYS.entries, []),
      settings: getAppSettings(),
      achievements: _read(KEYS.achievements, {}),
      exportedAt: new Date().toISOString(),
      app: 'Personal Goal Savings Tracker',
      schema: 2
    };
  }

  function restoreBackup(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup file');

    if (data.schema === 2 && Array.isArray(data.goals)) {
      _write(KEYS.goals, data.goals);
      _write(KEYS.activeGoal, data.activeGoalId || (data.goals[0] && data.goals[0].id) || null);
      _write(KEYS.entries, Array.isArray(data.entries) ? data.entries : []);
      _write(KEYS.achievements, data.achievements && typeof data.achievements === 'object' ? data.achievements : {});
      if (data.settings) _write(KEYS.settings, Object.assign({}, DEFAULT_APP_SETTINGS, data.settings));
      return;
    }

    // Legacy single-goal backup shape — migrate it into a new goal on restore.
    if (data.settings && (data.settings.goal !== undefined || data.settings.goalName !== undefined)) {
      const id = Utils.uid();
      const s = data.settings;
      const meta = data.meta || {};
      const goal = Object.assign({}, DEFAULT_GOAL_FIELDS, {
        id,
        name: s.goalName || DEFAULT_GOAL_FIELDS.name,
        photo: s.goalPhoto || null,
        missionStatement: s.missionStatement || '',
        incomeLabel1: s.incomeLabel1 || DEFAULT_GOAL_FIELDS.incomeLabel1,
        incomeLabel2: s.incomeLabel2 || DEFAULT_GOAL_FIELDS.incomeLabel2,
        targetAmount: s.goal || DEFAULT_GOAL_FIELDS.targetAmount,
        stretchGoal: s.stretchGoal || DEFAULT_GOAL_FIELDS.stretchGoal,
        startDate: meta.startDate || Utils.todayStr(),
        deadline: s.deadline || DEFAULT_GOAL_FIELDS.deadline,
        internalDeadline: s.internalDeadline || DEFAULT_GOAL_FIELDS.internalDeadline,
        dailyTarget: s.dailyTarget || DEFAULT_GOAL_FIELDS.dailyTarget,
        incomeTarget1: s.printingTarget || DEFAULT_GOAL_FIELDS.incomeTarget1,
        incomeTarget2: s.tradingTarget || DEFAULT_GOAL_FIELDS.incomeTarget2,
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      const entries = (Array.isArray(data.entries) ? data.entries : []).map(e => ({
        id: e.id || Utils.uid(), goalId: id, date: e.date,
        income1: Number(e.printing) || 0, income2: Number(e.trading) || 0,
        other: Number(e.other) || 0, expenses: Number(e.expenses) || 0,
        expenseCategory: e.expenseCategory || '', notes: e.notes || '',
        updatedAt: e.updatedAt || new Date().toISOString()
      }));
      _write(KEYS.goals, [goal]);
      _write(KEYS.activeGoal, id);
      _write(KEYS.entries, entries);
      _write(KEYS.achievements, { [id]: Array.isArray(data.achievements) ? data.achievements : [] });
      _write(KEYS.settings, {
        theme: s.theme || 'dark', currency: s.currency || 'KSh',
        pinEnabled: s.pinEnabled || false, pinHash: s.pinHash || null
      });
      return;
    }

    throw new Error('Unrecognized backup format');
  }

  /* ---------- Cloud sync merge (last-write-wins per record) ---------- */
  /**
   * Merge a remote backup (same shape as exportBackup()) into local data.
   * Strategy: union of goals/entries by id/date-key, keeping whichever side's
   * copy has the newer `updatedAt` when the same record exists on both sides.
   * Achievements are unioned per goal (unlocking is monotonic — never wrong
   * to keep both sides' unlocks). `theme` and the active goal selection stay
   * local to each device and are never overwritten by a remote pull.
   *
   * NOTE ON DELETIONS: this merge has no tombstone/delete-log, so if an
   * entry or goal was deleted on one device, a stale copy still present on
   * another un-synced device can reappear after merging. For a personal,
   * mostly-online app this is an acceptable trade-off against the much
   * larger complexity of a real conflict-free sync system — see README.
   */
  function mergeRemoteBackup(remote) {
    if (!remote || !Array.isArray(remote.goals)) {
      return { addedGoals: 0, updatedGoals: 0, addedEntries: 0, updatedEntries: 0 };
    }

    const localGoals = getGoals();
    const localGoalMap = new Map(localGoals.map(g => [g.id, g]));
    let addedGoals = 0, updatedGoals = 0;

    remote.goals.forEach(rg => {
      const lg = localGoalMap.get(rg.id);
      if (!lg) {
        localGoalMap.set(rg.id, rg);
        addedGoals++;
      } else {
        const rTime = Date.parse(rg.updatedAt || 0) || 0;
        const lTime = Date.parse(lg.updatedAt || 0) || 0;
        if (rTime > lTime) {
          localGoalMap.set(rg.id, rg);
          updatedGoals++;
        }
      }
    });
    _write(KEYS.goals, Array.from(localGoalMap.values()));

    const localEntries = _read(KEYS.entries, []);
    const localEntryMap = new Map(localEntries.map(e => [`${e.goalId}::${e.date}`, e]));
    let addedEntries = 0, updatedEntries = 0;

    (Array.isArray(remote.entries) ? remote.entries : []).forEach(re => {
      const key = `${re.goalId}::${re.date}`;
      const le = localEntryMap.get(key);
      if (!le) {
        localEntryMap.set(key, re);
        addedEntries++;
      } else {
        const rTime = Date.parse(re.updatedAt || 0) || 0;
        const lTime = Date.parse(le.updatedAt || 0) || 0;
        if (rTime > lTime) {
          localEntryMap.set(key, re);
          updatedEntries++;
        }
      }
    });
    _write(KEYS.entries, Array.from(localEntryMap.values()));

    const localAch = _read(KEYS.achievements, {});
    const remoteAch = remote.achievements && typeof remote.achievements === 'object' ? remote.achievements : {};
    Object.keys(remoteAch).forEach(goalId => {
      const merged = new Set([...(localAch[goalId] || []), ...(remoteAch[goalId] || [])]);
      localAch[goalId] = Array.from(merged);
    });
    _write(KEYS.achievements, localAch);

    if (!_read(KEYS.activeGoal, null) && remote.activeGoalId) {
      _write(KEYS.activeGoal, remote.activeGoalId);
    }

    if (remote.settings) {
      const localSettings = getAppSettings();
      const patch = {};
      if (remote.settings.currency) patch.currency = remote.settings.currency;
      if (remote.settings.pinEnabled !== undefined && !localSettings.pinHash) {
        patch.pinEnabled = remote.settings.pinEnabled;
        patch.pinHash = remote.settings.pinHash;
      }
      if (Object.keys(patch).length) saveAppSettings(patch);
    }

    return { addedGoals, updatedGoals, addedEntries, updatedEntries };
  }

  return {
    KEYS,
    migrateIfNeeded,
    getAppSettings, saveAppSettings,
    getGoals, getGoal, getActiveGoalId, setActiveGoalId, getActiveGoal,
    createGoal, updateGoal, deleteGoal,
    getEntries, getEntryByDate, upsertEntry, deleteEntryByDate, deleteLastEntry, netOf,
    getUnlockedAchievements, unlockAchievement,
    hasMilestoneFlag, setMilestoneFlag,
    setPin, disablePin, verifyPin, isPinEnabled,
    resetGoalData, eraseEverything,
    exportBackup, restoreBackup, mergeRemoteBackup
  };
})();
