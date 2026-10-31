// Progressive overload engine: double progression with effort (RPE) checks.
//
// 1. Work inside a rep range (e.g. 8–12) at a fixed weight.
// 2. Add reps session to session until every set reaches the top of the range.
// 3. Then add load (≈2.5 % upper-body compounds, ≈5 % lower-body and isolation,
//    never less than the smallest plate/dumbbell jump) and restart at the
//    bottom of the range.
// 4. If the sets felt easy (RPE ≤ 7) the jump is doubled; if they were taken
//    to failure (RPE 10) the weight is repeated first.
// 5. Two sessions in a row below the range → drop ~10 % and rebuild.
// 6. Deload weeks: ~half the sets at ~90 % of the load.
//
// RPE: 10 = no reps left, 9 = 1 left, 8 = 2 left, 7 = 3 left.

import { getExercise } from './exercises.js';

const roundTo = (x, step) => Math.round(x / step) * step;
const clean = (x) => Math.round(x * 100) / 100;

export function e1rm(w, r) {
  // Epley estimate, only meaningful up to ~12 reps.
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

export function bestSet(sets) {
  return sets.reduce((best, s) => (e1rm(s.w, s.r) > e1rm(best.w, best.r) ? s : best), { w: 0, r: 0 });
}

function topWeightSets(sets) {
  const work = sets.filter((s) => s.r > 0);
  if (!work.length) return { w: 0, sets: [] };
  const w = Math.max(...work.map((s) => s.w || 0));
  return { w, sets: work.filter((s) => (s.w || 0) === w) };
}

export function incrementFor(exId, settings) {
  const e = getExercise(exId);
  return settings.increments[e?.equip || 'machine'] || 2.5;
}

/**
 * @param px   plan exercise {exId, sets, repMin, repMax, rir}
 * @param hist history entries for this exercise, newest first
 * @returns {kind, weight, sets, reps: number[], headline, detail}
 */
export function suggest(px, hist, settings, { deload = false } = {}) {
  const e = getExercise(px.exId);
  const unit = settings.units;
  const inc = incrementFor(px.exId, settings);
  const ref = hist.filter((h) => !h.deload);
  const last = ref[0] || hist[0];
  const range = `${px.repMin}–${px.repMax}`;
  const fill = (n, r) => Array.from({ length: n }, () => r);
  const isBW = e?.equip === 'bodyweight';

  if (!last) {
    return {
      kind: 'new',
      weight: null,
      sets: deload ? Math.max(1, Math.ceil(px.sets / 2)) : px.sets,
      reps: fill(px.sets, px.repMax),
      headline: 'First time: find your working weight',
      detail: `Do 1–2 lighter warm-up sets, then pick a weight you can lift for ${range} reps with about ${px.rir} reps left in the tank (RPE ${10 - px.rir}). Log it honestly; next time the app will tell you exactly what to lift.`,
    };
  }

  const { w, sets: top } = topWeightSets(last.sets);
  const reps = top.map((s) => s.r);
  const rpes = top.map((s) => s.rpe).filter(Boolean);
  const maxRpe = rpes.length ? Math.max(...rpes) : null;
  const fmt = (x) => (isBW && !x ? 'bodyweight' : `${clean(x)} ${unit}`);

  if (deload) {
    const dw = isBW && !w ? 0 : Math.max(0, roundTo(w * 0.9, inc));
    const n = Math.max(1, Math.ceil(px.sets / 2));
    return {
      kind: 'deload',
      weight: dw,
      sets: n,
      reps: fill(n, px.repMin),
      headline: `Deload: ${n} × ${px.repMin} at ${fmt(dw)}`,
      detail: 'Planned recovery week. About half the sets at ~90 % of your load, stopping 3–4 reps short of failure. This clears fatigue so you can set new bests next week.',
    };
  }

  const hitAll = top.length >= px.sets && reps.every((r) => r >= px.repMax);
  const belowMin = reps.filter((r) => r < px.repMin).length;

  if (hitAll) {
    if (maxRpe >= 10) {
      return {
        kind: 'hold',
        weight: w,
        sets: px.sets,
        reps: fill(px.sets, px.repMax),
        headline: `Repeat ${fmt(w)}, then add weight`,
        detail: `You hit ${px.repMax} reps on every set but went to failure (RPE 10). Repeat this weight at RPE 9 or lower before adding load, so the strength is real rather than grinding.`,
      };
    }
    if (isBW && !w) {
      return {
        kind: 'increase',
        weight: inc,
        sets: px.sets,
        reps: fill(px.sets, px.repMin),
        headline: `Add ${fmt(inc)} (belt or dumbbell)`,
        detail: `You hit ${px.repMax}+ reps on every set. Add external load (or slow the lowering to 3 s) and work back up from ${px.repMin} reps.`,
      };
    }
    const lowerOrIso = e?.lower || e?.type === 'isolation';
    let pct = lowerOrIso ? 0.05 : 0.025;
    const easy = maxRpe !== null && maxRpe <= 7;
    if (easy) pct *= 2;
    const step = Math.max(easy ? inc * 2 : inc, roundTo(w * pct, inc));
    const nw = clean(w + step);
    const jumpPct = w ? (step / w) * 100 : 0;
    return {
      kind: 'increase',
      weight: nw,
      sets: px.sets,
      reps: fill(px.sets, px.repMin),
      headline: `Increase to ${fmt(nw)} (+${clean(step)} ${unit})`,
      detail: `Last time you hit ${reps.join(' / ')} reps at ${fmt(w)}, the top of your ${range} range on every set${easy ? ', and it felt easy (RPE ≤ 7), so the jump is bigger' : ''}. Add load and aim for at least ${px.repMin} reps per set, then build back up.${jumpPct > 10 ? ` This is a ${Math.round(jumpPct)} % jump. If you can't get ${px.repMin} reps, stay at ${fmt(w)} and add a rep per set instead.` : ''}`,
    };
  }

  if (belowMin > top.length / 2) {
    const prev = ref[1];
    const prevTop = prev ? topWeightSets(prev.sets) : null;
    const prevAlsoLow = prevTop && prevTop.w === w && prevTop.sets.filter((s) => s.r < px.repMin).length > prevTop.sets.length / 2;
    if (prevAlsoLow && !(isBW && !w)) {
      const nw = Math.max(0, roundTo(w * 0.9, inc));
      return {
        kind: 'reduce',
        weight: nw,
        sets: px.sets,
        reps: fill(px.sets, px.repMax),
        headline: `Drop to ${fmt(nw)} and rebuild`,
        detail: `Two sessions in a row under ${px.repMin} reps at ${fmt(w)}. Drop about 10 % and work up through the ${range} range again. A small step back now usually leads to new bests within 2–3 weeks. Also check your sleep, protein and calories.`,
      };
    }
    return {
      kind: 'hold',
      weight: w,
      sets: px.sets,
      reps: fill(px.sets, px.repMin),
      headline: `Stay at ${fmt(w)}: reach ${px.repMin} reps`,
      detail: `Last time: ${reps.join(' / ')} reps, mostly below the ${range} range. Keep the weight and aim for ${px.repMin}+ reps on every set. If you're still under range next time, the app will suggest dropping ~10 %.`,
    };
  }

  // In range: add reps (double progression).
  const target = Array.from({ length: px.sets }, (_, i) => Math.min(px.repMax, Math.max(px.repMin, (reps[i] ?? reps[reps.length - 1]) + 1)));
  let stallNote = '';
  if (ref.length >= 3) {
    const vol = (h) => { const t = topWeightSets(h.sets); return t.w * 1000 + t.sets.reduce((a, s) => a + s.r, 0); };
    if (vol(ref[0]) <= vol(ref[2]) && topWeightSets(ref[2].sets).w === w) {
      stallNote = ' No progress over 3 sessions. Push the last set closer to failure (RPE 9), or swap to a similar variation for the next block.';
    }
  }
  return {
    kind: 'reps',
    weight: w,
    sets: px.sets,
    reps: target,
    headline: `Keep ${fmt(w)}: beat your reps`,
    detail: `Last time: ${reps.join(' / ')} reps. Aim for ${target.join(' / ')} (+1 rep per set). Once every set reaches ${px.repMax} reps, the app will tell you to add weight.${maxRpe !== null && maxRpe <= 6 ? ' Your RPE was low, so push closer to your target effort.' : ''}${stallNote}`,
  };
}
