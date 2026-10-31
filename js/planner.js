// Plan engine: body metrics, goal feasibility, training-frequency recommendation
// and plan generation. Numbers come from widely used guidelines:
//  - BMR: Mifflin-St Jeor (1990).
//  - Protein: 1.6–2.2 g/kg (Morton 2018), up to 2.3–3.1 g/kg of lean mass in a
//    deficit (Helms 2014).
//  - Fat-loss rate: 0.5–1.0 % of body weight per week preserves lean mass
//    (Garthe 2011, Helms 2014).
//  - Muscle-gain rate by training age (Aragon/McDonald models): ~1–1.5 %,
//    0.5–1 % and 0.25–0.5 % of body weight per month.
//  - Weekly hard sets per muscle: ~10–20 (Schoenfeld 2017, Baz-Valle 2022),
//    trained at least twice a week (Schoenfeld 2016).
//  - Effort: 0–3 reps in reserve on working sets (Refalo 2023).

import { getExercise, MUSCLES } from './exercises.js';
import { uid } from './store.js';

export const GOALS = {
  fat_loss: { label: 'Lose fat', blurb: 'Drop body fat while keeping muscle' },
  muscle: { label: 'Build muscle', blurb: 'Gain size with a small surplus' },
  recomp: { label: 'Recomposition', blurb: 'Lose fat and gain muscle slowly' },
  strength: { label: 'Get stronger', blurb: 'Lift heavier on the main lifts' },
  fitness: { label: 'General fitness', blurb: 'Feel fit, healthy and capable' },
};

export const EXPERIENCE = {
  beginner: { label: 'Beginner', blurb: 'Under 1 year of consistent lifting' },
  intermediate: { label: 'Intermediate', blurb: '1–3 years of consistent lifting' },
  advanced: { label: 'Advanced', blurb: '3+ years, progress is slow' },
};

export const ACTIVITY = {
  sedentary: { label: 'Mostly sitting', factor: 1.2 },
  light: { label: 'Lightly active (6–8k steps)', factor: 1.375 },
  moderate: { label: 'Active (8–12k steps)', factor: 1.55 },
  high: { label: 'Very active / physical job', factor: 1.725 },
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- Body metrics & goal feasibility ----------

export function bodyAnalysis(p, fw = (kg) => `${kg.toFixed(1)} kg`) {
  const kg = p.weightKg;
  const bmi = kg / (p.heightCm / 100) ** 2;
  const bmr = 10 * kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5);
  // Lifestyle factor plus a small bump for the lifting itself.
  const tdee = bmr * ACTIVITY[p.activity].factor + p.daysAvailable * 250 / 7;
  const leanKg = p.bodyFat ? kg * (1 - p.bodyFat / 100) : null;

  const out = { bmi, bmr, tdee, leanKg, warnings: [], notes: [] };
  const weeks = Math.max(1, p.weeks);
  const delta = p.targetWeightKg ? p.targetWeightKg - kg : 0;
  const weeklyPct = (delta / kg / weeks) * 100;

  let kcal = tdee;
  let proteinPerKg = 1.8;

  if (p.goal === 'fat_loss' || (p.goal === 'recomp' && delta < 0)) {
    const pct = Math.abs(weeklyPct) || 0.7;
    // 7700 kcal ≈ 1 kg of body fat; cap the deficit at 25 % of TDEE.
    const deficit = Math.min((pct / 100) * kg * 7700 / 7, tdee * 0.25);
    kcal = tdee - (p.goal === 'recomp' ? Math.min(deficit, tdee * 0.1) : deficit);
    proteinPerKg = 2.2;
    out.rateText = `${Math.abs(weeklyPct || pct).toFixed(2)} % of body weight per week`;
    if (Math.abs(weeklyPct) > 1) {
      const safeWeeks = Math.ceil(Math.abs(delta) / (kg * 0.0075));
      out.warnings.push(`Losing ${fw(Math.abs(delta))} in ${weeks} weeks means ${Math.abs(weeklyPct).toFixed(1)} %/week. Above ~1 %/week you start losing muscle. A safer timeline is about ${safeWeeks} weeks.`);
    }
  } else if (p.goal === 'muscle' || p.goal === 'strength') {
    const monthly = { beginner: 1.25, intermediate: 0.75, advanced: 0.4 }[p.experience];
    const realisticKg = (kg * monthly / 100) * (weeks / 4.33);
    kcal = tdee + (p.goal === 'muscle' ? (p.experience === 'beginner' ? 350 : 250) : 150);
    proteinPerKg = 1.8;
    out.rateText = `about ${fw(kg * monthly / 100)} per month is realistic for your training age`;
    if (delta > 0 && delta > realisticKg * 1.3) {
      out.warnings.push(`Gaining ${fw(delta)} in ${weeks} weeks is faster than muscle can be built at your level (~${fw(realisticKg)}). The extra would mostly be fat. Consider ${Math.ceil(delta / (kg * monthly / 100) * 4.33)} weeks.`);
    }
  } else if (p.goal === 'recomp') {
    kcal = tdee - 150;
    proteinPerKg = 2.2;
    out.rateText = 'body weight stays roughly stable while composition changes';
  } else {
    out.rateText = 'eat around maintenance';
  }

  out.kcal = Math.round(kcal / 10) * 10;
  out.proteinG = Math.round(kg * proteinPerKg);
  out.proteinPerKg = proteinPerKg;
  out.fatG = Math.round((out.kcal * 0.27) / 9);
  out.carbG = Math.max(0, Math.round((out.kcal - out.proteinG * 4 - out.fatG * 9) / 4));

  if (p.goal === 'fat_loss') {
    out.notes.push('Aim for 8–10k steps per day and 2–3 × 20–30 min of easy cardio (Zone 2). Lifting heavy is what tells your body to keep muscle while you diet.');
  }
  if (p.goal === 'recomp') {
    out.notes.push('Recomposition works best for beginners and people returning to training. Track waist size and strength, not just scale weight.');
  }
  out.notes.push('Sleep 7–9 hours. Recovery is when the adaptation actually happens.');
  return out;
}

