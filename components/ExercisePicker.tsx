"use client";

import { useMemo, useRef, useState } from "react";
import type { LastSet } from "@/lib/history";
import { sessionSummary } from "@/lib/lift";
import { exactMatch, exerciseOptions, searchExercises, slugify } from "@/lib/exercises";

type Item = { id: string; name: string; meta: string; isNew?: boolean };

// Add an exercise mid-workout (P1-05, DD-040). One field, results right under it as full-width rows:
// the lifter's recent exercises before typing, then their own and the library as they type ("bp" finds Bench press),
// and a last row to create a new one. Rows answer on press (inverted), with no entrance animation: this runs every set block.
export default function ExercisePicker({
  mine,
  last,
  onAdd,
}: {
  mine: { id: string; name: string }[]; // most recent first
  last: Record<string, LastSet[]>;
  onAdd: (exerciseId: string, label: string) => void;
}) {
  const options = useMemo(() => exerciseOptions(mine), [mine]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1: no row chosen (an empty field never adds by itself)
  const input = useRef<HTMLInputElement>(null);

  const typed = query.trim();
  const meta = (o: { id: string; mine: boolean }) =>
    o.mine ? (last[o.id] ? `Last · ${sessionSummary(last[o.id])}` : "Yours") : "Library";
  const found = typed
    ? searchExercises(typed, options)
    : mine.length
      ? options.filter((o) => o.mine).slice(0, 5)
      : options.slice(0, 5);
  const items: Item[] = found.map((o) => ({ id: o.id, name: o.name, meta: meta(o) }));
  const newId = slugify(typed);
  if (newId && !exactMatch(typed, options)) items.push({ id: newId, name: typed, meta: "New", isNew: true }); // the field's maxLength keeps it ≤ 64
  const heading = typed ? "Matches" : mine.length ? "Recent" : "Common lifts";
  const shown = open && items.length > 0;
  const current = Math.min(typed ? Math.max(active, 0) : active, items.length - 1);

  function pick(item: Item) {
    onAdd(item.id, item.name);
    setQuery("");
    setActive(-1);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = Math.max(items.length, 1);
      setActive(current < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (current + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Escape") {
      setQuery("");
      setActive(-1);
      setOpen(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (items[current]) pick(items[current]);
      }}
      className="space-y-2"
    >
      <label htmlFor="add-exercise" className="label block">
        Add exercise
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          ref={input}
          id="add-exercise"
          type="text"
          role="combobox"
          aria-expanded={shown}
          aria-controls="exercise-options"
          aria-autocomplete="list"
          aria-activedescendant={shown && current >= 0 ? `exercise-option-${current}` : undefined}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder={mine.length ? "Search or type a new one" : "e.g. Bench press"}
          value={query}
          maxLength={64}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            // Lift the field to the top, so the results sit above the keyboard instead of under it.
            requestAnimationFrame(() => input.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="field h-[var(--tap-lg)] scroll-mt-36"
        />
        <button type="submit" disabled={!items[current]} className="btn btn-lg px-5">
          Add
        </button>
      </div>

      {shown && (
        <div>
          <p className="label pt-2 pb-1">{heading}</p>
          {/* Pointer-down keeps focus in the field, so a tap picks the row instead of first closing the list. */}
          <ul id="exercise-options" role="listbox" aria-label="Exercises" className="-mx-4 border-b border-[var(--divider)] md:mx-0" onPointerDown={(e) => e.preventDefault()}>
            {items.map((item, i) => (
              <li
                key={`${item.isNew ? "new" : "ex"}-${item.id}`}
                id={`exercise-option-${i}`}
                role="option"
                aria-selected={i === current}
                onClick={() => pick(item)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
                className={`press grid min-h-[var(--tap-lg)] cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-t border-[var(--divider)] px-4 active:bg-[var(--fg)] active:text-[var(--bg)] ${
                  i === current ? "bg-[var(--fg)] text-[var(--bg)]" : ""
                }`}
              >
                <span className="truncate text-base font-bold uppercase tracking-[-0.01em]">
                  {item.isNew ? <>+ {item.name}</> : item.name}
                </span>
                <span className={`label ${i === current ? "text-[var(--bg)]" : ""}`}>{item.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && typed && !items.length && <p className="text-sm text-[var(--muted)]">Use letters or numbers in the name.</p>}
      {/* Picks stay findable by screen readers as the list changes. */}
      <p role="status" aria-live="polite" className="sr-only">
        {shown ? `${items.length} ${items.length === 1 ? "option" : "options"}` : ""}
      </p>
    </form>
  );
}
