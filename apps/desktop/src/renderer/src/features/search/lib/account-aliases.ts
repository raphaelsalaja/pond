import type { Source, WatchKind } from "@pond/schema/db";
import { isSource, sourceLabel } from "@pond/schema/sources";
import { getPrefsSnapshot } from "@/shared/state/prefs";

export interface AccountRef {
  readonly id: string;
  readonly source: Source;
  readonly handle: string | null;
  readonly label: string | null;
  readonly kind?: WatchKind;
  readonly avatarUrl?: string | null;
  readonly watch?: boolean;
}

function isOpaqueKind(kind: WatchKind | undefined): boolean {
  return kind === "playlist" || kind === "list";
}

function localName(ref: AccountRef): string {
  const labeled = ref.label?.trim();
  if (labeled) {
    return labeled;
  }
  const handle = ref.handle?.trim();
  if (!handle) {
    return "";
  }
  if (isOpaqueKind(ref.kind)) {
    return handle;
  }
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function aliases(ref: AccountRef): Array<string> {
  const out: Array<string> = [
    ref.id,
    localName(ref),
    ref.handle ?? "",
    ref.label ?? "",
  ];
  return [
    ...new Set(
      out.flatMap((value) => {
        const key = keyOf(value);
        return key ? [key] : [];
      }),
    ),
  ];
}

export function accountRefsFromSync(
  sync:
    | {
        accounts?: Record<
          string,
          {
            id: string;
            source: Source;
            handle: string | null;
            label: string | null;
            avatarUrl?: string | null;
          }
        >;
        watches?: Record<
          string,
          {
            id: string;
            source: Source;
            handle: string;
            label: string | null;
            kind?: WatchKind;
            avatarUrl?: string | null;
          }
        >;
      }
    | null
    | undefined,
): Array<AccountRef> {
  const refs: Array<AccountRef> = [];
  for (const row of Object.values(sync?.accounts ?? {})) {
    refs.push({
      id: row.id,
      source: row.source,
      handle: row.handle,
      label: row.label,
      avatarUrl: row.avatarUrl,
    });
  }
  for (const row of Object.values(sync?.watches ?? {})) {
    refs.push({
      id: row.id,
      source: row.source,
      handle: row.handle,
      label: row.label,
      kind: row.kind,
      avatarUrl: row.avatarUrl,
      watch: true,
    });
  }
  return refs;
}

function liveRefs(): Array<AccountRef> {
  return accountRefsFromSync(getPrefsSnapshot()?.sync);
}

export function findAccountRef(
  id: string,
  refs: ReadonlyArray<AccountRef>,
): AccountRef | undefined {
  const key = id.toLowerCase();
  return refs.find((row) => row.id.toLowerCase() === key);
}

function hitsFor(
  raw: string,
  refs: ReadonlyArray<AccountRef>,
): Array<AccountRef> {
  const slash = raw.indexOf("/");
  if (slash > 0) {
    const source = raw.slice(0, slash).toLowerCase();
    if (isSource(source)) {
      const rest = keyOf(raw.slice(slash + 1));
      return refs.filter(
        (ref) => ref.source === source && aliases(ref).includes(rest),
      );
    }
  }
  const key = keyOf(raw);
  return refs.filter((ref) => aliases(ref).includes(key));
}

export function displayAccountToken(
  id: string,
  refs: ReadonlyArray<AccountRef> = liveRefs(),
): string {
  const ref = findAccountRef(id, refs);
  if (!ref) {
    return id;
  }
  const local = localName(ref) || ref.id;
  const unique = hitsFor(local, refs).every((row) => row.id === ref.id);
  return unique ? local : `${ref.source}/${local}`;
}

export function accountDisplayName(ref: AccountRef): string {
  return localName(ref) || sourceLabel(ref.source);
}

export function accountChipLabel(
  id: string,
  refs: ReadonlyArray<AccountRef> = liveRefs(),
): string {
  const ref = findAccountRef(id, refs);
  if (!ref) {
    return id;
  }
  const brand = sourceLabel(ref.source);
  const name = localName(ref);
  return name ? `${name} · ${brand}` : brand;
}

export function resolveAccountToken(
  raw: string,
  refs: ReadonlyArray<AccountRef> = liveRefs(),
): string {
  const matched = hitsFor(raw, refs);
  const hit = matched.length === 1 ? matched[0] : undefined;
  if (hit) {
    return hit.id.toLowerCase();
  }
  return raw.trim().toLowerCase();
}
