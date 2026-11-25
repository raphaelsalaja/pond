import { describe, expect, it } from "vitest";
import type { QuickCaptureSubmit } from "../../../shared/quick-capture-contracts";
import { keepableDraft, quickCapturePlan } from "./draft";

const base = { text: "", paths: [], folderId: null };

function noSave(): null {
  return null;
}

function draftOf(input: QuickCaptureSubmit) {
  const { draft } = quickCapturePlan(input, "id", noSave);
  if (!draft) throw new Error("Missing draft");
  return draft;
}

describe("quickCapturePlan", () => {
  it("turns a list of links into link Saves", () => {
    const draft = draftOf({
      ...base,
      text: " https://a.com/x \n\nhttp://b.com",
    });
    expect(draft.items).toEqual([
      { kind: "url", url: "https://a.com/x" },
      { kind: "url", url: "http://b.com/" },
    ]);
    expect(draft.trigger).toBe("quick-capture");
  });

  it("keeps mixed text exactly as typed in one note", () => {
    const text = "  read this\nhttps://a.com  ";
    expect(draftOf({ ...base, text }).items).toEqual([{ kind: "note", text }]);
  });

  it("does not treat other schemes as links", () => {
    expect(draftOf({ ...base, text: "file:///etc/hosts" }).items).toEqual([
      { kind: "note", text: "file:///etc/hosts" },
    ]);
  });

  it("adds a Save per file and files them in the chosen folder", () => {
    const draft = draftOf({
      ...base,
      paths: ["/a.png", "/b.pdf"],
      folderId: "f",
    });
    expect(draft.items).toEqual([
      { kind: "file", path: "/a.png" },
      { kind: "file", path: "/b.pdf" },
    ]);
    expect(draft.metadata).toEqual({ tags: [], folderIds: ["f"] });
  });

  it("locks a typed title on a single link so the import keeps it", () => {
    const draft = draftOf({
      ...base,
      text: "https://a.com",
      title: " Read Later ",
    });
    expect(draft.items).toEqual([{ kind: "url", url: "https://a.com/" }]);
    expect(draft.metadata.title).toBe("Read Later");
  });

  it("titles a single item only", () => {
    expect(
      draftOf({ ...base, text: "idea", title: " Idea " }).metadata,
    ).toEqual({ tags: [], folderIds: [], title: "Idea" });
    const draft = draftOf({
      ...base,
      text: "idea",
      paths: ["/a"],
      title: "T",
    });
    expect(draft.metadata.title).toBeUndefined();
    expect(draft.items.every((item) => item.title === undefined)).toBe(true);
  });

  it("files Saves dragged out of Pond instead of importing them again", () => {
    const plan = quickCapturePlan(
      {
        ...base,
        paths: ["/library/a.png", "/Desktop/b.png", "/library/a.png"],
        folderId: "f",
      },
      "id",
      (path) => (path.startsWith("/library/") ? "save-1" : null),
    );
    expect(plan.saveIds).toEqual(["save-1"]);
    expect(plan.draft?.items).toEqual([
      { kind: "file", path: "/Desktop/b.png" },
    ]);
  });

  it("needs no draft when every drop is a Pond Save", () => {
    const plan = quickCapturePlan(
      { ...base, paths: ["/library/a.png"], title: "T" },
      "id",
      () => "save-1",
    );
    expect(plan).toEqual({ draft: null, saveIds: ["save-1"] });
  });

  it("rejects an empty capture", () => {
    expect(() =>
      quickCapturePlan({ ...base, text: "  " }, "id", noSave),
    ).toThrow();
  });
});

describe("keepableDraft", () => {
  it("keeps anything typed or added", () => {
    const typed = { ...base, text: "half a thought" };
    expect(keepableDraft(typed)).toBe(typed);
    expect(keepableDraft({ ...base, title: "T" })).not.toBeNull();
    expect(keepableDraft({ ...base, paths: ["/a.png"] })).not.toBeNull();
  });

  it("drops a draft with nothing in it", () => {
    expect(
      keepableDraft({ ...base, text: "  ", title: " ", folderId: "f" }),
    ).toBeNull();
  });
});
