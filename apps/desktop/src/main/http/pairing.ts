import { app } from "electron";
import type { Context } from "hono";
import { DEFAULT_INGEST_PORT } from "../../shared/constants";
import { getIngestToken } from "../keychain";

/**
 * `GET /api/v2/pair`  -- authenticated endpoint; the extension proves it
 * already has the token by calling this with a `Bearer <token>` header.
 * Returns the canonical pairing payload.
 *
 * Note: this is NOT the pairing bootstrap. The initial token has to be
 * hand-copied from the tray menu. That cold-start gap is deliberate —
 * there is no "local host is trusted" default here because a
 * captive-portal page on the same LAN would otherwise be able to silently
 * read the token.
 *
 * Once paired, the extension can call this to confirm connection + show
 * the active library name in the popup.
 */
export async function pairingHandler(c: Context) {
  const token = await getIngestToken();
  return c.json({
    status: "success",
    data: {
      app: "pond",
      version: app.getVersion(),
      port: DEFAULT_INGEST_PORT,
      endpoints: {
        add: `/api/v2/item/add`,
        get: `/api/v2/item/get`,
        info: `/api/v2/item/info`,
        library: `/api/v2/library/info`,
      },
      // Include token when request presented valid auth — we return
      // the same one so the extension can upgrade an out-of-date
      // token stored in its options.
      token,
    },
  });
}
