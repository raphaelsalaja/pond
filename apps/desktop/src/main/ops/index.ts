import type { Source } from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
import { type EnqueueOptions, enqueue } from "../core/pipeline/enqueue";
import {
  importSessionCookies,
  refreshSessionCookies,
} from "../core/session-import";
import { getPendingSessionSource } from "../pending-session";
import { libraryInfo } from "./library";

export type { EnqueueOptions };
export { enqueue, libraryInfo };

export function sessionPending(): { source: Source } | null {
  const source = getPendingSessionSource();
  return source ? { source } : null;
}

export function sessionImport(source: Source, cookies: ExtensionCookie[]) {
  return importSessionCookies(source, cookies);
}

export function sessionRefresh(source: Source, cookies: ExtensionCookie[]) {
  return refreshSessionCookies(source, cookies);
}
