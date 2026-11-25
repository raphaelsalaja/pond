import { USER_ERROR_NAME } from "@shared/user-error";

/** Electron prefixes errors that cross `ipcRenderer.invoke` with the channel and error name. */
const USER_ERROR_PREFIX = new RegExp(
  `^Error invoking remote method '[^']*': ${USER_ERROR_NAME}: `,
);

/** Only copy the main process marked for the screen reaches it; anything else uses the caller's sentence. */
export function errorCopy(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  if (cause.name === USER_ERROR_NAME) return cause.message.trim();
  const message = cause.message.replace(USER_ERROR_PREFIX, "");
  return message === cause.message ? fallback : message.trim();
}
