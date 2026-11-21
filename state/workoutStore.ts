import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Workout, ExerciseInstance, SetEntry } from "@/domain/workout";
import { rememberUnit, type Unit } from "@/lib/lift";
import { DEFAULT_REST } from "@/lib/rest";

export type ActiveWorkout = {
  workout: Workout;
  title?: string;
  exercises: ExerciseInstance[];
  sets: SetEntry[];
};

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;
  endedId?: string;
  unit: Unit; // remembered across workouts
  restTarget: number; // seconds, remembered across workouts
  restAwayAt: string | null; // rest screens for sets up to this moment were put away (DD-060); persisted, so a reload keeps it

  setUnit: (unit: Unit) => void;
  setRestTarget: (seconds: number) => void;
  putRestAway: (setCreatedAt: string) => void;
  startWorkout: (userId: string, title?: string) => void;
  endWorkout: () => void;
  resumeWorkout: (workout: ActiveWorkout) => void; // takes over an unfinished workout from the server (P1-01)
  addExercise: (exerciseId: string, label: string, variation?: string) => string | undefined;
  setExerciseDone: (id: string, done: boolean) => void;
  addSet: (exerciseInstanceId: string, reps: number, weight: number, unit: Unit) => SetEntry;
  updateSet: (setId: string, updates: { reps?: number; weight?: number }) => void;
  removeSet: (setId: string) => SetEntry | undefined;
  restoreSet: (entry: SetEntry) => void;
  removeExercise: (id: string) => RemovedExercise | undefined;
  restoreExercise: (removed: RemovedExercise) => void;
  moveExercise: (id: string, by: -1 | 1) => void;
}

export type RemovedExercise = { exercise: ExerciseInstance; sets: SetEntry[]; index: number };

const generateId = () => crypto.randomUUID();
const byTime = (a: SetEntry, b: SetEntry) => a.createdAt.localeCompare(b.createdAt);

// Persisted so a reload, tab eviction or failed save never loses the sets (rehydrated in AppShell).
export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => {
      // Applies a change to the active workout, if there is one.
      const patch = (fn: (w: ActiveWorkout) => Partial<ActiveWorkout>) => {
        const w = get().activeWorkout;
        if (w) set({ activeWorkout: { ...w, ...fn(w) } });
      };

      return {
        activeWorkout: null,
        unit: "kg",
        restTarget: DEFAULT_REST,
        restAwayAt: null,

        setUnit: (unit) => {
          rememberUnit(unit);
          set({ unit });
        },
        setRestTarget: (restTarget) => set({ restTarget }),
        putRestAway: (restAwayAt) => set({ restAwayAt }),

        startWorkout: (userId, title) =>
          set({
            activeWorkout: {
              workout: { id: generateId(), userId, startedAt: new Date().toISOString(), endedAt: null },
              title,
              exercises: [],
              sets: [],
            },
          }),

        // endedId: the workout this device just saved or discarded, so Train never offers to resume it from a stale server copy.
        endWorkout: () => set((s) => ({ activeWorkout: null, endedId: s.activeWorkout?.workout.id ?? s.endedId })),
        resumeWorkout: (activeWorkout) => set({ activeWorkout }),

        // Adding an exercise means moving on: earlier exercises that already have sets fold away (their inputs hide).
        addExercise: (exerciseId, label, variation) => {
          const id = generateId();
          patch((w) => ({
            exercises: [
              ...w.exercises.map((e) => (w.sets.some((s) => s.exerciseInstanceId === e.id) ? { ...e, done: true } : e)),
              { id, workoutId: w.workout.id, exerciseId, label, order: w.exercises.length, variation },
            ],
          }));
          return get().activeWorkout ? id : undefined;
        },

        setExerciseDone: (id, done) => patch((w) => ({ exercises: w.exercises.map((e) => (e.id === id ? { ...e, done } : e)) })),

        addSet: (exerciseInstanceId, reps, weight, unit) => {
          const entry = { id: generateId(), exerciseInstanceId, reps, weight, unit, createdAt: new Date().toISOString() };
          patch((w) => ({ sets: [...w.sets, entry] }));
          return entry;
        },

        updateSet: (setId, updates) =>
          patch((w) => ({ sets: w.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)) })),

        removeSet: (setId) => {
          const removed = get().activeWorkout?.sets.find((s) => s.id === setId);
          patch((w) => ({ sets: w.sets.filter((s) => s.id !== setId) }));
          return removed;
        },

        restoreSet: (entry) => patch((w) => ({ sets: [...w.sets, entry].sort(byTime) })),

        // Removes an exercise with its sets; the snapshot puts both back where they were (UNDO).
        removeExercise: (id) => {
          const w = get().activeWorkout;
          const index = w ? w.exercises.findIndex((e) => e.id === id) : -1;
          if (!w || index < 0) return undefined;
          const removed = { exercise: w.exercises[index], sets: w.sets.filter((s) => s.exerciseInstanceId === id), index };
          patch((w) => ({ exercises: w.exercises.filter((e) => e.id !== id), sets: w.sets.filter((s) => s.exerciseInstanceId !== id) }));
          return removed;
        },

        restoreExercise: ({ exercise, sets, index }) =>
          patch((w) => ({
            exercises: [...w.exercises.slice(0, index), exercise, ...w.exercises.slice(index)],
            sets: [...w.sets, ...sets].sort(byTime),
          })),

        // Swaps an exercise with its neighbour (by = -1 up, 1 down). The saved order is the list order (Logger.save).
        moveExercise: (id, by) =>
          patch((w) => {
            const i = w.exercises.findIndex((e) => e.id === id);
            const j = i + by;
            if (i < 0 || j < 0 || j >= w.exercises.length) return {};
            const exercises = [...w.exercises];
            [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
            return { exercises };
          }),
      };
    },
    { name: "go-you.active-workout.v1", skipHydration: true },
  ),
);
