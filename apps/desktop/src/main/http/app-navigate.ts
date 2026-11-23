import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { AppNavigationSchema } from "../../shared/app-navigation";
import { apiError, invalidRequest } from "./errors";
import { isLoopback } from "./loopback";

/** Lets the headless `--mcp` process drive the open Library window, which it cannot reach over IPC. */
export async function appNavigateHandler(c: Context) {
  if (!isLoopback(getConnInfo(c).remote.address)) {
    return apiError(
      c,
      "forbidden",
      "Only this computer can move the Pond window.",
    );
  }
  const parsed = AppNavigationSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) return invalidRequest(c, parsed.error);
  const { navigateApp } = await import("../app-navigation");
  await navigateApp(parsed.data);
  return c.json({ status: "success", data: { ok: true } });
}
