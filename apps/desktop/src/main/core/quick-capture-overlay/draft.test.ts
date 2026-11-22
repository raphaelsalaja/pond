import { describe, expect, it } from "vitest";
import { quickCaptureDraft } from "./draft";

const base = { text: "", paths: [], folderId: null };

describe("quickCaptureDraft", () => {
  it("turns a list of links into link Saves", () => {
    const draft = quickCaptureDraft(
      { ...base, text: " https://a.com/x \n\nhttp://b.com" },
      "id",
    );
    expect(draft.items).toEqual([
      { kind: "url", url: "https://a.com/x" },
      { kind: "url", url: "http://b.com/" },
    ]);
    expect(draft.trigger).toBe("quick-capture");
  });

  it("keeps mixed text exactly as typed in one note", () => {
    const text = "  read this\nhttps://a.com  ";
    expect(quickCaptureDraft({ ...base, text }, "id").items).toEqual([
      { kind: "note", text },
    ]);
  });

  it("does not treat other schemes as links", () => {
    expect(
      quickCaptureDraft({ ...base, text: "file:///etc/hosts" }, "id").items,
    ).toEqual([{ kind: "note", text: "file:///etc/hosts" }]);
  });

  it("adds a Save per file and files them in the chosen folder", () => {
    const draft = quickCaptureDraft(
      { ...base, paths: ["/a.png", "/b.pdf"], folderId: "f" },
      "id",
    );
    expect(draft.items).toEqual([
      { kind: "file", path: "/a.png" },
      { kind: "file", path: "/b.pdf" },
    ]);
    expect(draft.metadata).toEqual({ tags: [], folderIds: ["f"] });
  });

  it("locks a typed title on a single link so the import keeps it", () => {
    const draft = quickCaptureDraft(
      { ...base, text: "https://a.com", title: " Read Later " },
      "id",
    );
    expect(draft.items).toEqual([{ kind: "url", url: "https://a.com/" }]);
    expect(draft.metadata.title).toBe("Read Later");
  });

  it("titles a single item only", () => {
    expect(
      quickCaptureDraft({ ...base, text: "idea", title: " Idea " }, "id")
        .metadata.title,
    ).toBe("Idea");
    const draft = quickCaptureDraft(
      { ...base, text: "idea", paths: ["/a"], title: "T" },
      "id",
    );
    expect(draft.metadata.title).toBeUndefined();
    expect(draft.items.every((item) => item.title === undefined)).toBe(true);
  });

  it("rejects an empty capture", () => {
    expect(() => quickCaptureDraft({ ...base, text: "  " }, "id")).toThrow();
  });
});
