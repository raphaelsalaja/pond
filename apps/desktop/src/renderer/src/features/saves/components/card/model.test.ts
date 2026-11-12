import { describe, expect, it } from "vitest";
import type { DisplayPrefs } from "@/features/saves/state/display-prefs";
import type { Save } from "@/features/saves/types";
import { formatAbsolute } from "@/shared/lib/format";
import { buildSaveCardModel } from "./model";

const display: DisplayPrefs = {
  name: true,
  date: true,
  fileCount: true,
  source: true,
  type: true,
};

function save(partial: Partial<Save> & { id: string }): Save {
  return {
    url: "https://example.com",
    title: "Example",
    description: null,
    author: null,
    notes: "Keep this",
    source: "twitter",
    sourceId: "",
    accountId: null,
    mediaUrl: null,
    mediaType: null,
    fileSize: null,
    width: 1200,
    height: 800,
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    coverIndex: 0,
    files: [
      {
        path: "first.jpg",
        kind: "media",
        mimeType: "image/jpeg",
        sha256: "",
        size: 0,
        width: 1200,
        height: 800,
      },
      {
        path: "second.jpg",
        kind: "media",
        mimeType: "image/jpeg",
        sha256: "",
        size: 0,
        width: 800,
        height: 1200,
      },
    ],
    tags: [],
    ...partial,
  };
}

describe("buildSaveCardModel", () => {
  it("derives metadata and overlays once for every presentation", () => {
    const model = buildSaveCardModel(save({ id: "a" }), {}, display, 1.5);

    expect(model.aspect).toBe(1.5);
    expect(model.title).toBe("Example");
    expect(model.time).not.toBeNull();
    expect(model.overlay.type).toEqual({ label: "JPG", kind: "image" });
    expect(model.overlay.source?.label).toBe("Twitter");
    expect(model.overlay.fileCount).toBe(2);
  });

  it("puts the selected item info on the line under the title", () => {
    const savedAt = Date.UTC(2025, 8, 26, 11, 57);
    const createdAt = Date.UTC(2024, 0, 2, 8, 0);
    const publishedAt = Date.UTC(2019, 4, 12, 18, 30);
    const sample = save({
      id: "info",
      savedAt,
      createdAt,
      publishedAt,
      fileSize: 2048,
      rating: 4,
      tags: ["Lookbook", "Studio"],
    });

    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "created",
        visible: true,
      }).time,
    ).toBe(formatAbsolute(savedAt));
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "modified",
        visible: true,
      }).time,
    ).toBe(formatAbsolute(createdAt));
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "published",
        visible: true,
      }).time,
    ).toBe(formatAbsolute(publishedAt));
    expect(
      buildSaveCardModel(
        save({ id: "unpublished", publishedAt: null }),
        {},
        display,
        1.5,
        { field: "published", visible: true },
      ).time,
    ).toBe("—");
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "dimensions",
        visible: true,
      }).time,
    ).toBe("1200 × 800");
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "fileSize",
        visible: true,
      }).time,
    ).toBe("2 KiB");
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "tags",
        visible: true,
      }).time,
    ).toBe("Lookbook, Studio");
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "rating",
        visible: true,
      }).time,
    ).toBe("4");
    expect(
      buildSaveCardModel(sample, {}, display, 1.5, {
        field: "tags",
        visible: false,
      }).time,
    ).toBeNull();
  });

  it("omits chrome disabled by display preferences", () => {
    const hidden: DisplayPrefs = {
      name: false,
      date: false,
      fileCount: false,
      source: false,
      type: false,
    };
    const model = buildSaveCardModel(save({ id: "b" }), {}, hidden, 1);

    expect(model.title).toBeNull();
    expect(model.time).toBeNull();
    expect(model.overlay.type).toBeNull();
    expect(model.overlay.source).toBeNull();
    expect(model.overlay.fileCount).toBeNull();
  });

  it("uses a portrait page inside the container for dimensionless documents", () => {
    const model = buildSaveCardModel(
      save({
        id: "document",
        width: null,
        height: null,
        files: [
          {
            path: "Untitled.docx",
            kind: "media",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sha256: "",
            size: 0,
            width: null,
            height: null,
          },
        ],
      }),
      {},
      display,
      1,
    );

    expect(model.aspect).toBeCloseTo(8.5 / 11);
  });

  it("uses exact media dimensions for the fitted preview", () => {
    const model = buildSaveCardModel(
      save({
        id: "narrow",
        width: 100,
        height: 1000,
        files: [
          {
            path: "narrow.jpg",
            kind: "media",
            mimeType: "image/jpeg",
            sha256: "",
            size: 0,
            width: 100,
            height: 1000,
          },
        ],
      }),
      {},
      display,
      0.4,
    );

    expect(model.aspect).toBe(0.1);
  });

  it("swaps the grid aspect after a quarter turn", () => {
    const model = buildSaveCardModel(
      save({ id: "turned", rotate: 90 }),
      {},
      display,
      1.5,
    );

    expect(model.aspect).toBeCloseTo(800 / 1200);
  });

  it("keeps the grid aspect after a half turn", () => {
    const model = buildSaveCardModel(
      save({ id: "half", rotate: 180 }),
      {},
      display,
      1.5,
    );
    expect(model.aspect).toBe(1.5);
  });
});
