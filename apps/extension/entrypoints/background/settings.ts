import { ExtensionSettingsSchema } from "@pond/schema/browser-extension";
import { nativeCall } from "@/utils/native";
import { storeSettings } from "@/utils/settings";
import { createSingleFlightTrigger } from "@/utils/single-flight";
import { settingsFromPond } from "@/utils/types";

/** Each fetch spawns the native host, so captures right after a sync reuse its result. */
const FRESH_MS = 5000;

let syncedAt = 0;

const sync = createSingleFlightTrigger(async (force) => {
  if (!force && Date.now() - syncedAt < FRESH_MS) return;
  const result = await nativeCall({ type: "extension.settings" });
  if (!result.ok) return;
  const parsed = ExtensionSettingsSchema.safeParse(result.data);
  if (!parsed.success) return;
  syncedAt = Date.now();
  await storeSettings(settingsFromPond(parsed.data));
});

/** Copies Pond's extension settings into storage, keeping the old copy when Pond is closed. */
export function syncSettings(force = false): Promise<void> {
  return sync(force);
}
