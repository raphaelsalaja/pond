import { ExtensionSettingsSchema } from "@pond/schema/browser-extension";
import { nativeRequestSchema } from "@pond/schema/native";
import { describe, expect, it, vi } from "vitest";
import { UnsupportedError } from "../core/pipeline/extractors/errors";
import { dispatchNative, type NativePorts } from "./rpc";

function ports(overrides: Partial<NativePorts> = {}): NativePorts {
  return {
    enqueue: vi.fn(),
    libraryInfo: vi.fn(),
    sessionPending: vi.fn(() => null),
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
    const enqueue = vi.fn().mockResolvedValue({ id: "01", created: true });
    const result = await dispatchNative(
      {
        type: "enqueue",
        url: "https://x.com/i/web/status/1",
        trigger: "toolbar",
      },
      ports({ enqueue }),
    );
    expect(result).toEqual({ ok: true, data: { id: "01", created: true } });
    expect(enqueue).toHaveBeenCalledWith("https://x.com/i/web/status/1", {
      trigger: "toolbar",
    });
  });

  it("maps UnsupportedError to unsupported_url", async () => {
    const enqueue = vi
      .fn()
      .mockRejectedValue(new UnsupportedError("no extractor matches url"));
    await expect(
      dispatchNative(
        { type: "enqueue", url: "https://example.invalid/x" },
        ports({ enqueue }),
      ),
    ).resolves.toEqual({ ok: false, error: "unsupported_url" });
  });

  it("returns library.info from the injected port", async () => {
    const libraryInfo = vi.fn().mockResolvedValue({ name: "Library" });
    await expect(
      dispatchNative({ type: "library.info" }, ports({ libraryInfo })),
    ).resolves.toEqual({ ok: true, data: { name: "Library" } });
  });

  it("returns folders.list from the injected port", async () => {
    const folder = { id: "refs", name: "Refs", parentId: null, color: null };
    const foldersList = vi.fn().mockResolvedValue([folder]);
    await expect(
      dispatchNative({ type: "folders.list" }, ports({ foldersList })),
    ).resolves.toEqual({ ok: true, data: [folder] });
  });

  it("returns tags.list from the injected port", async () => {
    const tag = { name: "pond", starred: true, usageCount: 3, lastUsedAt: 1 };
    const tagsList = vi.fn().mockResolvedValue([tag]);
    await expect(
      dispatchNative({ type: "tags.list" }, ports({ tagsList })),
    ).resolves.toEqual({ ok: true, data: [tag] });
  });

  it("reports tags.list as unavailable without a port", async () => {
    await expect(
      dispatchNative({ type: "tags.list" }, ports()),
    ).resolves.toEqual({ ok: false, error: "tags_unavailable" });
  });

  it("returns fish.list from the injected port", async () => {
    const fishList = vi.fn().mockResolvedValue([{ id: "koi", name: "Koi" }]);
    await expect(
      dispatchNative({ type: "fish.list" }, ports({ fishList })),
    ).resolves.toEqual({ ok: true, data: [{ id: "koi", name: "Koi" }] });
  });

  it("reports fish.list as unavailable without a port", async () => {
    await expect(
      dispatchNative({ type: "fish.list" }, ports()),
    ).resolves.toEqual({ ok: false, error: "fish_unavailable" });
  });

  it("passes the chosen fish along with a capture", async () => {
    const capture = vi.fn().mockResolvedValue({ id: "draft-1" });
    const draft = {
      id: "draft-1",
      items: [{ kind: "url", url: "https://example.com" }],
    };
    await dispatchNative(
      { type: "capture.accept", draft, fishId: "koi" },
      ports({ capture }),
    );
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
    const extensionSettings = vi.fn().mockResolvedValue(settings);
    await expect(
      dispatchNative(
        { type: "extension.settings" },
        ports({ extensionSettings }),
      ),
    ).resolves.toEqual({ ok: true, data: settings });
  });

  it("reports extension.settings as unavailable without a port", async () => {
    await expect(
      dispatchNative({ type: "extension.settings" }, ports()),
    ).resolves.toEqual({ ok: false, error: "settings_unavailable" });
  });

  it("reads a capture receipt by draft id", async () => {
    const receipt = {
      id: "draft-1",
      library: "/library",
      state: "complete" as const,
      completed: 1,
      total: 1,
      saveIds: ["save-1"],
      duplicateCount: 0,
    };
    const captureStatus = vi.fn().mockResolvedValue(receipt);
    await expect(
      dispatchNative(
        { type: "capture.status", id: "draft-1" },
        ports({ captureStatus }),
      ),
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
    const sessionImport = vi.fn().mockResolvedValue(rejected);
    await expect(
      dispatchNative(
        { type: "session.import", source: "arena", cookies: [] },
        ports({ sessionImport }),
      ),
    ).resolves.toEqual({ ok: true, data: rejected });
    expect(sessionImport).toHaveBeenCalledWith("arena", []);
  });

  it("forwards a rotated session to the refresh port", async () => {
    const sessionRefresh = vi.fn(async () => ({
      tracked: true,
      refreshed: true,
    }));
    await expect(
      dispatchNative(
        { type: "session.refresh", source: "youtube", cookies: [] },
        ports({ sessionRefresh }),
      ),
    ).resolves.toEqual({ ok: true, data: { tracked: true, refreshed: true } });
    expect(sessionRefresh).toHaveBeenCalledWith("youtube", []);
  });
});

describe("files.import", () => {
  it("hands paths to the share inbox port", async () => {
    const importSharedFiles = vi.fn(async () => ({ ids: ["s1"] }));
    const response = await dispatchNative(
      { type: "files.import", paths: ["/inbox/a/b.png"] },
      ports({ importSharedFiles }),
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
        importSharedFiles: vi.fn(async () => {
          throw new Error("no_files");
        }),
      }),
    );
    expect(response).toEqual({ ok: false, error: "no_files" });
  });
});
