import { describe, expect, it, vi } from "vitest";
import { createSaveLinkHandler, parseSaveLink } from "./deep-link-save";

describe("parseSaveLink", () => {
  it("reads url, tags, and folder", () => {
    expect(
      parseSaveLink(
        new URL(
          "pond://save?url=https%3A%2F%2Fexample.com%2Fa&tags=posters,%20type&folder=01F",
        ),
      ),
    ).toEqual({
      url: "https://example.com/a",
      tags: ["posters", "type"],
      folderId: "01F",
    });
  });

  it("rejects non-web urls", () => {
    expect(
      parseSaveLink(new URL("pond://save?url=file%3A%2F%2F%2Fetc")),
    ).toBeNull();
    expect(parseSaveLink(new URL("pond://save"))).toBeNull();
  });
});

function deps() {
  return {
    enqueue: vi.fn(async () => ({ id: "s1", created: true })),
    addTags: vi.fn(async () => 1),
    addToFolder: vi.fn(async () => ({ ok: true })),
    notify: vi.fn(),
    now: vi.fn(() => 0),
    ready: vi.fn(async () => {}),
  };
}

describe("createSaveLinkHandler", () => {
  it("waits for the Library before saving", async () => {
    const d = deps();
    const gate = Promise.withResolvers<void>();
    d.ready.mockReturnValueOnce(gate.promise);
    const pending = createSaveLinkHandler(d)({
      url: "https://example.com/a",
      tags: [],
      folderId: null,
    });
    await Promise.resolve();
    expect(d.enqueue).not.toHaveBeenCalled();
    gate.resolve();
    await pending;
    expect(d.enqueue).toHaveBeenCalledOnce();
  });

  it("saves, tags, files, and notifies", async () => {
    const d = deps();
    const handle = createSaveLinkHandler(d);
    await handle({
      url: "https://example.com/a",
      tags: ["posters"],
      folderId: "01F",
    });
    expect(d.enqueue).toHaveBeenCalledWith("https://example.com/a", {
      trigger: "shortcut:save",
    });
    expect(d.addTags).toHaveBeenCalledWith(
      ["s1"],
      ["posters"],
      "shortcut:save",
    );
    expect(d.addToFolder).toHaveBeenCalledWith("01F", ["s1"]);
    expect(d.notify).toHaveBeenCalledWith("Saved to Pond", "example.com");
  });

  it("stops after 20 saves a minute", async () => {
    const d = deps();
    const handle = createSaveLinkHandler(d);
    for (let i = 0; i < 21; i++) {
      await handle({ url: `https://e.com/${i}`, tags: [], folderId: null });
    }
    expect(d.enqueue).toHaveBeenCalledTimes(20);
  });

  it("accepts saves again once the minute has passed", async () => {
    const d = deps();
    const handle = createSaveLinkHandler(d);
    for (let i = 0; i < 20; i++) {
      await handle({ url: `https://e.com/${i}`, tags: [], folderId: null });
    }
    d.now.mockReturnValue(60_000);
    await handle({ url: "https://e.com/late", tags: [], folderId: null });
    expect(d.enqueue).toHaveBeenCalledTimes(21);
  });

  it("notifies when the save fails", async () => {
    const d = deps();
    d.enqueue.mockRejectedValueOnce(new Error("unsupported"));
    await createSaveLinkHandler(d)({
      url: "https://e.com",
      tags: [],
      folderId: null,
    });
    expect(d.notify).toHaveBeenCalledWith("Pond can't save that link", "e.com");
  });
});
