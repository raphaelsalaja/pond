import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MymindObjectSchema } from "./client";
import type { MymindObject } from "./client";
import { importMymindObject, mergeMymindMetadata } from "./import";
import { createMymindSyncState } from "./state";

type ImportDependencies = NonNullable<Parameters<typeof importMymindObject>[1]>;

interface ImportEffects {
  getBlob: () => Promise<Response>;
  persist: () => Promise<void>;
  beforeWrite: () => void;
}

function failingOnce(error: Error): () => Promise<void> {
  let failed = false;
  return async () => {
    if (!failed) {
      failed = true;
      throw error;
    }
  };
}

function fixture(patch: Partial<MymindObject> = {}) {
  const object = MymindObjectSchema.parse({
    id: "card",
    title: "My title",
    content: { type: "text/markdown", body: "Saved **content**" },
    notes: [{ content: { type: "text/markdown", body: "My note" } }],
    tags: [{ name: "ideas" }],
    created: "2026-11-06T12:00:00Z",
    ...patch,
  });
  const state = createMymindSyncState(Date.parse(object.created) - 1000);
  const effects: ImportEffects = {
    getBlob: async () => new Response("file bytes"),
    persist: async () => {},
    beforeWrite: () => {},
  };
  const behavior: ImportDependencies = {
    enqueueLink: async () => ({ id: "save", created: true }),
    isOwnedSave: async () => false,
    createSave: async () => ({ ok: true, id: "save" }),
    applyMetadata: async () => {},
  };
  const client = { getBlob: () => effects.getBlob() };
  const input = {
    object,
    accountId: "account",
    state,
    client,
    persist: () => effects.persist(),
    beforeWrite: () => effects.beforeWrite(),
  };
  const dependencies: ImportDependencies = {
    enqueueLink: (...args) => behavior.enqueueLink(...args),
    isOwnedSave: (...args) => behavior.isOwnedSave(...args),
    createSave: (...args) => behavior.createSave(...args),
    applyMetadata: (...args) => behavior.applyMetadata(...args),
  };
  return {
    input,
    effects,
    behavior,
    dependencies,
    spy: {
      getBlob: vi.spyOn(client, "getBlob"),
      persist: vi.spyOn(input, "persist"),
      beforeWrite: vi.spyOn(input, "beforeWrite"),
      enqueueLink: vi.spyOn(dependencies, "enqueueLink"),
      createSave: vi.spyOn(dependencies, "createSave"),
      applyMetadata: vi.spyOn(dependencies, "applyMetadata"),
    },
  };
}

