"use client";

import { useEffect, useState } from "react";
import type { City } from "@/types";
import { useFilterNav } from "@/components/useFilterNav";

const STORAGE_KEY = "ugmf:location";

interface StoredLocation {
  lat: number;
  lng: number;
  label: string;
  cityId?: string;
}

/**
 * Where "near you" means.
 *
 * Geolocation is offered but never required — plenty of people will not grant
 * it, and picking a city has to work just as well. Whatever gets chosen is
 * remembered locally so the next visit starts in the right place.
 */
export function LocationPicker({
  cities,
  activeLabel,
}: {
  cities: City[];
  activeLabel: string | null;
}) {
  const { setParams, get } = useFilterNav();
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "unsupported">(
    "idle",
  );
  const [open, setOpen] = useState(false);

  const hasUrlLocation = Boolean((get("lat") && get("lng")) || get("city"));

  // First visit of the session with no location in the URL: restore the last
  // one used. Runs once, and only when the URL is not already authoritative.
  useEffect(() => {
    if (hasUrlLocation) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredLocation;
      if (typeof stored.lat !== "number" || typeof stored.lng !== "number") return;
      setParams({
        lat: stored.lat.toFixed(4),
        lng: stored.lng.toFixed(4),
        city: stored.cityId ?? null,
      });
    } catch {
      // Corrupt or unavailable storage is not worth surfacing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remember(location: StoredLocation) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    } catch {
      // Private browsing, quota, etc. The URL still carries the location.
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        remember({ lat: latitude, lng: longitude, label: "Your location" });
        setParams({ lat: latitude.toFixed(4), lng: longitude.toFixed(4), city: null });
        setStatus("idle");
        setOpen(false);
      },
      () => setStatus("denied"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function chooseCity(city: City) {
    remember({
      lat: city.location.lat,
      lng: city.location.lng,
      label: city.name,
      cityId: city.id,
    });
    setParams({
      lat: city.location.lat.toFixed(4),
      lng: city.location.lng.toFixed(4),
      city: city.id,
    });
    setOpen(false);
  }

  function clear() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do.
    }
    setParams({ lat: null, lng: null, city: null });
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-chalk)] hover:border-[var(--color-line-bright)]"
      >
        <span aria-hidden className="text-[var(--color-acid)]">◎</span>
        {activeLabel ?? "Set location"}
        <span aria-hidden className="text-[var(--color-fog)]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-2xl shadow-black/60">
          <button
            onClick={useMyLocation}
            disabled={status === "locating"}
            className="w-full rounded-lg bg-[var(--color-acid)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] disabled:opacity-60"
          >
            {status === "locating" ? "Locating…" : "Use my location"}
          </button>

          {status === "denied" && (
            <p className="mt-2 px-1 text-xs text-[var(--color-tier-rising)]">
              Location permission denied — pick a city instead.
            </p>
          )}
          {status === "unsupported" && (
            <p className="mt-2 px-1 text-xs text-[var(--color-tier-rising)]">
              This browser has no geolocation — pick a city instead.
            </p>
          )}

          <p className="label mt-3 px-1">Or pick a city</p>
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {cities.map((city) => (
              <li key={city.id}>
                <button
                  onClick={() => chooseCity(city)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-fog)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-chalk)]"
                >
                  {city.name}
                  <span className="ml-1.5 text-xs text-[var(--color-fog)]">
                    {city.country}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {activeLabel && (
            <button
              onClick={clear}
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-fog)] hover:text-[var(--color-chalk)]"
            >
              Clear location — show everywhere
            </button>
          )}
        </div>
      )}
    </div>
  );
}