// ---------- Training frequency ----------

export const SPLITS = {
  2: { name: 'Full Body ×2', why: 'Hits every muscle twice a week, the minimum frequency for good results.' },
  3: { name: 'Full Body ×3', why: 'Each muscle trained 3× a week with moderate volume per session. Ideal for learning the lifts and fast beginner progress.' },
  4: { name: 'Upper / Lower', why: 'Each muscle trained 2× a week with more volume per session. The best balance of results and recovery for most people.' },
  5: { name: 'Upper / Lower + Push / Pull / Legs', why: 'Higher weekly volume with each muscle hit about 2× a week. Suits intermediates chasing size.' },
  6: { name: 'Push / Pull / Legs ×2', why: 'Maximum volume, 2× frequency. Only worth it if you recover well and have the time.' },
};

export function recommendDays(p) {
  let ideal = { beginner: 3, intermediate: 4, advanced: 5 }[p.experience];
  if (p.goal === 'strength' && ideal > 4) ideal = 4;
  if (p.goal === 'fitness' || p.goal === 'fat_loss') ideal = Math.min(ideal, 4);
  if (p.sessionMinutes <= 45 && ideal < 6) ideal += 1; // short sessions → spread volume
  const days = Math.max(2, Math.min(ideal, p.daysAvailable, 6));
  const reasons = [];
  reasons.push(`As a${p.experience === 'intermediate' || p.experience === 'advanced' ? 'n' : ''} ${EXPERIENCE[p.experience].label.toLowerCase()}, ${ideal} days a week gives enough weekly volume (10–20 sets per muscle) while leaving time to recover.`);
  if (days < ideal) reasons.push(`You said you can train at most ${p.daysAvailable} days, so the plan packs the volume into ${days} sessions.`);
  if (p.sessionMinutes <= 45) reasons.push('Your sessions are short, so the volume is spread over more days.');
  reasons.push(SPLITS[days].why);
  return { days, reasons };
}

export const DEFAULT_WEEKDAYS = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

// ---------- Templates ----------

