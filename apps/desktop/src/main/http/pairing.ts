import { app } from "electron";
import type { Context } from "hono";
import { DEFAULT_INGEST_PORT } from "../../shared/constants";
import { getIngestToken } from "../keychain";

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
      token,
    },
  });
}
