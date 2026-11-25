import { ExtensionSettingsSchema } from "@pond/schema/browser-extension";
import type { CaptureReceipt } from "@pond/schema/capture";
import { nativeRequestSchema } from "@pond/schema/native";
import { describe, expect, it, vi } from "vitest";
import { UnsupportedError } from "../core/pipeline/extractors/errors";
import type { LibraryInfo } from "../ops/library";
import { dispatchNative } from "./rpc";
import type { EnqueueResult, NativePorts } from "./rpc";

const receipt: CaptureReceipt = {
  id: "draft-1",
  library: "/library",
  state: "complete",
  completed: 1,
  total: 1,
  saveIds: ["save-1"],
  duplicateCount: 0,
};

async function enqueueUnsupported(): Promise<EnqueueResult> {
  throw new UnsupportedError("no extractor matches url");
}

function ports(overrides: Partial<NativePorts> = {}): NativePorts {
  return {
    enqueue: vi.fn(),
    libraryInfo: vi.fn(),
    sessionPending: () => null,
    sessionImport: vi.fn(),
    appVersion: () => "0.0.1",
    ...overrides,
  };
}

describe("nativeRequestSchema", () => {
  it("accepts hello", () => {
    expect(nativeRequestSchema.parse({ type: "hello" })).toEqual({
      type: "hello",
    });
  });

  it("accepts an enqueue from a site intercept", () => {
    const row = nativeRequestSchema.parse({
      type: "enqueue",
      url: "https://x.com/i/web/status/1",
      trigger: "twitter:bookmark",
    });
    expect(row).toMatchObject({ type: "enqueue", trigger: "twitter:bookmark" });
  });

  it("accepts files.import with inbox paths", () => {
    const row = nativeRequestSchema.parse({
      type: "files.import",
      paths: ["/tmp/a.png"],
    });
    expect(row).toEqual({ type: "files.import", paths: ["/tmp/a.png"] });
  });

  it("rejects files.import with no paths", () => {
    expect(
      nativeRequestSchema.safeParse({ type: "files.import", paths: [] })
        .success,
    ).toBe(false);
  });
});

