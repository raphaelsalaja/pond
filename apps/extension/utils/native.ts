import {
  NATIVE_HOST_NAME,
  nativeResponseSchema,
  SAFARI_HOST_NAME,
} from "@pond/schema/native";
import type { NativeRequest, NativeResponse } from "@pond/schema/native";

export type NativeUnreachable =
  | "offline"
  | "host_missing"
  | "host_forbidden"
  | "host_failed"
  | "incompatible";

const UNREACHABLE: ReadonlySet<string> = new Set<NativeUnreachable>([
  "offline",
  "host_missing",
  "host_forbidden",
  "host_failed",
  "incompatible",
]);

export function isUnreachable(error: string): error is NativeUnreachable {
  return UNREACHABLE.has(error);
}

/** Maps Chromium's and Firefox's `sendNativeMessage` rejections onto what you can fix. */
export function unreachableFromMessage(message: string): NativeUnreachable {
  if (/forbidden|does not have permission/i.test(message)) {
    return "host_forbidden";
  }
  if (/not found|no such native application/i.test(message)) {
    return "host_missing";
  }
  if (/exited|failed to start|communicating|disconnected/i.test(message)) {
    return "host_failed";
  }
  return "offline";
}

/** Safari routes native messages to the handler in Pond's app extension, not `pond-native-host`. */
const HOST_NAME =
  import.meta.env.BROWSER === "safari" ? SAFARI_HOST_NAME : NATIVE_HOST_NAME;

export async function nativeCall(
  request: NativeRequest,
): Promise<NativeResponse> {
  try {
    const response: unknown = await browser.runtime.sendNativeMessage(
      HOST_NAME,
      request,
    );
    const parsed = nativeResponseSchema.safeParse(response);
    return parsed.success ? parsed.data : { ok: false, error: "incompatible" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: unreachableFromMessage(message) };
  }
}
