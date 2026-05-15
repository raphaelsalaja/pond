import type { NewSave, Save } from "@pond/schema/db";

export function mergeRawJson(
  current: unknown,
  next: unknown,
): { changed: boolean; value: unknown } {
  if (next === undefined) return { changed: false, value: current };
  if (!isPlainObject(current) || !isPlainObject(next)) {
    const changed = JSON.stringify(current ?? null) !== JSON.stringify(next);
    return { changed, value: next };
  }

  const out: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(next)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = { ...(out[k] as Record<string, unknown>), ...v };
    } else {
      out[k] = v;
    }
  }
  const changed = JSON.stringify(current) !== JSON.stringify(out);
  return { changed, value: out };
}

export function mergeUnique(
  a: readonly string[],
  b: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function snapshotBefore(
  current: Save,
  patch: Partial<NewSave>,
): Partial<Save> {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    before[key] = (current as unknown as Record<string, unknown>)[key] ?? null;
  }
  return before as Partial<Save>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
