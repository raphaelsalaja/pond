import type { Source } from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
import { enqueue } from "../core/pipeline/enqueue";
import type { EnqueueOptions } from "../core/pipeline/enqueue";
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

export function sessionImport(source: Source, cookies: Array<ExtensionCookie>) {
  return importSessionCookies(source, cookies);
}

export function sessionRefresh(
  source: Source,
  cookies: Array<ExtensionCookie>,
) {
  return refreshSessionCookies(source, cookies);
}
