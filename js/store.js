// Persistence. Everything lives in localStorage on the device; export/import
// in Settings is the backup path.

const KEY = 'overload.v1';

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DEFAULT_INCREMENTS = {
  kg: { barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, bodyweight: 2.5 },
  lb: { barbell: 5, dumbbell: 5, machine: 5, cable: 5, bodyweight: 5 },
};

function fresh() {
  return {
    version: 1,
    settings: { units: 'kg', increments: { ...DEFAULT_INCREMENTS.kg }, apiKey: '' },
    profile: null,
    plan: null,
    logs: [], // { id, date, dayId, dayName, deload, entries: [{ exId, planned, sets: [{w, r, rpe}] }], notes }
    draft: null, // in-progress session for a date
    onboard: { step: 0 },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return fresh();
}

export let state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('Could not save. Storage may be full or blocked. Export a backup from Settings.');
  }
}

export function replaceState(next) {
  state = { ...fresh(), ...next };
  save();
}

export function resetAll() {
  state = fresh();
  save();
}

// Converts every stored lifting weight when the user switches units.
export function switchUnits(units) {
  if (state.settings.units === units) return;
  const f = units === 'lb' ? 2.20462 : 1 / 2.20462;
  const round = (w) => Math.round(w * f * 4) / 4;
  for (const log of state.logs) {
    for (const en of log.entries) for (const s of en.sets) if (s.w) s.w = round(s.w);
  }
  if (state.draft) {
    for (const en of state.draft.entries) for (const s of en.sets) if (s.w) s.w = round(s.w);
  }
  state.settings.units = units;
  state.settings.increments = { ...DEFAULT_INCREMENTS[units] };
  save();
}

// All past entries for an exercise, newest first.
export function historyFor(exId, beforeDate = null) {
  const out = [];
  for (const log of state.logs) {
    if (beforeDate && log.date >= beforeDate) continue;
    for (const en of log.entries) {
      if (en.exId === exId && en.sets.some((s) => s.r > 0)) {
        out.push({ date: log.date, deload: !!log.deload, ...en });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
