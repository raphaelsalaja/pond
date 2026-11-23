import { describe, expect, it } from "vitest";
import type { QuickCaptureSnapshot } from "../../../../shared/quick-capture-contracts";
import { initialFields } from "./fields";

const snapshot: QuickCaptureSnapshot = {
  clipboard: "https://a.com",
  draft: null,
  folders: [
    { id: "f", name: "Moodboard", parentId: null, color: null, sortOrder: 0 },
  ],
  shell: {},
};

describe("initialFields", () => {
  it("starts from the clipboard when nothing was kept", () => {
    expect(initialFields(snapshot)).toEqual({
      text: "https://a.com",
      title: "",
      paths: [],
      folderId: null,
    });
  });

  it("restores the draft that was there when the window hid", () => {
    const draft = {
      text: "half a thought",
      title: "Idea",
      paths: ["/a.png"],
      folderId: "f",
    };
    expect(initialFields({ ...snapshot, clipboard: "", draft })).toEqual(draft);
  });

  it("drops a kept folder that no longer exists", () => {
    const draft = { text: "x", paths: [], folderId: "gone" };
    expect(initialFields({ ...snapshot, draft })).toEqual({
      text: "x",
      title: "",
      paths: [],
      folderId: null,
    });
  });
});
