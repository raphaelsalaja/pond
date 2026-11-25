import { storage } from "wxt/utils/storage";
import type { JsonValue } from "./json";
import { DEFAULT_SETTINGS, normalizeStoredSettings } from "./types";
import type { PondSettings } from "./types";

/** Pond's Settings own these; this is the last copy the background fetched, kept for when Pond is closed. */
const item = storage.defineItem<JsonValue>("local:settings");

export async function getSettings(): Promise<PondSettings> {
  return normalizeStoredSettings(await item.getValue());
}

export async function ensureSettings(): Promise<void> {
  if ((await item.getValue()) === null) {
    await item.setValue(DEFAULT_SETTINGS);
  }
}

export async function storeSettings(next: PondSettings): Promise<void> {
  if (JSON.stringify(next) === JSON.stringify(await getSettings())) return;
  await item.setValue(next);
}

export function watchSettings(
  listener: (settings: PondSettings) => void,
): () => void {
  return item.watch((value) => listener(normalizeStoredSettings(value)));
}
