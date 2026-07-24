"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filter state lives in the URL, not in React state.
 *
 * That makes every view shareable — copy the address bar, send it to someone,
 * they land on the identical set of artists — and lets the server components
 * do the filtering on navigation.
 */
export function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }

      // Any filter change invalidates the current page of results.
      params.delete("cursor");

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);

  const toggleInList = useCallback(
    (key: string, value: string) => {
      const current = (searchParams.get(key) ?? "").split(",").filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setParams({ [key]: next.join(",") || null });
    },
    [searchParams, setParams],
  );

  return { setParams, get, toggleInList, pending, searchParams, pathname };
}
