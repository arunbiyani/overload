// Exercise library. `equip` decides the load increment, `type` decides rep ranges
// and how aggressively load is progressed, `lower` marks lower-body lifts
// (which tolerate bigger jumps).

export const MUSCLES = {
  chest: 'Chest',
  back: 'Back',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
};

export const EQUIPMENT = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
};

const ex = (id, name, muscle, secondary, equip, type, lower = false) => ({
  id, name, muscle, secondary, equip, type, lower,
});

export const EXERCISES = [
  // Chest
  ex('bb_bench', 'Barbell Bench Press', 'chest', ['triceps', 'front_delts'], 'barbell', 'compound'),
  ex('incline_bb_bench', 'Incline Barbell Bench Press', 'chest', ['front_delts', 'triceps'], 'barbell', 'compound'),
  ex('db_bench', 'Dumbbell Bench Press', 'chest', ['triceps', 'front_delts'], 'dumbbell', 'compound'),
  ex('incline_db_press', 'Incline Dumbbell Press', 'chest', ['front_delts', 'triceps'], 'dumbbell', 'compound'),
  ex('machine_chest_press', 'Machine Chest Press', 'chest', ['triceps', 'front_delts'], 'machine', 'compound'),
  ex('dips', 'Dips', 'chest', ['triceps', 'front_delts'], 'bodyweight', 'compound'),
  ex('pushup', 'Push-up', 'chest', ['triceps', 'front_delts'], 'bodyweight', 'compound'),
  ex('cable_fly', 'Cable Fly', 'chest', [], 'cable', 'isolation'),
  ex('pec_deck', 'Pec Deck', 'chest', [], 'machine', 'isolation'),

  // Back
  ex('pullup', 'Pull-up', 'back', ['biceps', 'rear_delts'], 'bodyweight', 'compound'),
  ex('lat_pulldown', 'Lat Pulldown', 'back', ['biceps'], 'cable', 'compound'),
  ex('close_grip_pulldown', 'Close-grip Pulldown', 'back', ['biceps'], 'cable', 'compound'),
  ex('bb_row', 'Barbell Row', 'back', ['biceps', 'rear_delts'], 'barbell', 'compound'),
  ex('db_row', 'One-arm Dumbbell Row', 'back', ['biceps', 'rear_delts'], 'dumbbell', 'compound'),
  ex('seated_cable_row', 'Seated Cable Row', 'back', ['biceps', 'rear_delts'], 'cable', 'compound'),
  ex('chest_supported_row', 'Chest-supported Machine Row', 'back', ['biceps', 'rear_delts'], 'machine', 'compound'),
  ex('tbar_row', 'T-bar Row', 'back', ['biceps', 'rear_delts'], 'barbell', 'compound'),
  ex('straight_arm_pulldown', 'Straight-arm Pulldown', 'back', [], 'cable', 'isolation'),

  // Shoulders
  ex('ohp', 'Overhead Press', 'front_delts', ['triceps', 'side_delts'], 'barbell', 'compound'),
  ex('db_shoulder_press', 'Seated Dumbbell Shoulder Press', 'front_delts', ['triceps', 'side_delts'], 'dumbbell', 'compound'),
  ex('machine_shoulder_press', 'Machine Shoulder Press', 'front_delts', ['triceps', 'side_delts'], 'machine', 'compound'),
  ex('lateral_raise', 'Dumbbell Lateral Raise', 'side_delts', [], 'dumbbell', 'isolation'),
  ex('cable_lateral_raise', 'Cable Lateral Raise', 'side_delts', [], 'cable', 'isolation'),
  ex('rear_delt_fly', 'Reverse Pec Deck', 'rear_delts', ['back'], 'machine', 'isolation'),
  ex('face_pull', 'Face Pull', 'rear_delts', ['back'], 'cable', 'isolation'),

  // Arms
  ex('bb_curl', 'Barbell Curl', 'biceps', [], 'barbell', 'isolation'),
  ex('db_curl', 'Dumbbell Curl', 'biceps', [], 'dumbbell', 'isolation'),
  ex('incline_db_curl', 'Incline Dumbbell Curl', 'biceps', [], 'dumbbell', 'isolation'),
  ex('hammer_curl', 'Hammer Curl', 'biceps', [], 'dumbbell', 'isolation'),
  ex('cable_curl', 'Cable Curl', 'biceps', [], 'cable', 'isolation'),
  ex('preacher_curl', 'Machine Preacher Curl', 'biceps', [], 'machine', 'isolation'),
  ex('triceps_pushdown', 'Triceps Pushdown', 'triceps', [], 'cable', 'isolation'),
  ex('overhead_cable_ext', 'Overhead Cable Triceps Extension', 'triceps', [], 'cable', 'isolation'),
  ex('skullcrusher', 'EZ-bar Skullcrusher', 'triceps', [], 'barbell', 'isolation'),
  ex('close_grip_bench', 'Close-grip Bench Press', 'triceps', ['chest', 'front_delts'], 'barbell', 'compound'),

  // Legs
  ex('back_squat', 'Back Squat', 'quads', ['glutes'], 'barbell', 'compound', true),
  ex('front_squat', 'Front Squat', 'quads', ['glutes'], 'barbell', 'compound', true),
  ex('hack_squat', 'Hack Squat', 'quads', ['glutes'], 'machine', 'compound', true),
  ex('leg_press', 'Leg Press', 'quads', ['glutes'], 'machine', 'compound', true),
  ex('bulgarian_split_squat', 'Bulgarian Split Squat', 'quads', ['glutes'], 'dumbbell', 'compound', true),
  ex('walking_lunge', 'Dumbbell Walking Lunge', 'quads', ['glutes'], 'dumbbell', 'compound', true),
  ex('leg_extension', 'Leg Extension', 'quads', [], 'machine', 'isolation', true),
  ex('deadlift', 'Deadlift', 'hamstrings', ['glutes', 'back'], 'barbell', 'compound', true),
  ex('romanian_deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes'], 'barbell', 'compound', true),
  ex('db_rdl', 'Dumbbell Romanian Deadlift', 'hamstrings', ['glutes'], 'dumbbell', 'compound', true),
  ex('lying_leg_curl', 'Lying Leg Curl', 'hamstrings', [], 'machine', 'isolation', true),
  ex('seated_leg_curl', 'Seated Leg Curl', 'hamstrings', [], 'machine', 'isolation', true),
  ex('hip_thrust', 'Barbell Hip Thrust', 'glutes', ['hamstrings'], 'barbell', 'compound', true),
  ex('back_extension', '45° Back Extension', 'glutes', ['hamstrings'], 'bodyweight', 'isolation', true),
  ex('hip_abduction', 'Hip Abduction Machine', 'glutes', [], 'machine', 'isolation', true),
  ex('standing_calf_raise', 'Standing Calf Raise', 'calves', [], 'machine', 'isolation', true),
  ex('seated_calf_raise', 'Seated Calf Raise', 'calves', [], 'machine', 'isolation', true),

  // Core
  ex('cable_crunch', 'Cable Crunch', 'abs', [], 'cable', 'isolation'),
  ex('hanging_leg_raise', 'Hanging Leg Raise', 'abs', [], 'bodyweight', 'isolation'),
  ex('ab_wheel', 'Ab Wheel Rollout', 'abs', [], 'bodyweight', 'isolation'),
];

const BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id) {
  return BY_ID[id];
}

// Same primary muscle first, then everything else that trains it secondarily.
export function alternativesFor(id) {
  const base = BY_ID[id];
  if (!base) return EXERCISES;
  const same = EXERCISES.filter((e) => e.id !== id && e.muscle === base.muscle);
  return same;
}
