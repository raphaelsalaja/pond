import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { z } from "zod";
import { getAppHistory, getAppRouter } from "@/shared/lib/app-router";

export type SourceDetailsKind = "account" | "watch" | "folder";

export const SourceDetailsPageSchema = z.enum([
  "overview",
  "general",
  "filters",
  "organize",
  "schedule",
  "activity",
  "connection",
]);

export type SourceDetailsPage = z.infer<typeof SourceDetailsPageSchema>;

const SOURCE_DETAILS_KINDS: ReadonlyArray<string> = [
  "account",
  "watch",
  "folder",
] satisfies Array<SourceDetailsKind>;

export function isSourceDetailsKind(value: string): value is SourceDetailsKind {
  return SOURCE_DETAILS_KINDS.includes(value);
}

export function sourceDetailHref(
  kind: SourceDetailsKind,
  id: string,
  page?: SourceDetailsPage,
): string {
  const path = `/sources/${kind}/${encodeURIComponent(id)}`;
  return page ? `${path}?page=${page}` : path;
}

function isSourceDetailPath(pathname: string): boolean {
  return pathname.startsWith("/sources/");
}

export interface SourceDetailTarget {
  kind: SourceDetailsKind;
  id: string;
  page?: SourceDetailsPage;
}

export function parseSourceDetailPath(
  pathname: string,
  page?: SourceDetailsPage,
): SourceDetailTarget | null {
  if (!isSourceDetailPath(pathname)) return null;
  const [kind, id] = pathname.slice("/sources/".length).split("/");
  if (!kind || !id || !isSourceDetailsKind(kind)) return null;
  return {
    kind,
    id: decodeURIComponent(id),
    page,
  };
}

interface SourceDetailState {
  revision: number;
  name: string | null;
}

const store = new Store<SourceDetailState>({
  revision: 0,
  name: null,
});

function open(kind: SourceDetailsKind, id: string, page?: SourceDetailsPage) {
  getAppHistory()?.push(sourceDetailHref(kind, id, page));
}

export const sourceDetail = {
  openAccount: (id: string, page?: SourceDetailsPage): void => {
    open("account", id, page);
  },
  openWatch: (id: string): void => {
    open("watch", id);
  },
  openFolder: (path: string): void => {
    open("folder", path);
  },
  close: (): void => {
    const router = getAppRouter();
    if (router && isSourceDetailPath(router.state.location.pathname)) {
      getAppHistory()?.push("/sources");
    }
  },
  changed: (): void => {
    store.setState((s) => ({ ...s, revision: s.revision + 1 }));
  },
  setName: (name: string | null): void => {
    store.setState((s) => (s.name === name ? s : { ...s, name }));
  },
};

export function useSourceDetailRevision(): number {
  return useSelector(store, (s) => s.revision);
}

export function useSourceDetailName(): string | null {
  return useSelector(store, (s) => s.name);
}