describe("mymind card import", () => {
  it.each([undefined, " \t\n"])(
    "retries an empty card when content becomes available (%s)",
    async (emptyText) => {
      const { input, dependencies, spy } = fixture({
        title: emptyText,
        content:
          emptyText === undefined
            ? undefined
            : { type: "text/markdown", body: emptyText },
        notes: [],
      });
      const checkedThrough = input.state.checkedThrough;
      await expect(importMymindObject(input, dependencies)).rejects.toThrow(
        "The mymind card is empty.",
      );
      expect(spy.createSave).not.toHaveBeenCalled();
      expect(spy.enqueueLink).not.toHaveBeenCalled();
      expect(spy.applyMetadata).not.toHaveBeenCalled();
      expect(spy.persist).not.toHaveBeenCalled();
      expect(input.state.imports.card).toBeUndefined();
      expect(input.state.checkedThrough).toBe(checkedThrough);

      input.object.content = { type: "text/markdown", body: "Ready to save" };
      await expect(importMymindObject(input, dependencies)).resolves.toEqual({
        id: "save",
        imported: true,
      });
      expect(input.state.imports.card?.complete).toBe(true);
    },
  );

  it("finishes an owned note after its state write failed", async () => {
    const { input, effects, behavior, dependencies } = fixture();
    effects.persist = failingOnce(new Error("Disk write failed."));
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "Disk write failed.",
    );
    expect(input.state.imports.card).toBeUndefined();
    behavior.createSave = async () => ({ ok: true, id: "save", skipped: true });
    behavior.isOwnedSave = async () => true;
    await expect(importMymindObject(input, dependencies)).resolves.toEqual({
      id: "save",
      imported: true,
    });
    expect(input.state.imports.card?.complete).toBe(true);
  });
  it("keeps note content, tags, title, and save date", async () => {
    const { input, dependencies, spy } = fixture();
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "save",
      imported: true,
    });
    expect(spy.createSave).toHaveBeenCalledWith({
      accountId: "account",
      source: "local",
      sourceId: "mymind:card",
      importedFrom: "mymind",
      title: "My title",
      note: "Saved **content**\n\nMy note",
      tags: ["ideas", "mymind"],
      createdAt: new Date(input.object.created),
      savedAt: new Date(input.object.created),
      url: undefined,
      mediaType: "text",
    });
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: true,
    });
    expect(spy.getBlob).not.toHaveBeenCalled();
  });

  it("records a new link before it applies metadata", async () => {
    const { input, effects, behavior, dependencies, spy } = fixture({
      source: { url: "https://www.youtube.com/watch?v=example" },
    });
    const savedStates: Array<boolean> = [];
    effects.persist = async () => {
      savedStates.push(input.state.imports.card?.complete ?? false);
    };
    const savedBeforeMetadata: Array<Array<boolean>> = [];
    behavior.applyMetadata = async () => {
      savedBeforeMetadata.push([...savedStates]);
    };
    await importMymindObject(input, dependencies);
    expect(savedBeforeMetadata).toEqual([[false]]);
    expect(spy.enqueueLink).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=example",
      "account",
    );
    expect(spy.applyMetadata).toHaveBeenCalledWith(
      "save",
      {
        title: "My title",
        notes: "Saved **content**\n\nMy note",
        tags: ["ideas", "mymind"],
        createdAt: new Date(input.object.created),
        savedAt: new Date(input.object.created),
      },
      input.beforeWrite,
    );
    expect(savedStates).toEqual([false, true]);
  });

  it("records an existing link without changing its metadata", async () => {
    const { input, behavior, dependencies, spy } = fixture({
      url: "https://example.com/",
    });
    behavior.enqueueLink = async () => ({
      id: "existing",
      created: false,
    });
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "existing",
      imported: false,
    });
    expect(spy.applyMetadata).not.toHaveBeenCalled();
    expect(input.state.imports.card).toEqual({
      saveId: "existing",
      complete: true,
    });
  });

  it("finishes an incomplete link after a metadata failure", async () => {
    const { input, behavior, dependencies, spy } = fixture({
      url: "https://example.com/",
    });
    behavior.applyMetadata = async () => {
      throw new Error("metadata failure");
    };
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "metadata failure",
    );
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: false,
    });
    behavior.applyMetadata = async () => {};
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "save",
      imported: true,
    });
    expect(spy.enqueueLink).toHaveBeenCalledTimes(1);
    expect(spy.applyMetadata).toHaveBeenCalledTimes(2);
    await importMymindObject(input, dependencies);
    expect(spy.applyMetadata).toHaveBeenCalledTimes(2);
  });

  it("recovers a new link when its first state write fails", async () => {
    const { input, effects, behavior, dependencies, spy } = fixture({
      url: "https://example.com/",
    });
    effects.persist = failingOnce(new Error("disk full"));
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "disk full",
    );
    expect(input.state.imports.card).toBeUndefined();
    expect(spy.applyMetadata).not.toHaveBeenCalled();
    behavior.enqueueLink = async () => ({
      id: "save",
      created: false,
    });
    behavior.isOwnedSave = async () => true;
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "save",
      imported: true,
    });
    expect(spy.applyMetadata).toHaveBeenCalledTimes(1);
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: true,
    });
  });

  it("streams a file and removes its temporary copy after import", async () => {
    const { input, effects, behavior, dependencies, spy } = fixture({
      blob: { name: String.raw`..\photo.png` },
      source: { url: "https://example.com/source" },
    });
    const bytes = new TextEncoder().encode("file bytes");
    effects.getBlob = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 4));
            controller.enqueue(bytes.slice(4));
            controller.close();
          },
        }),
        { headers: { "content-type": "image/png" } },
      );
    let path = "";
    let contents = "";
    let url: string | null | undefined;
    behavior.createSave = async (save) => {
      path = save.filePaths?.[0] ?? "";
      contents = await readFile(path, "utf8");
      url = save.url;
      return { ok: true, id: "file-save" };
    };
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "file-save",
      imported: true,
    });
    expect(basename(path)).toBe("photo.png");
    expect(contents).toBe("file bytes");
    expect(url).toBe("https://example.com/source");
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(spy.enqueueLink).not.toHaveBeenCalled();
  });

  it("removes the temporary file when the import fails", async () => {
    const { input, behavior, dependencies } = fixture({
      blob: { name: "file.pdf" },
    });
    let path = "";
    behavior.createSave = async (save) => {
      path = save.filePaths?.[0] ?? "";
      return { ok: false, error: "copy failed" };
    };
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "could not be imported",
    );
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(input.state.imports.card).toBeUndefined();
  });

  it("stops before it imports a downloaded file into another library", async () => {
    const { input, effects, dependencies, spy } = fixture({
      blob: { name: "file.pdf" },
    });
    let switched = false;
    effects.getBlob = async () => {
      switched = true;
      return new Response("file bytes");
    };
    effects.beforeWrite = () => {
      if (switched) {
        throw new Error("The library changed.");
      }
    };
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "The library changed.",
    );
    expect(spy.createSave).not.toHaveBeenCalled();
    expect(spy.persist).not.toHaveBeenCalled();
  });

  it("retains an incomplete mapping when a library change stops metadata", async () => {
    const { input, effects, dependencies, spy } = fixture({
      url: "https://example.com/",
    });
    effects.persist = async () => {
      effects.beforeWrite = () => {
        throw new Error("The library changed.");
      };
    };
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "The library changed.",
    );
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: false,
    });
    expect(spy.applyMetadata).not.toHaveBeenCalled();
  });

  it("rejects unsupported content before it imports anything", async () => {
    const { input, dependencies, spy } = fixture({
      content: { type: "application/unsupported", body: { text: "note" } },
    });
    await expect(importMymindObject(input, dependencies)).rejects.toThrow();
    expect(spy.createSave).not.toHaveBeenCalled();
    expect(spy.enqueueLink).not.toHaveBeenCalled();
    expect(spy.persist).not.toHaveBeenCalled();
  });

  it("keeps user notes and tags when it retries imported metadata", () => {
    const incoming = {
      title: "Imported title",
      notes: "Imported content\n\nImported note",
      tags: ["ideas", "mymind"],
      createdAt: new Date(0),
      savedAt: new Date(0),
    };
    const first = mergeMymindMetadata(
      {
        notes: "My later note",
        tags: ["personal", "ideas"],
      },
      incoming,
    );
    expect(first.notes).toBe(
      "My later note\n\nImported content\n\nImported note",
    );
    expect(first.tags).toEqual(["personal", "ideas", "mymind"]);
    expect(
      mergeMymindMetadata(
        { notes: first.notes ?? null, tags: first.tags },
        incoming,
      ),
    ).toEqual(first);
    expect(mergeMymindMetadata({ notes: null, tags: [] }, incoming)).toEqual(
      incoming,
    );
  });
});