describe("dispatchNative", () => {
  it("rejects an invalid payload", async () => {
    await expect(dispatchNative({ type: "nope" }, ports())).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("answers hello with the app version", async () => {
    await expect(dispatchNative({ type: "hello" }, ports())).resolves.toEqual({
      ok: true,
      data: { app: "pond", version: "0.0.1" },
    });
  });

  it("enqueues through the injected port", async () => {
    const p = ports({ enqueue: async () => ({ id: "01", created: true }) });
    const enqueue = vi.spyOn(p, "enqueue");
    const result = await dispatchNative(
      {
        type: "enqueue",
        url: "https://x.com/i/web/status/1",
        trigger: "toolbar",
      },
      p,
    );
    expect(result).toEqual({ ok: true, data: { id: "01", created: true } });
    expect(enqueue).toHaveBeenCalledWith("https://x.com/i/web/status/1", {
      trigger: "toolbar",
    });
  });

  it("maps UnsupportedError to unsupported_url", async () => {
    await expect(
      dispatchNative(
        { type: "enqueue", url: "https://example.invalid/x" },
        ports({ enqueue: enqueueUnsupported }),
      ),
    ).resolves.toEqual({ ok: false, error: "unsupported_url" });
  });

  it("returns library.info from the injected port", async () => {
    const info: LibraryInfo = {
      libraryId: "lib-1",
      path: "/library",
      name: "Library",
      counts: { active: 0, trashed: 0, ingesting: 0, failed: 0 },
      queue: { pending: 0, running: 0 },
      theme: null,
    };
    await expect(
      dispatchNative(
        { type: "library.info" },
        ports({ libraryInfo: async () => info }),
      ),
    ).resolves.toEqual({ ok: true, data: info });
  });

  it("returns folders.list from the injected port", async () => {
    const folder = { id: "refs", name: "Refs", parentId: null, color: null };
    await expect(
      dispatchNative(
        { type: "folders.list" },
        ports({ foldersList: async () => [folder] }),
      ),
    ).resolves.toEqual({ ok: true, data: [folder] });
  });

  it("returns tags.list from the injected port", async () => {
    const tag = { name: "pond", starred: true, usageCount: 3, lastUsedAt: 1 };
    await expect(
      dispatchNative(
        { type: "tags.list" },
        ports({ tagsList: async () => [tag] }),
      ),
    ).resolves.toEqual({ ok: true, data: [tag] });
  });

  it("reports tags.list as unavailable without a port", async () => {
    await expect(
      dispatchNative({ type: "tags.list" }, ports()),
    ).resolves.toEqual({ ok: false, error: "tags_unavailable" });
  });

  it("returns fish.list from the injected port", async () => {
    await expect(
      dispatchNative(
        { type: "fish.list" },
        ports({ fishList: async () => [{ id: "koi", name: "Koi" }] }),
      ),
    ).resolves.toEqual({ ok: true, data: [{ id: "koi", name: "Koi" }] });
  });

  it("reports fish.list as unavailable without a port", async () => {
    await expect(
      dispatchNative({ type: "fish.list" }, ports()),
    ).resolves.toEqual({ ok: false, error: "fish_unavailable" });
  });

  it("passes the chosen fish along with a capture", async () => {
    const p = ports({ capture: async () => receipt });
    const capture = vi.spyOn(p, "capture");
    const draft = {
      id: "draft-1",
      items: [{ kind: "url", url: "https://example.com" }],
    };
    await dispatchNative({ type: "capture.accept", draft, fishId: "koi" }, p);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft-1" }),
      undefined,
      "koi",
    );
  });

  it("rejects a capture for a fish id outside the fish id format", async () => {
    const capture = vi.fn();
    await expect(
      dispatchNative(
        {
          type: "capture.accept",
          draft: {
            id: "draft-1",
            items: [{ kind: "url", url: "https://example.com" }],
          },
          fishId: "../Koi",
        },
        ports({ capture }),
      ),
    ).resolves.toEqual({ ok: false, error: "invalid" });
    expect(capture).not.toHaveBeenCalled();
  });

  it("returns the browser extension settings from the injected port", async () => {
    const settings = ExtensionSettingsSchema.parse({ altClick: false });
    await expect(
      dispatchNative(
        { type: "extension.settings" },
        ports({ extensionSettings: async () => settings }),
      ),
    ).resolves.toEqual({ ok: true, data: settings });
  });

  it("reports extension.settings as unavailable without a port", async () => {
    await expect(
      dispatchNative({ type: "extension.settings" }, ports()),
    ).resolves.toEqual({ ok: false, error: "settings_unavailable" });
  });

  it("reads a capture receipt by draft id", async () => {
    const p = ports({ captureStatus: async () => receipt });
    const captureStatus = vi.spyOn(p, "captureStatus");
    await expect(
      dispatchNative({ type: "capture.status", id: "draft-1" }, p),
    ).resolves.toEqual({ ok: true, data: receipt });
    expect(captureStatus).toHaveBeenCalledWith("draft-1");
  });

  it("rejects a capture status id outside the draft id format", async () => {
    await expect(
      dispatchNative({ type: "capture.status", id: "../x" }, ports()),
    ).resolves.toEqual({ ok: false, error: "invalid" });
  });

  it("forwards a session import with no cookies so Pond can report it signed out", async () => {
    const rejected = {
      ok: false,
      imported: 0,
      connected: false,
      reason: "no_cookies_for_source_domain",
    };
    const p = ports({ sessionImport: async () => rejected });
    const sessionImport = vi.spyOn(p, "sessionImport");
    await expect(
      dispatchNative(
        { type: "session.import", source: "arena", cookies: [] },
        p,
      ),
    ).resolves.toEqual({ ok: true, data: rejected });
    expect(sessionImport).toHaveBeenCalledWith("arena", []);
  });

  it("forwards a rotated session to the refresh port", async () => {
    const p = ports({
      sessionRefresh: async () => ({ tracked: true, refreshed: true }),
    });
    const sessionRefresh = vi.spyOn(p, "sessionRefresh");
    await expect(
      dispatchNative(
        { type: "session.refresh", source: "youtube", cookies: [] },
        p,
      ),
    ).resolves.toEqual({ ok: true, data: { tracked: true, refreshed: true } });
    expect(sessionRefresh).toHaveBeenCalledWith("youtube", []);
  });
});

describe("files.import", () => {
  it("hands paths to the share inbox port", async () => {
    const p = ports({ importSharedFiles: async () => ({ ids: ["s1"] }) });
    const importSharedFiles = vi.spyOn(p, "importSharedFiles");
    const response = await dispatchNative(
      { type: "files.import", paths: ["/inbox/a/b.png"] },
      p,
    );
    expect(importSharedFiles).toHaveBeenCalledWith(["/inbox/a/b.png"]);
    expect(response).toEqual({ ok: true, data: { ids: ["s1"] } });
  });

  it("reports files_unavailable when the port is missing", async () => {
    const response = await dispatchNative(
      { type: "files.import", paths: ["/inbox/a/b.png"] },
      ports(),
    );
    expect(response).toEqual({ ok: false, error: "files_unavailable" });
  });

  it("reports no_files when nothing was importable", async () => {
    const response = await dispatchNative(
      { type: "files.import", paths: ["/etc/hosts"] },
      ports({
        importSharedFiles: async () => {
          throw new Error("no_files");
        },
      }),
    );
    expect(response).toEqual({ ok: false, error: "no_files" });
  });
});
