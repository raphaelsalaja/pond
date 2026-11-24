import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { ExtensionSources } from "./";

it("turns Twitter likes off while the Twitter Account imports bookmarks only", async () => {
  bridge.use({
    query: {
      "accounts.list": () => ({
        accounts: [
          {
            id: "x-account",
            source: "twitter",
            handle: "@pond",
            identityKey: null,
            label: null,
            addedAt: "2026-10-20T00:00:00.000Z",
            sync: {
              lastSyncedAt: null,
              lastError: null,
              highWaterMark: null,
              lastFullSyncAt: null,
              knownCount: 0,
              runningSince: null,
              importScope: { listKinds: ["saved"] },
            },
            connected: true,
            syncing: false,
          },
        ],
      }),
      "settings.getPrefs": () => PrefsSchema.parse({}),
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ExtensionSources />));
    const likes = (label: string) =>
      host.querySelector(`[aria-label="${label}"]`);

    expect(likes("Twitter Likes")?.getAttribute("aria-checked")).toBe("false");
    expect(likes("Twitter Likes")?.hasAttribute("data-disabled")).toBe(true);
    expect(host.textContent).toContain(
      "Off while your Twitter Account skips Likes.",
    );
    expect(likes("Instagram Likes")?.getAttribute("aria-checked")).toBe("true");
    expect(likes("Instagram Likes")?.hasAttribute("data-disabled")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
