"use client";

import type { DiscoveryMode } from "@/types";
import { MODES } from "@/lib/filters";
import { useFilterNav } from "@/components/useFilterNav";

/**
 * The four ways into the catalogue.
 *
 * Switching modes only changes the `mode` param — every other filter the user
 * set stays put and stays visible in the bar below, so a mode switch never
 * quietly throws away their genre or radius choice.
 */
export function ModeSwitcher({ active }: { active: DiscoveryMode }) {
  const { setParams, pending } = useFilterNav();
  const tagline = MODES.find((m) => m.value === active)?.tagline;

  return (
    <div>
      <div className="rail" role="tablist" aria-label="Discovery mode">
        {MODES.map((mode) => {
          const selected = mode.value === active;
          return (
            <button
              key={mode.value}
              role="tab"
              aria-selected={selected}
              onClick={() => setParams({ mode: mode.value })}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                selected
                  ? "border-[var(--color-acid)] bg-[var(--color-acid)] text-[var(--color-ink)]"
                  : "border-[var(--color-line)] text-[var(--color-fog)] hover:border-[var(--color-line-bright)] hover:text-[var(--color-chalk)]"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <p
        className="mt-2 text-sm text-[var(--color-fog)]"
        style={{ opacity: pending ? 0.5 : 1 }}
      >
        {tagline}
      </p>
    </div>
  );
}
