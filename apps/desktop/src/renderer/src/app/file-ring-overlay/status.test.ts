import { describe, expect, it } from "vitest";
import { dropStatus } from "./status";

describe("overlay drop status", () => {
  it("confirms files saved to the folder", () => {
    expect(
      dropStatus(
        { ok: true, kind: "files", imported: 1, failed: 0 },
        "Moodboard",
      ),
    ).toEqual({
      detail: "Saved",
      announcement: { title: 'Saved to "Moodboard"' },
    });
  });

  it("counts links and partial failures", () => {
    expect(
      dropStatus({ ok: true, kind: "urls", imported: 2, failed: 0 }, "Refs")
        .detail,
    ).toBe("2 downloading");
    const partial = dropStatus(
      { ok: true, kind: "files", imported: 2, failed: 1 },
      "Refs",
    );
    expect(partial.detail).toBe("2 saved, 1 failed");
    expect(partial.announcement.description).toBe(
      "1 file couldn't be imported.",
    );
  });

  it("explains a drop it can't import and a folder that's gone", () => {
    expect(dropStatus(null, "Refs").detail).toBe("Can't import this");
    expect(
      dropStatus({ ok: false, reason: "folder_unavailable" }, "Refs").detail,
    ).toBe("Folder missing");
    expect(
      dropStatus({ ok: true, kind: "files", imported: 0, failed: 2 }, "Refs")
        .announcement.title,
    ).toBe('Couldn\'t save to "Refs"');
  });
});
