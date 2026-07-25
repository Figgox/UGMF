import type { Page } from "@/types";

/** Shared by every provider that paginates an in-memory array with a numeric-offset cursor. */
export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const offset = Number(cursor);
  return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
}

export function paginate<T>(items: T[], offset: number, limit: number): Page<T> {
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit;
  return {
    items: slice,
    nextCursor: next < items.length ? String(next) : null,
    total: items.length,
  };
}
