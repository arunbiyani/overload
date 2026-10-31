import { EXERCISES, MUSCLES, EQUIPMENT, getExercise, alternativesFor } from './exercises.js';
import {
  GOALS, EXPERIENCE, ACTIVITY, WEEKDAYS, SPLITS, DEFAULT_WEEKDAYS,
  bodyAnalysis, recommendDays, generatePlan, prescribe, makePlanExercise, estimateMinutes,
  weeklyVolume, volumeStatus, parseDate, addDays, weekNumber, isDeloadWeek, dayForDate, nextTrainingDate,
} from './planner.js';
import { suggest, e1rm, bestSet } from './progression.js';
import { state, save, uid, todayStr, historyFor, switchUnits, replaceState, resetAll, DEFAULT_INCREMENTS } from './store.js';
import { askClaude } from './ai.js';

const root = document.getElementById('app');
const ui = {
  route: 'today',
  picker: null, // { dayId, pxId | null, muscle }
  overrideDayId: null,
  progressEx: null,
  openLog: null,
  ai: { open: false, loading: false, error: '', result: null, request: '' },
  timer: null, // { end, total, label }
};

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const u = () => state.settings.units;
const LB = 2.20462;
const toDisplayW = (kg) => (u() === 'lb' ? kg * LB : kg);
const fromDisplayW = (w) => (u() === 'lb' ? w / LB : w);
const fw = (kg) => `${toDisplayW(kg).toFixed(1)} ${u()}`;
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const niceDate = (s) => parseDate(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtRest = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`);
const clean = (x) => Math.round(x * 100) / 100;

function planCtx() {
  return ui.route === 'onboarding' ? state.onboard.plan : state.plan;
}

function needsOnboarding() {
  return !state.plan || !state.plan.finalized;
}

function go(route) {
  ui.route = route;
  location.hash = route;
  render();
  window.scrollTo(0, 0);
}

// ---------- layout ----------

function render() {
  if (needsOnboarding() && ui.route !== 'settings') ui.route = 'onboarding';
  const views = { onboarding: viewOnboarding, today: viewToday, plan: viewPlan, progress: viewProgress, settings: viewSettings };
  const body = (views[ui.route] || viewToday)();
  const nav = ui.route === 'onboarding' ? '' : `
    <nav class="tabbar">
      ${[['today', 'Today', '◉'], ['plan', 'Plan', '▦'], ['progress', 'Progress', '↗'], ['settings', 'Settings', '⚙']].map(([r, l, i]) => `
        <button class="tab ${ui.route === r ? 'active' : ''}" data-action="nav" data-route="${r}"><span class="tab-ico">${i}</span>${l}</button>`).join('')}
    </nav>`;
  root.innerHTML = `<main class="view">${body}</main>${timerBar()}${nav}${ui.picker ? pickerModal() : ''}`;
}

// ---------- onboarding ----------

function obDefaults() {
  const ob = state.onboard;
  if (!ob.p) {
    const prev = state.profile;
    ob.p = prev ? {
      ...prev,
      weight: clean(toDisplayW(prev.weightKg)),
      targetWeight: prev.targetWeightKg ? clean(toDisplayW(prev.targetWeightKg)) : '',
      startDate: todayStr(),
    } : {
      name: '', sex: 'male', age: 30, heightCm: 175, weight: u() === 'lb' ? 175 : 80, bodyFat: '',
      goal: 'muscle', targetWeight: '', weeks: 12, experience: 'beginner', activity: 'light',
      daysAvailable: 4, sessionMinutes: 60, startDate: todayStr(),
    };
  }
  return ob.p;
}

function obProfile() {
  const p = obDefaults();
  return {
    name: p.name, sex: p.sex, age: Number(p.age), heightCm: Number(p.heightCm),
    weightKg: fromDisplayW(Number(p.weight)), bodyFat: num(p.bodyFat),
    goal: p.goal, targetWeightKg: num(p.targetWeight) ? fromDisplayW(Number(p.targetWeight)) : null,
    weeks: Number(p.weeks), experience: p.experience, activity: p.activity,
    daysAvailable: Number(p.daysAvailable), sessionMinutes: Number(p.sessionMinutes), startDate: p.startDate,
  };
}

function field(label, inner, hint = '') {
  return `<label class="field"><span class="field-label">${label}</span>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
}
const input = (key, val, attrs = '') => `<input data-bind="ob" data-key="${key}" value="${esc(val)}" ${attrs}>`;
const select = (key, val, opts) => `<select data-bind="ob" data-key="${key}">${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${String(val) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
const choice = (key, val, opts) => `<div class="choices">${Object.entries(opts).map(([k, o]) => `
  <button type="button" class="choice ${String(val) === k ? 'on' : ''}" data-action="ob-pick" data-key="${key}" data-val="${k}">
    <strong>${esc(o.label)}</strong>${o.blurb ? `<span>${esc(o.blurb)}</span>` : ''}
  </button>`).join('')}</div>`;

function viewOnboarding() {
  const ob = state.onboard;
  const p = obDefaults();
  const steps = ['You', 'Goal', 'Schedule', 'Analysis', 'Plan'];
  const header = `
    <header class="ob-head">
      <div class="brand">Overload</div>
      <ol class="steps">${steps.map((s, i) => `<li class="${i === ob.step ? 'cur' : i < ob.step ? 'done' : ''}">${s}</li>`).join('')}</ol>
    </header>`;
  let body = '';

  if (ob.step === 0) {
    body = `
      <h1>Let's build your plan</h1>
      <p class="lead">A few details about your body help set calorie, protein and training targets.</p>
      <div class="card">
        ${field('Units', `<div class="seg">${['kg', 'lb'].map((x) => `<button type="button" class="${u() === x ? 'on' : ''}" data-action="units" data-val="${x}">${x}</button>`).join('')}</div>`)}
        ${field('Name (optional)', input('name', p.name, 'placeholder="Your name"'))}
        ${field('Sex', select('sex', p.sex, { male: 'Male', female: 'Female' }), 'Used for the metabolic rate formula.')}
        <div class="row2">
          ${field('Age', input('age', p.age, 'type="number" inputmode="numeric" min="14" max="90"'))}
          ${field('Height (cm)', input('heightCm', p.heightCm, 'type="number" inputmode="decimal"'))}
        </div>
        <div class="row2">
          ${field(`Weight (${u()})`, input('weight', p.weight, 'type="number" inputmode="decimal" step="0.1"'))}
          ${field('Body fat % (optional)', input('bodyFat', p.bodyFat, 'type="number" inputmode="decimal" placeholder="e.g. 20"'))}
        </div>
      </div>`;
  } else if (ob.step === 1) {
    body = `
      <h1>What's the goal?</h1>
      <div class="card">
        ${field('Main goal', choice('goal', p.goal, GOALS))}
        <div class="row2">
          ${field(`Target weight (${u()})`, input('targetWeight', p.targetWeight, 'type="number" inputmode="decimal" step="0.1" placeholder="optional"'))}
          ${field('Timeline', select('weeks', p.weeks, Object.fromEntries([4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 52].map((w) => [w, `${w} weeks`]))))}
        </div>
        ${field('Training experience', choice('experience', p.experience, EXPERIENCE))}
        ${field('Daily activity outside the gym', select('activity', p.activity, Object.fromEntries(Object.entries(ACTIVITY).map(([k, v]) => [k, v.label]))))}
      </div>`;
  } else if (ob.step === 2) {
    body = `
      <h1>Your availability</h1>
      <div class="card">
        ${field('Max days per week you can train', `<div class="seg">${[2, 3, 4, 5, 6].map((d) => `<button type="button" class="${Number(p.daysAvailable) === d ? 'on' : ''}" data-action="ob-pick" data-key="daysAvailable" data-val="${d}">${d}</button>`).join('')}</div>`)}
        ${field('Time per session', `<div class="seg">${[30, 45, 60, 75, 90].map((m) => `<button type="button" class="${Number(p.sessionMinutes) === m ? 'on' : ''}" data-action="ob-pick" data-key="sessionMinutes" data-val="${m}">${m}m</button>`).join('')}</div>`)}
        ${field('Start date', input('startDate', p.startDate, 'type="date"'))}
      </div>`;
  } else if (ob.step === 3) {
    const prof = obProfile();
    const a = bodyAnalysis(prof, fw);
    const rec = recommendDays(prof);
    if (!ob.days) ob.days = rec.days;
    if (!ob.weekdays || ob.weekdaysFor !== ob.days) { ob.weekdays = [...DEFAULT_WEEKDAYS[ob.days]]; ob.weekdaysFor = ob.days; }
    const okWeekdays = ob.weekdays.length === ob.days;
    body = `
      <h1>Your numbers</h1>
      <div class="card stats">
        <div class="stat"><span>Maintenance</span><strong>${Math.round(a.tdee)}</strong><em>kcal/day</em></div>
        <div class="stat hi"><span>Eat</span><strong>${a.kcal}</strong><em>kcal/day</em></div>
        <div class="stat hi"><span>Protein</span><strong>${a.proteinG} g</strong><em>${a.proteinPerKg} g/kg</em></div>
        <div class="stat"><span>BMI</span><strong>${a.bmi.toFixed(1)}</strong><em>BMR ${Math.round(a.bmr)}</em></div>
      </div>
      <div class="card">
        <p class="small">Carbs ~${a.carbG} g · Fat ~${a.fatG} g. Expected rate: ${esc(a.rateText)}.</p>
        ${a.warnings.map((w) => `<div class="callout warn">${esc(w)}</div>`).join('')}
        <ul class="notes">${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
      <h2>How many days should you train?</h2>
      <div class="card">
        <div class="callout good"><strong>Recommended: ${rec.days} days, ${esc(SPLITS[rec.days].name)}</strong><br>${rec.reasons.map(esc).join(' ')}</div>
        <div class="choices">${[2, 3, 4, 5, 6].filter((d) => d <= Math.max(prof.daysAvailable, rec.days)).map((d) => `
          <button type="button" class="choice ${ob.days === d ? 'on' : ''}" data-action="ob-days" data-val="${d}">
            <strong>${d} days · ${esc(SPLITS[d].name)} ${d === rec.days ? '<em class="badge">recommended</em>' : ''}</strong>
            <span>${esc(SPLITS[d].why)}</span>
          </button>`).join('')}</div>
        ${field(`Which days? Pick ${ob.days}`, `<div class="chips">${WEEKDAYS.map((w, i) => `<button type="button" class="chip ${ob.weekdays.includes(i) ? 'on' : ''}" data-action="ob-wd" data-val="${i}">${w}</button>`).join('')}</div>`,
          okWeekdays ? 'Leave at least one rest day between hard sessions for the same muscles where you can.' : `<span class="err">Selected ${ob.weekdays.length}, need ${ob.days}.</span>`)}
      </div>`;
  } else if (ob.step === 4) {
    body = `
      <h1>Your plan</h1>
      <p class="lead">Edit anything: rename days, swap or reorder exercises, change sets and reps. When it looks right, start the plan.</p>
      ${planEditor(ob.plan)}`;
  }

  const canNext = ob.step !== 3 || (ob.weekdays && ob.weekdays.length === ob.days);
  const nextLabel = ['Next', 'Next', 'See my analysis', 'Generate plan', 'Start this plan'][ob.step];
  return `${header}${body}
    <div class="actions sticky">
      ${ob.step > 0 ? '<button class="btn ghost" data-action="ob-back">Back</button>' : (state.plan?.finalized ? '<button class="btn ghost" data-action="ob-cancel">Cancel</button>' : '<span></span>')}
      <button class="btn primary" data-action="ob-next" ${canNext ? '' : 'disabled'}>${nextLabel}</button>
    </div>`;
}

// ---------- plan editor (shared by onboarding and Plan tab) ----------

function planEditor(plan) {
  const vol = weeklyVolume(plan);
  const end = addDays(plan.startDate, plan.weeks * 7 - 1);
  return `
    <div class="card summary">
      <div><strong>${esc(plan.split)}</strong></div>
      <div class="small">${niceDate(plan.startDate)} → ${niceDate(end)} · ${plan.weeks} weeks · deload every ${plan.deloadEvery}th week</div>
    </div>

    <h2>Weekly schedule</h2>
    <div class="card sched">
      ${WEEKDAYS.map((w, i) => `
        <label class="sched-row"><span>${w}</span>
          <select data-bind="sched" data-wd="${i}">
            <option value="">Rest</option>
            ${plan.days.map((d) => `<option value="${d.id}" ${plan.schedule[i] === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
          </select>
        </label>`).join('')}
    </div>

    <h2>Workouts</h2>
    ${plan.days.map((d) => dayCard(d, plan)).join('')}
    <button class="btn ghost wide" data-action="day-add">+ Add workout day</button>

    ${aiPanel(plan)}

    <h2>Weekly sets per muscle</h2>
    <div class="card">
      <p class="small">Research supports roughly 10–20 hard sets per muscle per week for growth. Indirect work (e.g. triceps in pressing) counts as half a set.</p>
      <div class="vol">
        ${Object.entries(vol).map(([m, s]) => {
          const st = volumeStatus(m, s);
          return `<div class="vol-row"><span>${MUSCLES[m]}</span><div class="vol-bar"><div class="band"></div><div class="fill ${st}" style="width:${Math.min(100, (s / 25) * 100)}%"></div></div><b class="${st}">${clean(s)}</b></div>`;
        }).join('')}
      </div>
    </div>

    <h2>Day-by-day calendar</h2>
    <div class="card">${calendar(plan)}</div>`;
}

function dayCard(d, plan) {
  const used = Object.entries(plan.schedule).filter(([, id]) => id === d.id).map(([wd]) => WEEKDAYS[wd]);
  return `
    <section class="day card">
      <div class="day-head">
        <input class="day-name" data-bind="dayname" data-day="${d.id}" value="${esc(d.name)}" aria-label="Workout name">
        <span class="pill">~${estimateMinutes(d)} min</span>
      </div>
      <div class="small muted">${used.length ? used.join(', ') : 'Not scheduled'}</div>
      <div class="ex-list">
        ${d.exercises.map((x, i) => exEditCard(d, x, i)).join('')}
      </div>
      <div class="day-actions">
        <button class="btn small" data-action="ex-add" data-day="${d.id}">+ Exercise</button>
        <button class="btn small ghost danger" data-action="day-del" data-day="${d.id}">Delete day</button>
      </div>
    </section>`;
}

function exEditCard(d, x, i) {
  const e = getExercise(x.exId);
  const n = (f, v, attrs = '') => `<label><span>${f[1]}</span><input type="number" inputmode="numeric" data-bind="px" data-day="${d.id}" data-px="${x.id}" data-field="${f[0]}" value="${v}" ${attrs}></label>`;
  return `
    <div class="ex-card">
      <div class="ex-top">
        <div>
          <div class="ex-name">${esc(e?.name || x.exId)}</div>
          <div class="tags"><span class="tag">${MUSCLES[e?.muscle] || ''}</span><span class="tag soft">${EQUIPMENT[e?.equip] || ''}</span></div>
        </div>
        <div class="ex-tools">
          <button class="icon" title="Move up" data-action="ex-up" data-day="${d.id}" data-px="${x.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon" title="Move down" data-action="ex-down" data-day="${d.id}" data-px="${x.id}">↓</button>
          <button class="icon" title="Swap" data-action="ex-swap" data-day="${d.id}" data-px="${x.id}">⇄</button>
          <button class="icon danger" title="Remove" data-action="ex-del" data-day="${d.id}" data-px="${x.id}">✕</button>
        </div>
      </div>
      <div class="rx">
        ${n(['sets', 'Sets'], x.sets, 'min="1" max="10"')}
        ${n(['repMin', 'Reps min'], x.repMin, 'min="1" max="30"')}
        ${n(['repMax', 'Reps max'], x.repMax, 'min="1" max="30"')}
        ${n(['rir', 'RIR'], x.rir, 'min="0" max="5"')}
        ${n(['restSec', 'Rest s'], x.restSec, 'min="0" step="15"')}
      </div>
    </div>`;
}

function calendar(plan) {
  const today = todayStr();
  let html = '';
  for (let w = 1; w <= plan.weeks; w++) {
    const ws = addDays(plan.startDate, (w - 1) * 7);
    const deload = plan.deloadEvery && w % plan.deloadEvery === 0;
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const ds = addDays(ws, i);
      const day = dayForDate(plan, ds);
      const logged = state.logs.find((l) => l.date === ds);
      rows.push(`<li class="${ds === today ? 'today' : ''} ${day ? '' : 'rest'}"><span>${niceDate(ds)}</span><span>${day ? esc(day.name) : 'Rest'}${logged ? ' ✓' : ''}</span></li>`);
    }
    const current = today >= ws && today <= addDays(ws, 6);
    html += `<details ${current ? 'open' : ''}><summary>Week ${w}${deload ? ' <em class="badge">deload</em>' : ''}<span class="muted small"> · ${niceDate(ws)}</span></summary><ul class="cal">${rows.join('')}</ul></details>`;
  }
  return html;
}

function aiPanel(plan) {
  if (!state.settings.apiKey) {
    return `<div class="card muted small">Want to tweak the plan in plain words (for example, "I have a sore shoulder, avoid overhead pressing")? Add an Anthropic API key in Settings to use the AI coach.</div>`;
  }
  const a = ui.ai;
  if (!a.open) return '<button class="btn ghost wide" data-action="ai-open">✨ Ask AI coach to adjust this plan</button>';
  return `
    <div class="card ai">
      <h3>AI coach</h3>
      <textarea id="ai-req" rows="3" placeholder="e.g. More glute work, shorter sessions, no barbell squats">${esc(a.request)}</textarea>
      ${a.error ? `<div class="callout warn">${esc(a.error)}</div>` : ''}
      ${a.result ? `<div class="callout good">${esc(a.result.explanation)}</div>
        <div class="small">${a.result.days.map((d) => `<div><b>${esc(d.name)}</b>: ${d.exercises.map((x) => esc(getExercise(x.exId)?.name || x.exId)).join(', ')}</div>`).join('')}</div>
        <div class="actions"><button class="btn ghost" data-action="ai-discard">Discard</button><button class="btn primary" data-action="ai-apply">Apply changes</button></div>` : `
        <div class="actions"><button class="btn ghost" data-action="ai-close">Close</button><button class="btn primary" data-action="ai-run" ${a.loading ? 'disabled' : ''}>${a.loading ? 'Thinking…' : 'Suggest changes'}</button></div>`}
    </div>`;
}

function pickerModal() {
  const p = ui.picker;
  const plan = planCtx();
  const day = plan.days.find((d) => d.id === p.dayId);
  const current = p.pxId ? day.exercises.find((x) => x.id === p.pxId) : null;
  const list = EXERCISES.filter((e) => !p.muscle || e.muscle === p.muscle).filter((e) => !current || e.id !== current.exId);
  return `
    <div class="modal" data-action="picker-close-bg">
      <div class="sheet">
        <div class="sheet-head"><h3>${current ? `Swap ${esc(getExercise(current.exId)?.name)}` : 'Add exercise'}</h3><button class="icon" data-action="picker-close">✕</button></div>
        <select data-bind="picker-muscle">
          <option value="">All muscles</option>
          ${Object.entries(MUSCLES).map(([k, v]) => `<option value="${k}" ${p.muscle === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <div class="pick-list">
          ${list.map((e) => `<button class="pick" data-action="picker-choose" data-ex="${e.id}"><strong>${esc(e.name)}</strong><span>${MUSCLES[e.muscle]} · ${EQUIPMENT[e.equip]} · ${e.type}</span></button>`).join('')}
        </div>
      </div>
    </div>`;
}

// ---------- today ----------

function sessionContext() {
  const today = todayStr();
  const plan = state.plan;
  const overrideDay = ui.overrideDayId && plan.days.find((d) => d.id === ui.overrideDayId);
  const draftDay = state.draft?.date === today && plan.days.find((d) => d.id === state.draft.dayId);
  const day = overrideDay || draftDay || dayForDate(plan, today);
  return { today, plan, day, deload: isDeloadWeek(plan, today), week: weekNumber(plan, today) };
}

function buildDraft(day, date, deload) {
  return {
    date,
    dayId: day.id,
    logId: null,
    entries: day.exercises.map((px) => {
      const sug = suggest(px, historyFor(px.exId, date), state.settings, { deload });
      return {
        pxId: px.id,
        exId: px.exId,
        sets: Array.from({ length: sug.sets }, (_, i) => ({ w: sug.weight ?? '', r: '', rpe: '', target: sug.reps[i] ?? px.repMin })),
      };
    }),
  };
}

function viewToday() {
  const { today, plan, day, deload, week } = sessionContext();
  const logged = state.logs.filter((l) => l.date === today);
  const head = `
    <header class="page-head">
      <div><div class="eyebrow">${niceDate(today)}</div><h1>${state.profile?.name ? `Hi ${esc(state.profile.name)}` : 'Today'}</h1></div>
      ${week >= 1 ? `<span class="pill">Week ${week}/${plan.weeks}</span>` : ''}
    </header>`;

  if (today < plan.startDate) {
    return `${head}<div class="card"><h2>Your plan starts ${niceDate(plan.startDate)}</h2><p>Want to start today instead?</p><button class="btn primary" data-action="start-today">Start today</button></div>`;
  }
  if (week > plan.weeks) {
    return `${head}<div class="card"><h2>Plan complete 🎉</h2><p>You finished all ${plan.weeks} weeks. Check your progress, then set up a new block. Your history carries over, so the weight suggestions continue where you left off.</p><button class="btn primary" data-action="redo-setup">Set up next block</button></div>`;
  }

  if (logged.length && !(state.draft?.date === today) && !ui.overrideDayId) {
    return `${head}
      ${logged.map((l) => `<div class="card done-card"><h2>✓ ${esc(l.dayName)} done</h2>${logSummary(l)}<button class="btn small ghost" data-action="log-edit" data-id="${l.id}">Edit this log</button></div>`).join('')}
      ${nextUp(plan, today)}`;
  }

  if (!day) {
    return `${head}
      <div class="card rest-card"><h2>Rest day</h2><p>Recovery is when muscle is built. Walk, stretch, sleep well, and hit your protein target.</p></div>
      ${nextUp(plan, today)}
      <h2>Train anyway?</h2>
      <div class="card">${plan.days.map((d) => `<button class="btn ghost wide" data-action="train-day" data-day="${d.id}">Do ${esc(d.name)} today</button>`).join('')}</div>`;
  }

  if (!state.draft || state.draft.date !== today || state.draft.dayId !== day.id) {
    state.draft = buildDraft(day, today, deload);
    save();
  }
  const draft = state.draft;
  const done = draft.entries.reduce((a, en) => a + en.sets.filter((s) => num(s.r) > 0).length, 0);
  const total = draft.entries.reduce((a, en) => a + en.sets.length, 0);

  return `${head}
    <div class="card today-head">
      <div class="eyebrow">Today's workout</div>
      <h2>${esc(day.name)} ${deload ? '<em class="badge">deload week</em>' : ''}</h2>
      <div class="small muted">${day.exercises.length} exercises · ~${estimateMinutes(day)} min · <span id="progress-count">${done}/${total}</span> sets logged</div>
      ${deload ? '<div class="callout">Deload week: fewer sets and lighter weights, finishing each set with 3–4 reps in reserve. This is planned. It lets fatigue drop so strength can show.</div>' : ''}
      ${ui.overrideDayId || draft.logId ? `<button class="btn small ghost" data-action="back-to-schedule">Back to scheduled day</button>` : ''}
    </div>
    ${draft.entries.map((en, ei) => sessionCard(en, ei, day, today, deload)).join('')}
    <div class="actions sticky">
      <button class="btn ghost" data-action="session-reset">Reset</button>
      <button class="btn primary" data-action="session-finish">Finish workout</button>
    </div>`;
}

function nextUp(plan, today) {
  const nd = nextTrainingDate(plan, today);
  if (!nd) return '';
  const d = dayForDate(plan, nd);
  return `<div class="card"><div class="eyebrow">Next workout</div><h3>${esc(d.name)} · ${niceDate(nd)}</h3><div class="small muted">${d.exercises.map((x) => esc(getExercise(x.exId)?.name)).join(' · ')}</div></div>`;
}

function sessionCard(en, ei, day, today, deload) {
  const e = getExercise(en.exId);
  const px = day.exercises.find((x) => x.id === en.pxId) || { exId: en.exId, sets: en.sets.length, repMin: 8, repMax: 12, rir: 2, restSec: 90 };
  const hist = historyFor(en.exId, today);
  const sug = suggest(px, hist, state.settings, { deload });
  const last = hist[0];
  const kindCls = { increase: 'up', reps: 'reps', hold: 'hold', reduce: 'down', deload: 'hold', new: 'new' }[sug.kind];
  const arrow = { increase: '▲', reps: '＋', hold: '■', reduce: '▼', deload: '↓', new: '★' }[sug.kind];
  const lastLine = last
    ? `<div class="last"><span class="muted">Last time · ${niceDate(last.date)}${last.deload ? ' (deload)' : ''}</span><b>${last.sets.filter((s) => s.r > 0).map((s) => `${clean(s.w || 0)}×${s.r}${s.rpe ? `@${s.rpe}` : ''}`).join('  ')}</b></div>`
    : '';
  return `
    <section class="card session-ex">
      <div class="ex-top">
        <div>
          <div class="ex-name">${esc(e?.name)}</div>
          <div class="small muted">${sug.sets} × ${px.repMin}–${px.repMax} reps · ${px.rir} RIR (RPE ${10 - px.rir}) · rest ${fmtRest(px.restSec)}</div>
        </div>
        <button class="icon" title="History" data-action="show-ex" data-ex="${en.exId}">↗</button>
      </div>
      ${lastLine}
      <div class="suggest ${kindCls}"><div class="sug-head"><span class="arrow">${arrow}</span>${esc(sug.headline)}</div><div class="sug-detail">${esc(sug.detail)}</div></div>
      <div class="sets">
        <div class="set-row head"><span>Set</span><span>${u()}</span><span>Reps</span><span>RPE</span><span></span></div>
        ${en.sets.map((s, si) => `
          <div class="set-row ${num(s.r) > 0 ? 'logged' : ''}">
            <span class="set-n">${si + 1}</span>
            <input type="number" inputmode="decimal" step="0.25" data-bind="set" data-ei="${ei}" data-si="${si}" data-field="w" value="${s.w}" placeholder="${sug.weight ?? '–'}">
            <input type="number" inputmode="numeric" data-bind="set" data-ei="${ei}" data-si="${si}" data-field="r" value="${s.r}" placeholder="${s.target}">
            <select data-bind="set" data-ei="${ei}" data-si="${si}" data-field="rpe">
              <option value="">–</option>${[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => `<option value="${v}" ${String(s.rpe) === String(v) ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <button class="icon check" data-action="set-done" data-ei="${ei}" data-si="${si}" data-rest="${px.restSec}" title="Mark set done">✓</button>
          </div>`).join('')}
      </div>
      <div class="set-tools">
        <button class="btn small ghost" data-action="set-add" data-ei="${ei}">+ Set</button>
        <button class="btn small ghost" data-action="set-del" data-ei="${ei}" ${en.sets.length <= 1 ? 'disabled' : ''}>− Set</button>
      </div>
    </section>`;
}

function logSummary(l) {
  return `<ul class="log-sum">${l.entries.map((en) => `<li><span>${esc(getExercise(en.exId)?.name || en.exId)}</span><b>${en.sets.map((s) => `${clean(s.w || 0)}×${s.r}`).join('  ')}</b></li>`).join('')}</ul>`;
}

function timerBar() {
  if (!ui.timer || ui.route !== 'today') return '';
  const left = Math.max(0, Math.ceil((ui.timer.end - Date.now()) / 1000));
  return `<div class="timer ${left === 0 ? 'over' : ''}"><span>Rest</span><b id="timer-left">${fmtRest(left)}</b>
    <button class="btn small ghost" data-action="timer-add">+30s</button><button class="btn small ghost" data-action="timer-stop">✕</button></div>`;
}

setInterval(() => {
  if (!ui.timer) return;
  const left = Math.max(0, Math.ceil((ui.timer.end - Date.now()) / 1000));
  const el = document.getElementById('timer-left');
  if (el) el.textContent = fmtRest(left);
  if (left === 0 && !ui.timer.buzzed) {
    ui.timer.buzzed = true;
    navigator.vibrate?.([200, 100, 200]);
    document.querySelector('.timer')?.classList.add('over');
  }
}, 500);

// ---------- plan tab ----------

function viewPlan() {
  return `<header class="page-head"><div><div class="eyebrow">Your program</div><h1>Plan</h1></div></header>
    <p class="small muted">Changes apply from your next session. Logged history is kept per exercise, so swapping and returning to an exercise keeps its record.</p>
    ${planEditor(state.plan)}
    <button class="btn ghost wide" data-action="redo-setup">Redo setup (new goal or new block)</button>`;
}

// ---------- progress ----------

function viewProgress() {
  const exIds = [...new Set(state.logs.flatMap((l) => l.entries.map((e) => e.exId)))];
  if (!ui.progressEx && exIds.length) ui.progressEx = exIds[0];
  const logs = [...state.logs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const weighIns = [...(state.weighIns || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const p = state.profile;

  return `<header class="page-head"><div><div class="eyebrow">Track</div><h1>Progress</h1></div></header>

    <h2>Body weight</h2>
    <div class="card">
      <div class="inline-form">
        <input id="weigh-in" type="number" inputmode="decimal" step="0.1" placeholder="Today's weight (${u()})">
        <button class="btn primary small" data-action="weigh-in">Log</button>
      </div>
      ${weighIns.length ? lineChart(weighIns.map((w) => ({ x: w.date, y: toDisplayW(w.kg) })), p?.targetWeightKg ? toDisplayW(p.targetWeightKg) : null, u()) : '<p class="small muted">Weigh in 2–3 mornings a week, after the bathroom and before food. The weekly average is what matters.</p>'}
      ${weighIns.length ? `<p class="small muted">Start ${fw(p.weightKg)} · latest ${fw(weighIns[weighIns.length - 1].kg)}${p.targetWeightKg ? ` · target ${fw(p.targetWeightKg)}` : ''}</p>` : ''}
    </div>

    <h2>Exercise progress</h2>
    <div class="card">
      ${exIds.length ? `
        <select data-bind="progress-ex">${exIds.map((id) => `<option value="${id}" ${ui.progressEx === id ? 'selected' : ''}>${esc(getExercise(id)?.name || id)}</option>`).join('')}</select>
        ${exerciseProgress(ui.progressEx)}` : '<p class="small muted">Log your first workout and your lifts will show up here.</p>'}
    </div>

    <h2>Sessions</h2>
    ${logs.length ? logs.map((l) => `
      <div class="card log">
        <button class="log-head" data-action="log-toggle" data-id="${l.id}">
          <span><b>${esc(l.dayName)}</b>${l.deload ? ' <em class="badge">deload</em>' : ''}</span><span class="muted small">${niceDate(l.date)}</span>
        </button>
        ${ui.openLog === l.id ? `${logSummary(l)}<div class="actions"><button class="btn small ghost danger" data-action="log-del" data-id="${l.id}">Delete</button><button class="btn small ghost" data-action="log-edit" data-id="${l.id}">Edit</button></div>` : ''}
      </div>`).join('') : '<div class="card small muted">No sessions yet.</div>'}`;
}

function exerciseProgress(exId) {
  const hist = historyFor(exId).reverse();
  if (!hist.length) return '';
  const pts = hist.map((h) => { const b = bestSet(h.sets); return { x: h.date, y: Math.round(e1rm(b.w, b.r) * 10) / 10 }; });
  const best = Math.max(...pts.map((p) => p.y));
  return `
    <p class="small muted">Estimated 1-rep max (Epley), from your best set each session. Best: <b>${best} ${u()}</b></p>
    ${lineChart(pts, null, u())}
    <ul class="log-sum">${[...hist].reverse().slice(0, 8).map((h) => `<li><span>${niceDate(h.date)}</span><b>${h.sets.map((s) => `${clean(s.w || 0)}×${s.r}`).join('  ')}</b></li>`).join('')}</ul>`;
}

function lineChart(pts, target, unit) {
  const W = 320, H = 140, P = 28;
  const ys = pts.map((p) => p.y).concat(target != null ? [target] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (i) => (pts.length === 1 ? W / 2 : P + (i * (W - P - 8)) / (pts.length - 1));
  const y = (v) => H - 18 - ((v - lo) / (hi - lo)) * (H - 30);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress chart">
    <line x1="${P}" x2="${W - 4}" y1="${y(hi - pad)}" y2="${y(hi - pad)}" class="grid"/><line x1="${P}" x2="${W - 4}" y1="${y(lo + pad)}" y2="${y(lo + pad)}" class="grid"/>
    <text x="2" y="${y(hi - pad) + 4}" class="axis">${Math.round(hi - pad)}</text><text x="2" y="${y(lo + pad) + 4}" class="axis">${Math.round(lo + pad)}</text>
    ${target != null ? `<line x1="${P}" x2="${W - 4}" y1="${y(target)}" y2="${y(target)}" class="target"/><text x="${W - 6}" y="${y(target) - 4}" text-anchor="end" class="axis">target</text>` : ''}
    <path d="${path}" class="line"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="3.5" class="dot"><title>${niceDate(p.x)}: ${clean(p.y)} ${unit}</title></circle>`).join('')}
    <text x="${P}" y="${H - 2}" class="axis">${niceDate(pts[0].x)}</text>
    ${pts.length > 1 ? `<text x="${W - 4}" y="${H - 2}" text-anchor="end" class="axis">${niceDate(pts[pts.length - 1].x)}</text>` : ''}
  </svg>`;
}

// ---------- settings ----------

function viewSettings() {
  const s = state.settings;
  return `<header class="page-head"><div><div class="eyebrow">App</div><h1>Settings</h1></div></header>
    <div class="card">
      ${field('Units', `<div class="seg">${['kg', 'lb'].map((x) => `<button type="button" class="${u() === x ? 'on' : ''}" data-action="units" data-val="${x}">${x}</button>`).join('')}</div>`, 'Switching converts all logged weights.')}
    </div>
    <h2>Smallest weight jumps</h2>
    <div class="card">
      <p class="small muted">Set these to what your gym actually has. Suggested increases are rounded to these steps.</p>
      ${Object.keys(EQUIPMENT).map((k) => `<label class="sched-row"><span>${EQUIPMENT[k]}${k === 'dumbbell' ? ' (per dumbbell)' : ''}</span><input type="number" inputmode="decimal" step="0.25" data-bind="inc" data-key="${k}" value="${s.increments[k]}"></label>`).join('')}
      <button class="btn small ghost" data-action="inc-reset">Reset to defaults</button>
    </div>
    <h2>AI coach (optional)</h2>
    <div class="card">
      <p class="small muted">Paste an Anthropic API key to ask Claude to adjust your plan in plain words. The key stays on this device and is only sent to api.anthropic.com. Each request costs a few cents.</p>
      <input type="password" data-bind="apikey" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off">
    </div>
    <h2>Your data</h2>
    <div class="card">
      <p class="small muted">Everything is stored only on this device. Export a backup now and then, especially before clearing your browser data.</p>
      <div class="actions"><button class="btn ghost" data-action="export">Export backup</button><label class="btn ghost">Import<input type="file" accept="application/json" id="import-file" hidden></label></div>
      ${state.plan?.finalized ? '<button class="btn ghost wide" data-action="redo-setup">Redo setup</button>' : ''}
      <button class="btn ghost wide danger" data-action="reset">Erase everything</button>
    </div>
    <p class="small muted center">The plan engine follows published guidelines (ACSM, Schoenfeld et al. on volume and frequency, Helms et al. on RPE and nutrition). It isn't medical advice. Check with a doctor if you have an injury or health condition.</p>`;
}

// ---------- actions ----------

function findPx(dayId, pxId) {
  const day = planCtx().days.find((d) => d.id === dayId);
  return { day, idx: day.exercises.findIndex((x) => x.id === pxId) };
}

const actions = {
  nav: ({ route }) => go(route),

  units: ({ val }) => {
    const ob = state.onboard;
    if (ob.p && val !== u()) {
      const f = val === 'lb' ? LB : 1 / LB;
      if (num(ob.p.weight)) ob.p.weight = clean(ob.p.weight * f);
      if (num(ob.p.targetWeight)) ob.p.targetWeight = clean(ob.p.targetWeight * f);
    }
    switchUnits(val);
    render();
  },

  'ob-pick': ({ key, val }) => { obDefaults()[key] = val; state.onboard.days = null; save(); render(); },
  'ob-days': ({ val }) => { state.onboard.days = Number(val); save(); render(); },
  'ob-wd': ({ val }) => {
    const ob = state.onboard; const v = Number(val);
    ob.weekdays = ob.weekdays.includes(v) ? ob.weekdays.filter((x) => x !== v) : [...ob.weekdays, v].sort();
    save(); render();
  },
  'ob-back': () => { state.onboard.step--; save(); render(); window.scrollTo(0, 0); },
  'ob-cancel': () => { state.onboard = { step: 0 }; save(); go('today'); },
  'ob-next': () => {
    const ob = state.onboard;
    const p = obDefaults();
    if (ob.step === 0 && (!num(p.age) || !num(p.heightCm) || !num(p.weight))) return alert('Please fill in age, height and weight.');
    if (ob.step === 3) {
      const prof = obProfile();
      ob.plan = generatePlan(prof, ob.days, [...ob.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)));
    }
    if (ob.step === 4) {
      state.profile = obProfile();
      state.plan = { ...ob.plan, finalized: true };
      state.onboard = { step: 0 };
      state.draft = null;
      save();
      return go('today');
    }
    ob.step++;
    save(); render(); window.scrollTo(0, 0);
  },

  'day-add': () => {
    const plan = planCtx();
    plan.days.push({ id: uid(), name: `Day ${plan.days.length + 1}`, exercises: [] });
    save(); render();
  },
  'day-del': ({ day }) => {
    const plan = planCtx();
    if (plan.days.length <= 1) return alert('A plan needs at least one workout.');
    if (!confirm('Delete this workout day?')) return;
    plan.days = plan.days.filter((d) => d.id !== day);
    for (const k of Object.keys(plan.schedule)) if (plan.schedule[k] === day) delete plan.schedule[k];
    save(); render();
  },
  'ex-up': ({ day, px }) => { const { day: d, idx } = findPx(day, px); if (idx > 0) [d.exercises[idx - 1], d.exercises[idx]] = [d.exercises[idx], d.exercises[idx - 1]]; save(); render(); },
  'ex-down': ({ day, px }) => { const { day: d, idx } = findPx(day, px); if (idx < d.exercises.length - 1) [d.exercises[idx + 1], d.exercises[idx]] = [d.exercises[idx], d.exercises[idx + 1]]; save(); render(); },
  'ex-del': ({ day, px }) => { const { day: d, idx } = findPx(day, px); d.exercises.splice(idx, 1); save(); render(); },
  'ex-swap': ({ day, px }) => { const { day: d, idx } = findPx(day, px); ui.picker = { dayId: day, pxId: px, muscle: getExercise(d.exercises[idx].exId)?.muscle || '' }; render(); },
  'ex-add': ({ day }) => { ui.picker = { dayId: day, pxId: null, muscle: '' }; render(); },
  'picker-close': () => { ui.picker = null; render(); },
  'picker-close-bg': (_, el, ev) => { if (ev.target === el) { ui.picker = null; render(); } },
  'picker-choose': ({ ex }) => {
    const { dayId, pxId } = ui.picker;
    const plan = planCtx();
    const profile = ui.route === 'onboarding' ? obProfile() : state.profile;
    const day = plan.days.find((d) => d.id === dayId);
    const e = getExercise(ex);
    if (pxId) {
      const idx = day.exercises.findIndex((x) => x.id === pxId);
      const role = e.type === 'isolation' ? 'isolation' : idx === 0 ? 'main' : 'compound';
      day.exercises[idx] = { ...day.exercises[idx], exId: ex, ...prescribe(ex, role, profile.goal, profile.experience) };
    } else {
      day.exercises.push(makePlanExercise(ex, e.type === 'isolation' ? 'isolation' : day.exercises.length ? 'compound' : 'main', profile));
    }
    ui.picker = null;
    save(); render();
  },

  'ai-open': () => { ui.ai = { open: true, loading: false, error: '', result: null, request: '' }; render(); },
  'ai-close': () => { ui.ai.open = false; render(); },
  'ai-discard': () => { ui.ai.result = null; render(); },
  'ai-run': async () => {
    const request = document.getElementById('ai-req')?.value.trim();
    if (!request) return;
    Object.assign(ui.ai, { request, loading: true, error: '', result: null });
    render();
    try {
      const profile = ui.route === 'onboarding' ? obProfile() : state.profile;
      ui.ai.result = await askClaude({ apiKey: state.settings.apiKey, profile, plan: planCtx(), request });
    } catch (err) {
      ui.ai.error = err?.message || String(err);
    }
    ui.ai.loading = false;
    render();
  },
  'ai-apply': () => {
    const plan = planCtx();
    const res = ui.ai.result;
    const old = Object.fromEntries(plan.days.map((d) => [d.id, d]));
    plan.days = res.days.map((d) => ({
      id: old[d.id] ? d.id : uid(),
      name: d.name,
      exercises: d.exercises.filter((x) => getExercise(x.exId)).map((x) => ({
        id: uid(), exId: x.exId,
        sets: Math.max(1, Math.min(10, x.sets)), repMin: Math.max(1, x.repMin), repMax: Math.max(x.repMin, x.repMax),
        rir: Math.max(0, Math.min(5, x.rir)), restSec: Math.max(0, x.restSec),
      })),
    }));
    const ids = new Set(plan.days.map((d) => d.id));
    for (const k of Object.keys(plan.schedule)) if (!ids.has(plan.schedule[k])) delete plan.schedule[k];
    ui.ai = { open: false, loading: false, error: '', result: null, request: '' };
    save(); render();
  },

  'start-today': () => { state.plan.startDate = todayStr(); save(); render(); },
  'train-day': ({ day }) => { ui.overrideDayId = day; state.draft = null; save(); render(); },
  'back-to-schedule': () => { ui.overrideDayId = null; state.draft = null; save(); render(); },
  'set-done': ({ ei, si, rest }) => {
    const s = state.draft.entries[ei].sets[si];
    if (!(num(s.r) > 0)) s.r = s.target;
    if (s.w === '' || s.w == null) {
      const prev = state.draft.entries[ei].sets[si - 1];
      if (prev && prev.w !== '') s.w = prev.w;
    }
    save();
    const restSec = Number(rest) || 90;
    ui.timer = { end: Date.now() + restSec * 1000, total: restSec };
    render();
  },
  'set-add': ({ ei }) => {
    const sets = state.draft.entries[ei].sets;
    const last = sets[sets.length - 1];
    sets.push({ w: last?.w ?? '', r: '', rpe: '', target: last?.target ?? 8 });
    save(); render();
  },
  'set-del': ({ ei }) => { const sets = state.draft.entries[ei].sets; if (sets.length > 1) sets.pop(); save(); render(); },
  'session-reset': () => {
    if (!confirm('Clear what you have entered for this session?')) return;
    state.draft = null; save(); render();
  },
  'session-finish': () => {
    const { plan, deload } = sessionContext();
    const draft = state.draft;
    const entries = draft.entries.map((en) => ({
      exId: en.exId,
      pxId: en.pxId,
      sets: en.sets.filter((s) => num(s.r) > 0).map((s) => ({ w: num(s.w) || 0, r: num(s.r), rpe: num(s.rpe) })),
    })).filter((en) => en.sets.length);
    if (!entries.length) return alert('Log at least one set first.');
    const skipped = draft.entries.length - entries.length;
    if (skipped && !confirm(`${skipped} exercise(s) have no sets logged. Finish anyway?`)) return;
    const day = plan.days.find((d) => d.id === draft.dayId);
    const log = { id: draft.logId || uid(), date: draft.date, dayId: draft.dayId, dayName: day?.name || 'Workout', deload, entries };
    state.logs = state.logs.filter((l) => l.id !== log.id).concat(log);
    state.draft = null;
    ui.overrideDayId = null;
    ui.timer = null;
    save(); render(); window.scrollTo(0, 0);
  },
  'log-edit': ({ id }) => {
    const l = state.logs.find((x) => x.id === id);
    state.draft = {
      date: l.date, dayId: l.dayId, logId: l.id,
      entries: l.entries.map((en) => ({ ...en, sets: en.sets.map((s) => ({ w: s.w, r: s.r, rpe: s.rpe ?? '', target: s.r })) })),
    };
    if (l.date !== todayStr()) {
      // Editing a past session: reuse the today screen but keep the original date.
      state.draft.date = todayStr();
      state.draft.originalDate = l.date;
    }
    ui.overrideDayId = l.dayId;
    save(); go('today');
  },
  'log-toggle': ({ id }) => { ui.openLog = ui.openLog === id ? null : id; render(); },
  'log-del': ({ id }) => { if (!confirm('Delete this session?')) return; state.logs = state.logs.filter((l) => l.id !== id); save(); render(); },
  'show-ex': ({ ex }) => { ui.progressEx = ex; go('progress'); },
  'timer-add': () => { if (ui.timer) { ui.timer.end += 30000; ui.timer.buzzed = false; } render(); },
  'timer-stop': () => { ui.timer = null; render(); },
  'weigh-in': () => {
    const v = num(document.getElementById('weigh-in').value);
    if (!v) return;
    state.weighIns = (state.weighIns || []).filter((w) => w.date !== todayStr()).concat({ date: todayStr(), kg: fromDisplayW(v) });
    save(); render();
  },

  'inc-reset': () => { state.settings.increments = { ...DEFAULT_INCREMENTS[u()] }; save(); render(); },
  export: () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `overload-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  reset: () => {
    if (!confirm('Erase your profile, plan and all workout history from this device?')) return;
    if (!confirm('This cannot be undone. Have you exported a backup?')) return;
    resetAll(); ui.route = 'onboarding'; render();
  },
  'redo-setup': () => {
    state.onboard = { step: 0 };
    save(); go('onboarding');
  },
};

// Fix up edits of past sessions: the finished log goes back to its original date.
const finish = actions['session-finish'];
actions['session-finish'] = () => {
  const orig = state.draft?.originalDate;
  if (orig) state.draft.date = orig;
  finish();
  if (orig && state.draft) { state.draft.date = todayStr(); }
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el.dataset, el, ev);
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  const b = el.dataset?.bind;
  if (!b) return;
  if (b === 'ob') { obDefaults()[el.dataset.key] = el.value; save(); }
  if (b === 'set') {
    const s = state.draft.entries[el.dataset.ei].sets[el.dataset.si];
    s[el.dataset.field] = el.value;
    save();
    el.closest('.set-row')?.classList.toggle('logged', num(s.r) > 0);
    const done = state.draft.entries.reduce((a, en) => a + en.sets.filter((x) => num(x.r) > 0).length, 0);
    const total = state.draft.entries.reduce((a, en) => a + en.sets.length, 0);
    const pc = document.getElementById('progress-count');
    if (pc) pc.textContent = `${done}/${total}`;
  }
  if (b === 'dayname') { planCtx().days.find((d) => d.id === el.dataset.day).name = el.value; save(); }
  if (b === 'apikey') { state.settings.apiKey = el.value.trim(); save(); }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'import-file') return importFile(el.files[0]);
  const b = el.dataset?.bind;
  if (!b) return;
  if (b === 'ob' && el.tagName === 'SELECT') { state.onboard.days = null; render(); }
  if (b === 'px') {
    const { day, idx } = findPx(el.dataset.day, el.dataset.px);
    const x = day.exercises[idx];
    const v = num(el.value);
    if (v == null) return render();
    x[el.dataset.field] = v;
    if (x.repMax < x.repMin) x.repMax = x.repMin;
    save(); render();
  }
  if (b === 'sched') {
    const plan = planCtx();
    if (el.value) plan.schedule[el.dataset.wd] = el.value; else delete plan.schedule[el.dataset.wd];
    state.draft = null;
    save(); render();
  }
  if (b === 'dayname') render();
  if (b === 'picker-muscle') { ui.picker.muscle = el.value; render(); }
  if (b === 'progress-ex') { ui.progressEx = el.value; render(); }
  if (b === 'inc') { const v = num(el.value); if (v > 0) state.settings.increments[el.dataset.key] = v; save(); }
});

async function importFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.settings || !Array.isArray(data.logs)) throw new Error('Not an Overload backup file.');
    if (!confirm(`Replace current data with this backup (${data.logs.length} sessions)?`)) return;
    replaceState(data);
    location.reload();
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
}

window.addEventListener('hashchange', () => {
  const r = location.hash.slice(1);
  if (r && r !== ui.route) { ui.route = r; render(); }
});

ui.route = location.hash.slice(1) || 'today';
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
