import type { ExternalSource } from "@pond/schema/sources";
import { acceptHookCapture, createRateLimit } from "./hook-capture";
import { asText, at, isJsonValue, isRecord } from "./json";
import { sendMessage } from "./messaging";
import { getSettings, watchSettings } from "./settings";
import { POND_EVENT } from "./types";
import type { PondCapturePayload, PondLogEntry } from "./types";

const CAPTURES_PER_MINUTE = 30;

/** A content script left behind by an extension reload can't reach the background, and the page has nowhere to show it. */
function ignoreOrphaned() {}

export async function bridge(source: ExternalSource): Promise<void> {
  let settings = await getSettings();
  watchSettings((next) => {
    settings = next;
  });
  const allow = createRateLimit(CAPTURES_PER_MINUTE, 60_000);

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) {
      return;
    }
    const envelope: unknown = event.data;
    if (
      !isJsonValue(envelope) ||
      !isRecord(envelope) ||
      envelope.type !== POND_EVENT
    ) {
      return;
    }
    const message = envelope.message;
    if (!isRecord(message)) return;

    if (message.kind === "capture") {
      const url = asText(at(message, "payload", "url"));
      if (!url) return;
      const payload: PondCapturePayload = {
        url,
        trigger: asText(at(message, "payload", "trigger")),
      };
      const collections = at(message, "payload", "collectionIds");
      if (Array.isArray(collections)) {
        payload.collectionIds = collections.flatMap((id) => {
          const text = asText(id);
          return text ? [text] : [];
        });
      }
      const accepted = acceptHookCapture(source, payload, settings);
      if (!accepted || !allow(Date.now())) {
        return;
      }
      void sendMessage("capture", accepted).catch(ignoreOrphaned);
      return;
    }

    if (message.kind === "log") {
      const level = message.level;
      const text = asText(message.message);
      if (text === undefined) return;
      if (level !== "info" && level !== "warn" && level !== "error") return;
      const entry: PondLogEntry = { level, message: text };
      const detail = asText(message.data);
      if (detail !== undefined) {
        entry.data = detail;
      }
      void sendMessage("log", entry).catch(ignoreOrphaned);
    }
  });
}