const T = {
  fbA: ['Full Body A', ['back_squat', 'bb_bench', 'lat_pulldown', 'lying_leg_curl', 'lateral_raise', 'cable_crunch']],
  fbB: ['Full Body B', ['romanian_deadlift', 'ohp', 'seated_cable_row', 'bulgarian_split_squat', 'db_curl', 'triceps_pushdown']],
  fbC: ['Full Body C', ['leg_press', 'incline_db_press', 'chest_supported_row', 'hip_thrust', 'face_pull', 'standing_calf_raise']],
  fb2A: ['Full Body A', ['back_squat', 'bb_bench', 'seated_cable_row', 'lying_leg_curl', 'lateral_raise', 'triceps_pushdown']],
  fb2B: ['Full Body B', ['romanian_deadlift', 'ohp', 'lat_pulldown', 'leg_press', 'db_curl', 'standing_calf_raise']],
  upA: ['Upper A', ['bb_bench', 'bb_row', 'db_shoulder_press', 'lat_pulldown', 'lateral_raise', 'incline_db_curl', 'triceps_pushdown']],
  loA: ['Lower A', ['back_squat', 'romanian_deadlift', 'leg_extension', 'lying_leg_curl', 'standing_calf_raise', 'cable_crunch']],
  upB: ['Upper B', ['incline_db_press', 'pullup', 'chest_supported_row', 'cable_fly', 'cable_lateral_raise', 'hammer_curl', 'overhead_cable_ext']],
  loB: ['Lower B', ['deadlift', 'bulgarian_split_squat', 'leg_press', 'seated_leg_curl', 'seated_calf_raise', 'hanging_leg_raise']],
  push: ['Push', ['incline_bb_bench', 'db_shoulder_press', 'machine_chest_press', 'cable_lateral_raise', 'overhead_cable_ext', 'triceps_pushdown']],
  pull: ['Pull', ['pullup', 'bb_row', 'seated_cable_row', 'face_pull', 'bb_curl', 'hammer_curl']],
  legs: ['Legs', ['hack_squat', 'hip_thrust', 'walking_lunge', 'leg_extension', 'seated_leg_curl', 'seated_calf_raise']],
  pushA: ['Push A', ['bb_bench', 'ohp', 'incline_db_press', 'lateral_raise', 'triceps_pushdown', 'cable_fly']],
  pullA: ['Pull A', ['deadlift', 'lat_pulldown', 'seated_cable_row', 'face_pull', 'bb_curl']],
  legsA: ['Legs A', ['back_squat', 'romanian_deadlift', 'leg_extension', 'lying_leg_curl', 'standing_calf_raise', 'cable_crunch']],
  pushB: ['Push B', ['incline_bb_bench', 'db_shoulder_press', 'dips', 'cable_lateral_raise', 'overhead_cable_ext', 'pec_deck']],
  pullB: ['Pull B', ['pullup', 'chest_supported_row', 'straight_arm_pulldown', 'rear_delt_fly', 'incline_db_curl', 'hammer_curl']],
  legsB: ['Legs B', ['hack_squat', 'hip_thrust', 'bulgarian_split_squat', 'seated_leg_curl', 'seated_calf_raise', 'hanging_leg_raise']],
};

const SPLIT_DAYS = {
  2: ['fb2A', 'fb2B'],
  3: ['fbA', 'fbB', 'fbC'],
  4: ['upA', 'loA', 'upB', 'loB'],
  5: ['upA', 'loA', 'push', 'pull', 'legs'],
  6: ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'],
};

// ---------- Prescription ----------

// role: 'main' = first compound of the day, 'compound', 'isolation'
export function prescribe(exId, role, goal, experience) {
  const e = getExercise(exId);
  const iso = role === 'isolation' || e?.type === 'isolation';
  let rx;
  if (goal === 'strength') {
    rx = role === 'main'
      ? { sets: 4, repMin: 3, repMax: 5, rir: 2, restSec: 180 }
      : iso ? { sets: 3, repMin: 8, repMax: 12, rir: 2, restSec: 90 }
        : { sets: 3, repMin: 5, repMax: 8, rir: 2, restSec: 150 };
  } else if (goal === 'fitness') {
    rx = iso ? { sets: 2, repMin: 10, repMax: 15, rir: 2, restSec: 60 }
      : { sets: 3, repMin: 8, repMax: 12, rir: 2, restSec: 90 };
  } else {
    // Hypertrophy-oriented (muscle, recomp, fat loss: heavy lifting preserves muscle in a deficit)
    rx = role === 'main'
      ? { sets: 3, repMin: 6, repMax: 10, rir: 2, restSec: 150 }
      : iso ? { sets: 3, repMin: 10, repMax: 15, rir: 1, restSec: 75 }
        : { sets: 3, repMin: 8, repMax: 12, rir: 2, restSec: 120 };
  }
  if (experience === 'beginner') {
    rx.rir = Math.max(rx.rir, 2); // learn technique away from failure
    if (iso) rx.sets = Math.min(rx.sets, 2);
  }
  if (experience === 'advanced' && role === 'main') rx.sets += 1;
  if (e?.equip === 'bodyweight' && e.type === 'compound' && goal !== 'strength') {
    rx.repMin = Math.max(rx.repMin, 6);
  }
  return rx;
}

