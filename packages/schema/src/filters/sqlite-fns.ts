/**
 * Custom SQLite scalar functions used by the filter SQL builder.
 *
 * Registered once on the live `better-sqlite3` handle in
 * `apps/desktop/src/main/db.ts` so `to-sql.ts` can emit
 * `color_distance(...)` calls without falling back to a JS post
 * filter.
 *
 * Keep this list short — each function we register here has to hold
 * up under the FTS5 / vec0 query path too. If we ever spawn a
 * worker thread with its own DB handle we'll need to re-register
 * there.
 */

interface BetterSqliteLike {
  function: (
    name: string,
    options: { deterministic?: boolean; varargs?: boolean },
    impl: (...args: unknown[]) => unknown,
  ) => void;
}

/**
 * Register every custom SQLite scalar/UDF on a live DB handle.
 * Idempotent — calling twice on the same handle is a no-op as
 * `better-sqlite3` overwrites previous definitions.
 */
export function registerSqliteFunctions(sqlite: BetterSqliteLike): void {
  sqlite.function(
    "color_distance",
    { deterministic: true, varargs: false },
    (a: unknown, b: unknown) => {
      const ah = parseHex(a);
      const bh = parseHex(b);
      if (!ah || !bh) return null;
      return (
        Math.abs(ah.r - bh.r) + Math.abs(ah.g - bh.g) + Math.abs(ah.b - bh.b)
      );
    },
  );
}

function parseHex(raw: unknown): { r: number; g: number; b: number } | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/^#/, "").toLowerCase();
  if (clean.length !== 6) return null;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b };
}
