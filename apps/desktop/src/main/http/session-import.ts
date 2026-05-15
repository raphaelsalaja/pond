import {
  type ExtensionCookie,
  type SessionImportResponse,
  sessionImportPayloadSchema,
} from "@pond/schema/session";
import { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import type { Context } from "hono";
import { IPC } from "../../shared/constants";
import {
  isSourceConnected,
  primaryDomainForSource,
  writePartitionCookies,
} from "../core/refresh/scrape-window";
import { syncSource } from "../core/sync";

export async function sessionImportHandler(c: Context): Promise<Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ status: "error", error: "invalid_json" }, 400);
  }

  const parsed = sessionImportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn(
      "[pond http] session/import validation failed",
      parsed.error.flatten(),
    );
    return c.json({ status: "error", error: parsed.error.flatten() }, 400);
  }

  const { source, cookies } = parsed.data;
  const domain = primaryDomainForSource(source);
  if (!domain) {
    return c.json(
      {
        status: "error",
        error: `source ${source} has no cookie domain configured`,
      },
      400,
    );
  }

  const allowedHost = domain.replace(/^\./, "").toLowerCase();
  const filtered = cookies.filter((cookie: ExtensionCookie) => {
    const ck = cookie.domain.replace(/^\./, "").toLowerCase();
    return ck === allowedHost || ck.endsWith(`.${allowedHost}`);
  });

  if (filtered.length === 0) {
    const body: SessionImportResponse = {
      ok: false,
      imported: 0,
      connected: false,
      reason: "no_cookies_for_source_domain",
    };
    return c.json({ status: "success", data: body });
  }

  const { written, skipped } = await writePartitionCookies({
    cookies: filtered,
  });
  log.info(
    `[pond http] session/import ${source}: wrote ${written} (skipped ${skipped}, filtered out ${cookies.length - filtered.length})`,
  );

  const connected = await isSourceConnected(source).catch(() => false);

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(IPC.sourceStatus, { source, connected });
  }

  if (connected) {
    void syncSource(source, { trigger: "manual" }).catch((err) =>
      log.warn("[pond http] session/import follow-up sync threw", source, err),
    );
  }

  const body: SessionImportResponse = {
    ok: connected,
    imported: written,
    connected,
    reason: connected ? undefined : "no_auth_cookies_in_payload",
  };
  return c.json({ status: "success", data: body });
}
