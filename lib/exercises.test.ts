import { test } from "node:test";
import assert from "node:assert/strict";
import { exactMatch, exerciseOptions, searchExercises, slugify } from "./exercises.ts";

test("slugify keeps the server's slug rules", () => {
  assert.equal(slugify("  Lat Pull-down! "), "lat_pulldown");
  assert.equal(slugify("21s"), "21s");
  assert.equal(slugify("!!!"), "");
  assert.equal(slugify("x".repeat(80)).length, 64);
});

test("a library lift the lifter already logs under another spelling joins their exercise", () => {
  const opts = exerciseOptions([
    { id: "pullups", name: "PULLUPS" }, // older spelling of the library's pull_up
    { id: "bench", name: "BENCH" }, // library alias of bench_press
    { id: "zercher_squat", name: "Zercher squat" }, // not in the library
  ]);
  assert.deepEqual(opts.slice(0, 3).map((o) => [o.id, o.mine]), [["pullups", true], ["bench", true], ["zercher_squat", true]]);
  assert.ok(!opts.some((o) => o.id === "pull_up" || o.id === "bench_press"), "claimed library entries are not listed twice");
  // Typing the library spelling still finds the lifter's own slug, so history does not fork.
  assert.equal(exactMatch("Pull-up", opts)?.id, "pullups");
  assert.equal(exactMatch("bench press", opts)?.id, "bench");
  assert.equal(exactMatch("bp", opts)?.id, "bench");
  assert.equal(exactMatch("deadlift", opts)?.id, "deadlift");
  assert.equal(exactMatch("Mystery lift", opts), undefined);
  assert.equal(exactMatch("   ", opts), undefined);
});

test("search ranks exact, prefix, word start, contains; own before library", () => {
  const opts = exerciseOptions([{ id: "incline_bench_press", name: "Incline bench press" }]);
  assert.equal(searchExercises("bench", opts)[0].id, "bench_press"); // alias "bench" is exact
  assert.equal(searchExercises("incl", opts)[0].id, "incline_bench_press");
  assert.equal(searchExercises("db row", opts)[0].id, "dumbbell_row");
  assert.ok(searchExercises("press", opts).some((o) => o.id === "incline_bench_press"));
  assert.deepEqual(searchExercises("", opts), []);
  assert.deepEqual(searchExercises("zzzz", opts), []);
  assert.equal(searchExercises("e", opts, 4).length, 4);
});
