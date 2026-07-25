"use client";

import { useState } from "react";
import type { DiscoverFilters } from "@/lib/filters";
import { DATE_PRESETS, DEFAULT_RADIUS_KM } from "@/lib/filters";
import { TIER_LABELS, TIER_ORDER, formatListeners } from "@/lib/obscurity";
import { titleCase } from "@/lib/format";
import { useFilterNav } from "@/components/useFilterNav";

/** Discrete stops for the listener ceiling. `null` is "no ceiling". */
const LISTENER_STOPS: (number | null)[] = [
  500, 1_000, 5_000, 25_000, 100_000, 500_000, null,
];

const RADIUS_STOPS = [5, 10, 25, 50, 100, 250, 500];

const SORTS = [
  { value: "obscurity", label: "Most obscure" },
  { value: "popularity", label: "Most popular" },
  { value: "distance", label: "Closest" },
  { value: "soonest", label: "Playing soonest" },
  { value: "momentum", label: "Rising fastest" },
];

/**
 * A slider that only writes to the URL when the drag ends, so a single sweep
 * does not fire a dozen navigations.
 */
function StopSlider({
  label,
  stops,
  index,
  render,
  onCommit,
}: {
  label: string;
  stops: unknown[];
  index: number;
  render: (index: number) => string;
  onCommit: (index: number) => void;
}) {
  // Track the committed value so an external change (back button, reset,
  // shared link) re-syncs the thumb during render rather than in an effect.
  const [local, setLocal] = useState(index);
  const [committed, setCommitted] = useState(index);
  if (index !== committed) {
    setCommitted(index);
    setLocal(index);
  }

  return (
    <label className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[170px] sm:flex-1">
      <span className="label flex items-center justify-between">
        {label}
        <span className="text-[var(--color-chalk)]">{render(local)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        onTouchEnd={() => onCommit(local)}
        onBlur={() => onCommit(local)}
        className="w-full accent-[var(--color-acid)]"
        aria-label={label}
      />
    </label>
  );
}

export function FilterBar({
  filters,
  genres,
  variant = "discover",
}: {
  filters: DiscoverFilters;
  genres: string[];
  variant?: "discover" | "events";
}) {
  const { setParams, toggleInList, pending } = useFilterNav();
  const [showAllGenres, setShowAllGenres] = useState(false);

  const listenerIndex = Math.max(
    0,
    LISTENER_STOPS.findIndex((stop) => stop === filters.maxListeners),
  );
  const radiusIndex = Math.max(
    0,
    RADIUS_STOPS.findIndex((stop) => stop >= filters.radiusKm),
  );

  // A selected genre must always be on screen, even when it sits outside the
  // first handful — otherwise the filter looks like it is not applied.
  const visibleGenres = showAllGenres
    ? genres
    : [
        ...new Set([
          ...genres.slice(0, 8),
          ...genres.filter((g) => filters.genres.includes(g.toLowerCase())),
        ]),
      ];
  const hiddenGenreCount = genres.length - visibleGenres.length;
  const hasActiveFilters =
    filters.genres.length > 0 ||
    filters.maxListeners !== null ||
    filters.datePreset !== "any" ||
    filters.onlyWithShows ||
    filters.tier !== null;

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
      style={{ opacity: pending ? 0.7 : 1 }}
    >
      {/* Genres */}
      <div>
        <p className="label mb-2">Genre</p>
        <div className="flex flex-wrap gap-1.5">
          {visibleGenres.map((genre) => {
            const active = filters.genres.includes(genre.toLowerCase());
            return (
              <button
                key={genre}
                onClick={() => toggleInList("genres", genre.toLowerCase())}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-[var(--color-acid)] bg-[var(--color-acid)]/15 text-[var(--color-acid)]"
                    : "border-[var(--color-line)] text-[var(--color-fog)] hover:border-[var(--color-line-bright)] hover:text-[var(--color-chalk)]"
                }`}
              >
                {titleCase(genre)}
              </button>
            );
          })}
          {(showAllGenres || hiddenGenreCount > 0) && (
            <button
              onClick={() => setShowAllGenres((v) => !v)}
              className="rounded-full px-2.5 py-1 text-xs text-[var(--color-fog)] underline underline-offset-2 hover:text-[var(--color-chalk)]"
            >
              {showAllGenres ? "Fewer" : `+${hiddenGenreCount} more`}
            </button>
          )}
        </div>
      </div>

      {/* Dates */}
      <div>
        <p className="label mb-2">When</p>
        <div className="rail">
          {DATE_PRESETS.map((preset) => {
            const active = filters.datePreset === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() =>
                  setParams({ when: preset.value === "any" ? null : preset.value })
                }
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors ${
                  active
                    ? "border-[var(--color-acid)] bg-[var(--color-acid)]/15 text-[var(--color-acid)]"
                    : "border-[var(--color-line)] text-[var(--color-fog)] hover:border-[var(--color-line-bright)] hover:text-[var(--color-chalk)]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <div className="flex flex-wrap gap-5">
        <StopSlider
          label="Max listeners"
          stops={LISTENER_STOPS}
          index={listenerIndex}
          render={(i) => {
            const stop = LISTENER_STOPS[i] ?? null;
            return stop === null ? "No limit" : formatListeners(stop);
          }}
          onCommit={(i) => {
            const stop = LISTENER_STOPS[i] ?? null;
            setParams({ maxListeners: stop === null ? null : String(stop) });
          }}
        />

        <StopSlider
          label="Within"
          stops={RADIUS_STOPS}
          index={radiusIndex}
          render={(i) => `${RADIUS_STOPS[i] ?? DEFAULT_RADIUS_KM} km`}
          onCommit={(i) => setParams({ radius: String(RADIUS_STOPS[i] ?? DEFAULT_RADIUS_KM) })}
        />
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap items-center gap-3">
        {variant === "discover" && (
          <>
            <label className="flex items-center gap-2 text-xs text-[var(--color-fog)]">
              <input
                type="checkbox"
                checked={filters.onlyWithShows}
                onChange={(e) => setParams({ shows: e.target.checked ? "1" : null })}
                className="accent-[var(--color-acid)]"
              />
              Only artists with shows
            </label>

            <label className="flex items-center gap-2 text-xs text-[var(--color-fog)]">
              Sort
              <select
                value={filters.sort}
                onChange={(e) => setParams({ sort: e.target.value })}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-chalk)]"
              >
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {variant === "events" && (
          <label className="flex items-center gap-2 text-xs text-[var(--color-fog)]">
            Headliner no bigger than
            <select
              value={filters.tier ?? ""}
              onChange={(e) => setParams({ tier: e.target.value || null })}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-chalk)]"
            >
              <option value="">Any size</option>
              {TIER_ORDER.map((tier) => (
                <option key={tier} value={tier}>
                  {TIER_LABELS[tier]}
                </option>
              ))}
            </select>
          </label>
        )}

        {hasActiveFilters && (
          <button
            onClick={() =>
              setParams({
                genres: null,
                maxListeners: null,
                when: null,
                shows: null,
                tier: null,
                sort: null,
              })
            }
            className="ml-auto text-xs text-[var(--color-fog)] underline underline-offset-2 hover:text-[var(--color-chalk)]"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