export function makePlanExercise(exId, role, profile) {
  return { id: uid(), exId, ...prescribe(exId, role, profile.goal, profile.experience) };
}

// Rough session length: ~40 s per working set + rest, ~1 min to set up each
// exercise, plus an 8 minute warm-up.
export function estimateMinutes(day) {
  let sec = 8 * 60;
  for (const x of day.exercises) sec += 60 + x.sets * (40 + x.restSec);
  return Math.round(sec / 60);
}

function fitToTime(day, minutes) {
  // First trim isolation sets to 2, then drop trailing isolation exercises.
  for (const x of day.exercises) {
    if (estimateMinutes(day) <= minutes) return;
    if (getExercise(x.exId)?.type === 'isolation' && x.sets > 2) x.sets = 2;
  }
  while (estimateMinutes(day) > minutes && day.exercises.length > 4) {
    const idx = [...day.exercises].reverse().findIndex((x) => getExercise(x.exId)?.type === 'isolation');
    if (idx === -1) break;
    day.exercises.splice(day.exercises.length - 1 - idx, 1);
  }
}

export function generatePlan(profile, days, weekdays) {
  const planDays = SPLIT_DAYS[days].map((key) => {
    const [name, ids] = T[key];
    let mainAssigned = false;
    const exercises = ids.map((exId) => {
      const e = getExercise(exId);
      let role = e.type === 'isolation' ? 'isolation' : 'compound';
      if (role === 'compound' && !mainAssigned) { role = 'main'; mainAssigned = true; }
      return makePlanExercise(exId, role, profile);
    });
    const day = { id: uid(), name, exercises };
    fitToTime(day, profile.sessionMinutes);
    return day;
  });
  const schedule = {};
  weekdays.forEach((wd, i) => { schedule[wd] = planDays[i % planDays.length].id; });
  return {
    split: SPLITS[days].name,
    days: planDays,
    schedule, // weekday (0–6) → day id
    startDate: profile.startDate,
    weeks: profile.weeks,
    deloadEvery: { beginner: 8, intermediate: 5, advanced: 4 }[profile.experience],
    finalized: false,
  };
}

// ---------- Weekly volume ----------

export function weeklyVolume(plan) {
  const vol = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 0]));
  for (const dayId of Object.values(plan.schedule)) {
    const day = plan.days.find((d) => d.id === dayId);
    if (!day) continue;
    for (const x of day.exercises) {
      const e = getExercise(x.exId);
      if (!e) continue;
      vol[e.muscle] += x.sets;
      for (const s of e.secondary) vol[s] += x.sets * 0.5;
    }
  }
  return vol;
}

export function volumeStatus(muscle, sets) {
  // Small muscles get plenty of indirect work, so their floor is lower.
  const low = ['front_delts', 'abs', 'calves', 'rear_delts', 'biceps', 'triceps'].includes(muscle) ? 4 : 8;
  if (sets < low) return 'low';
  if (sets > 22) return 'high';
  return 'ok';
}

// ---------- Calendar helpers ----------

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

export function weekNumber(plan, dateStr) {
  const diff = Math.floor((parseDate(dateStr) - parseDate(plan.startDate)) / 86400000);
  return Math.floor(diff / 7) + 1;
}

export function isDeloadWeek(plan, dateStr) {
  const w = weekNumber(plan, dateStr);
  return plan.deloadEvery > 0 && w > 0 && w % plan.deloadEvery === 0;
}

export function dayForDate(plan, dateStr) {
  const id = plan.schedule[parseDate(dateStr).getDay()];
  return plan.days.find((d) => d.id === id) || null;
}

export function nextTrainingDate(plan, fromStr) {
  for (let i = 1; i <= 7; i++) {
    const s = addDays(fromStr, i);
    if (dayForDate(plan, s)) return s;
  }
  return null;
}
