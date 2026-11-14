// Exercise names, aliases and search for the exercise picker (P1-05, DD-040). Pure: also run by node's test runner.

export type ExerciseOption = { id: string; name: string; aliases: string[]; mine: boolean };

// Common lifts, so a new lifter can pick instead of type, and "bp", "bench" or "flat bench" all find one exercise.
// shortcut: a fixed list in code; grow it from real usage (or move it to the DB) if people often create their own.
export const LIBRARY: { id: string; name: string; aliases: string[] }[] = [
  { id: "bench_press", name: "Bench press", aliases: ["bench", "bp", "flat bench", "barbell bench"] },
  { id: "incline_bench_press", name: "Incline bench press", aliases: ["incline bench", "incline press"] },
  { id: "dumbbell_bench_press", name: "Dumbbell bench press", aliases: ["db bench", "dumbbell press"] },
  { id: "squat", name: "Squat", aliases: ["back squat", "barbell squat"] },
  { id: "front_squat", name: "Front squat", aliases: [] },
  { id: "deadlift", name: "Deadlift", aliases: ["dl", "conventional deadlift"] },
  { id: "romanian_deadlift", name: "Romanian deadlift", aliases: ["rdl", "stiff leg deadlift"] },
  { id: "overhead_press", name: "Overhead press", aliases: ["ohp", "military press", "shoulder press", "press"] },
  { id: "dumbbell_shoulder_press", name: "Dumbbell shoulder press", aliases: ["db shoulder press", "seated dumbbell press"] },
  { id: "barbell_row", name: "Barbell row", aliases: ["bent over row", "bb row", "row"] },
  { id: "dumbbell_row", name: "Dumbbell row", aliases: ["db row", "one arm row"] },
  { id: "seated_cable_row", name: "Seated cable row", aliases: ["cable row", "seated row"] },
  { id: "pull_up", name: "Pull-up", aliases: ["pullup", "pull ups", "pullups"] },
  { id: "chin_up", name: "Chin-up", aliases: ["chinup", "chin ups", "chinups"] },
  { id: "lat_pulldown", name: "Lat pulldown", aliases: ["pulldown", "lat pull down", "lats"] },
  { id: "dip", name: "Dip", aliases: ["dips", "chest dip"] },
  { id: "push_up", name: "Push-up", aliases: ["pushup", "push ups", "pushups"] },
  { id: "hip_thrust", name: "Hip thrust", aliases: ["barbell hip thrust", "glute bridge"] },
  { id: "leg_press", name: "Leg press", aliases: [] },
  { id: "lunge", name: "Lunge", aliases: ["lunges", "walking lunge"] },
  { id: "bulgarian_split_squat", name: "Bulgarian split squat", aliases: ["bss", "split squat"] },
  { id: "leg_extension", name: "Leg extension", aliases: ["leg extensions", "quad extension"] },
  { id: "leg_curl", name: "Leg curl", aliases: ["hamstring curl", "lying leg curl"] },
  { id: "calf_raise", name: "Calf raise", aliases: ["calf raises", "calves"] },
  { id: "bicep_curl", name: "Bicep curl", aliases: ["curl", "curls", "biceps curl", "dumbbell curl", "barbell curl"] },
  { id: "hammer_curl", name: "Hammer curl", aliases: ["hammer curls"] },
  { id: "tricep_pushdown", name: "Tricep pushdown", aliases: ["pushdown", "triceps pushdown", "cable pushdown"] },
  { id: "skull_crusher", name: "Skull crusher", aliases: ["skullcrusher", "lying tricep extension"] },
  { id: "lateral_raise", name: "Lateral raise", aliases: ["side raise", "lat raise", "lateral raises"] },
  { id: "face_pull", name: "Face pull", aliases: ["face pulls"] },
  { id: "cable_fly", name: "Cable fly", aliases: ["cable flye", "chest fly", "pec fly"] },
  { id: "rear_delt_fly", name: "Rear delt fly", aliases: ["reverse fly", "rear delt"] },
  { id: "shrug", name: "Shrug", aliases: ["shrugs", "barbell shrug"] },
  { id: "plank", name: "Plank", aliases: [] },
  { id: "hanging_leg_raise", name: "Hanging leg raise", aliases: ["leg raise", "leg raises", "abs"] },
  { id: "cable_crunch", name: "Cable crunch", aliases: ["crunch", "crunches"] },
];

// "Lat Pull-down!" → "lat_pulldown". The server accepts /^[a-z0-9_]{1,64}$/.
export const slugify = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 64);

// Spelling-proof key: "Pull-up", "pull ups"→"pullups", "pull_up" and "PULLUP" compare as "pullup".
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const terms = (o: { id: string; name: string; aliases: string[] }) => [o.name, o.id, ...o.aliases];

// The lifter's own exercises (most recent first) plus the library. A library lift the lifter already has under
// another spelling joins their exercise (its aliases come along), so history never forks into two names.
export function exerciseOptions(mine: { id: string; name: string }[]): ExerciseOption[] {
  const claimed = new Set<string>();
  const own = mine.map((m) => {
    const lib = LIBRARY.find((l) => !claimed.has(l.id) && terms(l).some((t) => key(t) === key(m.id) || key(t) === key(m.name)));
    if (lib) claimed.add(lib.id);
    return { id: m.id, name: m.name, aliases: lib ? [lib.name, ...lib.aliases] : [], mine: true };
  });
  return [...own, ...LIBRARY.filter((l) => !claimed.has(l.id)).map((l) => ({ ...l, mine: false }))];
}

// The option the query names exactly (any spelling of its name, slug or an alias), if any.
export const exactMatch = (query: string, options: ExerciseOption[]) =>
  key(query) ? options.find((o) => terms(o).some((t) => key(t) === key(query))) : undefined;

// Best matches first: exact, then starts with, then a word starts with, then contains. The lifter's own before the library.
export function searchExercises(query: string, options: ExerciseOption[], limit = 6): ExerciseOption[] {
  const q = key(query);
  if (!q) return [];
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const score = (o: ExerciseOption) => {
    let best = Infinity;
    for (const t of terms(o)) {
      const k = key(t);
      const s =
        k === q ? 0
        : k.startsWith(q) ? 1
        : words.every((w) => t.toLowerCase().split(/[^a-z0-9]+/).some((tw) => tw.startsWith(w))) ? 2
        : k.includes(q) ? 3
        : Infinity;
      best = Math.min(best, s);
    }
    return best;
  };
  return options
    .map((o, i) => ({ o, i, s: score(o) }))
    .filter((x) => x.s < Infinity)
    .sort((a, b) => a.s - b.s || Number(b.o.mine) - Number(a.o.mine) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.o);
}
