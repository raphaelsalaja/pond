import { readFile, stat } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { type MymindObject, MymindObjectSchema } from "./client";
import { importMymindObject, mergeMymindMetadata } from "./import";
import { createMymindSyncState } from "./state";

type ImportDependencies = NonNullable<Parameters<typeof importMymindObject>[1]>;

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
  const client = {
    getBlob: vi.fn(async () => new Response("file bytes")),
  };
  const persist = vi.fn(async () => {});
  const dependencies: ImportDependencies = {
    enqueueLink: vi.fn(async () => ({ id: "save", created: true })),
    isOwnedSave: vi.fn(async () => false),
    createSave: vi.fn<ImportDependencies["createSave"]>(async () => ({
      ok: true,
      id: "save",
    })),
    applyMetadata: vi.fn(async () => {}),
  };
  return {
    input: {
      object,
      accountId: "account",
      state,
      client,
      persist,
      beforeWrite: vi.fn(() => {}),
    },
    dependencies,
  };
}

describe("mymind card import", () => {
  it.each([undefined, " \t\n"])(
    "retries an empty card when content becomes available (%s)",
    async (emptyText) => {
      const { input, dependencies } = fixture({
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
      expect(dependencies.createSave).not.toHaveBeenCalled();
      expect(dependencies.enqueueLink).not.toHaveBeenCalled();
      expect(dependencies.applyMetadata).not.toHaveBeenCalled();
      expect(input.persist).not.toHaveBeenCalled();
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
    const { input, dependencies } = fixture();
    input.persist.mockRejectedValueOnce(new Error("Disk write failed."));
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "Disk write failed.",
    );
    expect(input.state.imports.card).toBeUndefined();
    dependencies.createSave = vi.fn<ImportDependencies["createSave"]>(
      async () => ({ ok: true, id: "save", skipped: true }),
    );
    dependencies.isOwnedSave = vi.fn(async () => true);
    await expect(importMymindObject(input, dependencies)).resolves.toEqual({
      id: "save",
      imported: true,
    });
    expect(input.state.imports.card?.complete).toBe(true);
  });
  it("keeps note content, tags, title, and save date", async () => {
    const { input, dependencies } = fixture();
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "save",
      imported: true,
    });
    expect(dependencies.createSave).toHaveBeenCalledWith({
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
    expect(input.client.getBlob).not.toHaveBeenCalled();
  });

  it("records a new link before it applies metadata", async () => {
    const { input, dependencies } = fixture({
      source: { url: "https://www.youtube.com/watch?v=example" },
    });
    const savedStates: boolean[] = [];
    input.persist.mockImplementation(async () => {
      savedStates.push(input.state.imports.card?.complete ?? false);
    });
    dependencies.applyMetadata = vi.fn(async () => {
      expect(savedStates).toEqual([false]);
    });
    await importMymindObject(input, dependencies);
    expect(dependencies.enqueueLink).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=example",
      "account",
    );
    expect(dependencies.applyMetadata).toHaveBeenCalledWith(
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
    const { input, dependencies } = fixture({ url: "https://example.com/" });
    dependencies.enqueueLink = vi.fn(async () => ({
      id: "existing",
      created: false,
    }));
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "existing",
      imported: false,
    });
    expect(dependencies.applyMetadata).not.toHaveBeenCalled();
    expect(input.state.imports.card).toEqual({
      saveId: "existing",
      complete: true,
    });
  });

  it("finishes an incomplete link after a metadata failure", async () => {
    const { input, dependencies } = fixture({ url: "https://example.com/" });
    dependencies.applyMetadata = vi.fn(async () => {
      throw new Error("metadata failure");
    });
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "metadata failure",
    );
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: false,
    });
    dependencies.applyMetadata = vi.fn(async () => {});
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "save",
      imported: true,
    });
    expect(dependencies.enqueueLink).toHaveBeenCalledTimes(1);
    expect(dependencies.applyMetadata).toHaveBeenCalledTimes(1);
    await importMymindObject(input, dependencies);
    expect(dependencies.applyMetadata).toHaveBeenCalledTimes(1);
  });

  it("recovers a new link when its first state write fails", async () => {
    const { input, dependencies } = fixture({ url: "https://example.com/" });
    input.persist.mockRejectedValueOnce(new Error("disk full"));
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "disk full",
    );
    expect(input.state.imports.card).toBeUndefined();
    expect(dependencies.applyMetadata).not.toHaveBeenCalled();
    dependencies.enqueueLink = vi.fn(async () => ({
      id: "save",
      created: false,
    }));
    dependencies.isOwnedSave = vi.fn(async () => true);
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "save",
      imported: true,
    });
    expect(dependencies.applyMetadata).toHaveBeenCalledTimes(1);
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: true,
    });
  });

  it("streams a file and removes its temporary copy after import", async () => {
    const { input, dependencies } = fixture({
      blob: { name: "..\\photo.png" },
      source: { url: "https://example.com/source" },
    });
    const bytes = new TextEncoder().encode("file bytes");
    input.client.getBlob.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.slice(0, 4));
              controller.enqueue(bytes.slice(4));
              controller.close();
            },
          }),
          { headers: { "content-type": "image/png" } },
        ),
    );
    let path = "";
    dependencies.createSave = vi.fn<ImportDependencies["createSave"]>(
      async (save) => {
        path = save.filePaths?.[0] ?? "";
        expect(path.endsWith("/photo.png")).toBe(true);
        expect(await readFile(path, "utf8")).toBe("file bytes");
        expect(save.url).toBe("https://example.com/source");
        return { ok: true, id: "file-save" };
      },
    );
    expect(await importMymindObject(input, dependencies)).toEqual({
      id: "file-save",
      imported: true,
    });
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(dependencies.enqueueLink).not.toHaveBeenCalled();
  });

  it("removes the temporary file when the import fails", async () => {
    const { input, dependencies } = fixture({ blob: { name: "file.pdf" } });
    let path = "";
    dependencies.createSave = vi.fn<ImportDependencies["createSave"]>(
      async (save) => {
        path = save.filePaths?.[0] ?? "";
        return { ok: false, error: "copy failed" };
      },
    );
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "could not be imported",
    );
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(input.state.imports.card).toBeUndefined();
  });

  it("stops before it imports a downloaded file into another library", async () => {
    const { input, dependencies } = fixture({ blob: { name: "file.pdf" } });
    let switched = false;
    input.client.getBlob.mockImplementation(async () => {
      switched = true;
      return new Response("file bytes");
    });
    input.beforeWrite.mockImplementation(() => {
      if (switched) throw new Error("The library changed.");
    });
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "The library changed.",
    );
    expect(dependencies.createSave).not.toHaveBeenCalled();
    expect(input.persist).not.toHaveBeenCalled();
  });

  it("retains an incomplete mapping when a library change stops metadata", async () => {
    const { input, dependencies } = fixture({ url: "https://example.com/" });
    input.persist.mockImplementation(async () => {
      input.beforeWrite.mockImplementation(() => {
        throw new Error("The library changed.");
      });
    });
    await expect(importMymindObject(input, dependencies)).rejects.toThrow(
      "The library changed.",
    );
    expect(input.state.imports.card).toEqual({
      saveId: "save",
      complete: false,
    });
    expect(dependencies.applyMetadata).not.toHaveBeenCalled();
  });

  it("rejects unsupported content before it imports anything", async () => {
    const { input, dependencies } = fixture({
      content: { type: "application/unsupported", body: { text: "note" } },
    });
    await expect(importMymindObject(input, dependencies)).rejects.toThrow();
    expect(dependencies.createSave).not.toHaveBeenCalled();
    expect(dependencies.enqueueLink).not.toHaveBeenCalled();
    expect(input.persist).not.toHaveBeenCalled();
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
