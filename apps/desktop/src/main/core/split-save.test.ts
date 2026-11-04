import { MANUAL_LIKELY_SENSITIVE_MODEL } from "@pond/schema/content-safety";
import type { NewSave, Save, SaveFile } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import { runSplitSave, type SplitSaveRuntime } from "./split-save";
import {
  buildOriginalPatch,
  buildSlideRows,
  narrowToSplit,
  planSaveSplit,
  postSourceId,
  retainCaptureMedia,
  slideSourceIds,
  splitsOnImport,
} from "./split-save-plan";

function file(
  kind: string,
  path: string,
  extra: Partial<SaveFile> = {},
): SaveFile {
  return { kind, path, sha256: `${path}-sha256-digest`, size: 10, ...extra };
}

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: "post-1",
    source: "instagram",
    url: "https://www.instagram.com/p/post-1/",
    media: [
      { url: "https://cdn.example/a.jpg", type: "image" },
      { url: "https://cdn.example/b.jpg", type: "image" },
      {
        url: "https://cdn.example/c.mp4",
        type: "video",
        posterUrl: "https://cdn.example/c.jpg",
      },
    ],
    ...overrides,
  };
}

function carousel(overrides: Partial<Save> = {}): Save {
  const savedAt = new Date("2026-10-01T12:00:00.000Z");
  return {
    id: "original",
    source: "instagram",
    sourceId: "post-1",
    accountId: "account-1",
    importedFrom: null,
    url: "https://www.instagram.com/p/post-1/",
    title: "Studio visit",
    description: "Three looks",
    author: "studio",
    lang: "en",
    siteName: "instagram.com",
    publishedAt: savedAt,
    notes: "Reference for the deck",
    mediaUrl: "https://cdn.example/a.jpg",
    mediaType: "image",
    rawJson: {
      capture: capture(),
      extractorId: "instagram",
      extractedAt: savedAt.toISOString(),
    },
    rawSlim: null,
    tags: ["Fashion", "Studio"],
    listKinds: ["saved"],
    files: [
      file("image", "media-1.jpg", {
        sourceUrl: "https://cdn.example/a.jpg",
        width: 1080,
        height: 1350,
      }),
      file("image", "media-2.jpg", { sourceUrl: "https://cdn.example/b.jpg" }),
      file("video", "video-1.mp4", { mimeType: "video/mp4" }),
      file("poster", "poster-1.jpg"),
      file("thumbnail", "media-1.jpg_thumbnail.webp"),
      file("avatar", "avatar.jpg"),
    ],
    coverIndex: 0,
    width: 1080,
    height: 1350,
    fileSize: 60,
    container: null,
    videoCodec: null,
    audioCodec: null,
    bitrate: null,
    colorSpace: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    focalLength: null,
    aperture: null,
    exposureTime: null,
    iso: null,
    takenAt: null,
    metadataVersion: 1,
    phash: "phash",
    blurhash: "blurhash",
    fontActivated: false,
    embedding: [0.1],
    embeddingModel: "text-1",
    caption: "A coat",
    captionModel: "caption-1",
    ocrText: null,
    ocrModel: "ocr-1",
    transcript: null,
    transcriptModel: "transcript-1",
    clipEmbedding: [0.2],
    clipModel: "clip-1",
    aesthetic: ["warm"],
    aestheticModel: "aesthetic-1",
    sensitiveScore: 0.9,
    sensitiveModel: "sensitive-1",
    autoTitleModel: null,
    suggestedTags: ["coat"],
    suggestedTagsModel: "tags-1",
    rating: 4,
    rotate: 0,
    flipX: false,
    flipY: false,
    crop: null,
    dominantColors: ["#112233"],
    primaryColor: "#112233",
    status: "complete",
    ingestStartedAt: savedAt,
    ingestCompletedAt: savedAt,
    deletedAt: null,
    savedAt,
    createdAt: savedAt,
    ...overrides,
  };
}

function imageCarousel(): Save {
  const save = carousel();
  return {
    ...save,
    rawJson: save.rawJson && {
      ...save.rawJson,
      capture: capture({ media: capture().media.slice(0, 2) }),
    },
    files: save.files.filter((entry) => !/video|poster/.test(entry.path)),
  };
}

function sequentialIds() {
  let next = 0;
  return () => `slide-${++next}`;
}

function paths(files: readonly SaveFile[] | undefined): string[] {
  return (files ?? []).map((entry) => entry.path);
}

describe("planSaveSplit", () => {
  it("keeps the first slide and pairs each video with its poster", () => {
    const plan = planSaveSplit(carousel());
    expect(plan?.postSourceId).toBe("post-1");
    expect(paths(plan?.keep.files)).toEqual(["media-1.jpg"]);
    expect(plan?.slides.map((slide) => paths(slide.files))).toEqual([
      ["media-2.jpg"],
      ["video-1.mp4", "poster-1.jpg"],
    ]);
    expect(plan?.slides.map((slide) => slide.mediaIndex)).toEqual([1, 2]);
    expect(plan?.keepMedia).toEqual([0]);
  });

  it("leaves thumbnails, avatars, and rendered post cards on the original", () => {
    const plan = planSaveSplit({
      ...carousel(),
      files: [
        ...carousel().files,
        file("tweet_screenshot_light", "post-light.png"),
      ],
    });
    const moved = plan?.slides.flatMap((slide) => paths(slide.files));
    expect(moved).not.toContain("avatar.jpg");
    expect(moved).not.toContain("media-1.jpg_thumbnail.webp");
    expect(moved).not.toContain("post-light.png");
  });

  it("returns nothing for a save with one image or video", () => {
    expect(
      planSaveSplit({
        ...carousel(),
        files: [file("image", "media-1.jpg"), file("avatar", "avatar.jpg")],
      }),
    ).toBeNull();
  });

  it("orders slides by the post when files were written out of order", () => {
    const save = imageCarousel();
    const plan = planSaveSplit({ ...save, files: [...save.files].reverse() });
    expect(paths(plan?.keep.files)).toEqual(["media-1.jpg"]);
    expect(plan?.slides.map((slide) => paths(slide.files))).toEqual([
      ["media-2.jpg"],
    ]);
  });

  it("keeps undownloaded capture media with the original", () => {
    const save = carousel();
    const plan = planSaveSplit({
      ...save,
      files: save.files.filter((entry) => entry.path !== "media-2.jpg"),
    });
    expect(plan?.slides.map((slide) => slide.mediaIndex)).toEqual([2]);
    expect(plan?.keepMedia).toEqual([0, 1]);
  });

  it("splits a save again under the same post", () => {
    const save = carousel();
    const plan = planSaveSplit({
      ...save,
      sourceId: "post-1 already-split",
      rawJson: save.rawJson && {
        ...save.rawJson,
        split: { sourceId: "post-1", media: [0, 1, 2] },
      },
    });
    expect(plan?.postSourceId).toBe("post-1");
  });
});

describe("slide Source IDs", () => {
  it("never equals the post's Source ID, so sync dedupe still finds the original", () => {
    const plan = planSaveSplit(carousel());
    if (!plan) throw new Error("Expected a plan.");
    const ids = slideSourceIds(plan);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(id).not.toBe("post-1");
      expect(id.startsWith("post-1 ")).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays unique when two slides hold identical bytes", () => {
    const save = carousel();
    const plan = planSaveSplit({
      ...save,
      files: [
        file("image", "media-1.jpg"),
        file("image", "media-2.jpg", { sha256: "same" }),
        file("image", "media-3.jpg", { sha256: "same" }),
      ],
    });
    if (!plan) throw new Error("Expected a plan.");
    const ids = slideSourceIds(plan);
    expect(new Set(ids).size).toBe(2);
  });

  it("reads the post's Source ID from split provenance", () => {
    const save = carousel();
    expect(postSourceId(save)).toBe("post-1");
    expect(
      postSourceId({
        sourceId: "post-1 abc",
        rawJson: save.rawJson && {
          ...save.rawJson,
          split: { sourceId: "post-1", media: [1] },
        },
      }),
    ).toBe("post-1");
  });
});

describe("capture narrowing", () => {
  it("keeps only the chosen media across quoted posts", () => {
    const narrowed = retainCaptureMedia(
      capture({
        media: [{ url: "https://cdn.example/a.jpg", type: "image" }],
        quoted: capture({
          id: "post-2",
          media: [{ url: "https://cdn.example/q.jpg", type: "image" }],
        }),
      }),
      [1],
    );
    expect(narrowed.media).toEqual([]);
    expect(narrowed.quoted?.media.map((entry) => entry.url)).toEqual([
      "https://cdn.example/q.jpg",
    ]);
  });

  it("narrows a fresh harvest to a slide's media and keeps its provenance", () => {
    const save = carousel();
    if (!save.rawJson) throw new Error("Expected raw JSON.");
    const split = { sourceId: "post-1", media: [2] };
    const narrowed = narrowToSplit(save.rawJson, split);
    expect(narrowed.capture.media.map((entry) => entry.url)).toEqual([
      "https://cdn.example/c.mp4",
    ]);
    expect(narrowed.split).toEqual(split);
    expect(narrowToSplit(save.rawJson, undefined)).toBe(save.rawJson);
  });
});

describe("buildSlideRows", () => {
  it("copies the post's metadata and starts each slide unenriched", () => {
    const save = carousel();
    const plan = planSaveSplit(save);
    if (!plan) throw new Error("Expected a plan.");
    const [image, video] = buildSlideRows(save, plan, sequentialIds());
    expect(image).toMatchObject({
      id: "slide-1",
      source: "instagram",
      accountId: "account-1",
      url: save.url,
      title: "Studio visit",
      notes: "Reference for the deck",
      tags: ["Fashion", "Studio"],
      listKinds: ["saved"],
      rating: 4,
      status: "ingesting",
      files: [],
      mediaType: "image",
      mediaUrl: "https://cdn.example/b.jpg",
    });
    expect(image?.captionModel ?? null).toBeNull();
    expect(image?.clipEmbedding ?? null).toBeNull();
    expect(image?.rawJson?.split).toEqual({ sourceId: "post-1", media: [1] });
    expect(image?.rawJson?.capture.media.map((entry) => entry.url)).toEqual([
      "https://cdn.example/b.jpg",
    ]);
    expect(video?.mediaType).toBe("video");
    expect(video?.rawJson?.split).toEqual({ sourceId: "post-1", media: [2] });
  });

  it("sorts slides right after the original in Date Saved order", () => {
    const save = carousel();
    const plan = planSaveSplit(save);
    if (!plan) throw new Error("Expected a plan.");
    const rows = buildSlideRows(save, plan, sequentialIds());
    const times = rows.map((row) => row.savedAt?.getTime() ?? 0);
    expect(times[0]).toBeLessThan(save.savedAt.getTime());
    expect(times[1]).toBeLessThan(times[0] ?? 0);
    expect(rows.every((row) => row.createdAt === save.createdAt)).toBe(true);
  });

  it("keeps a model's sensitive score until the slide is scored on its own", () => {
    const save = carousel();
    const plan = planSaveSplit(save);
    if (!plan) throw new Error("Expected a plan.");
    const [row] = buildSlideRows(save, plan, sequentialIds());
    expect(row).toMatchObject({ sensitiveScore: 0.9, sensitiveModel: null });
    const manual = { ...save, sensitiveModel: MANUAL_LIKELY_SENSITIVE_MODEL };
    const [manualRow] = buildSlideRows(manual, plan, sequentialIds());
    expect(manualRow?.sensitiveModel).toBe(MANUAL_LIKELY_SENSITIVE_MODEL);
  });

  it("gives a local slide its own local URL", () => {
    const save = carousel({
      source: "local",
      sourceId: "original",
      url: "pond:local/original",
      rawJson: null,
    });
    const plan = planSaveSplit(save);
    if (!plan) throw new Error("Expected a plan.");
    const [row] = buildSlideRows(save, plan, sequentialIds());
    expect(row?.url).toBe("pond:local/slide-1");
    expect(row?.rawJson).toBeNull();
  });
});

describe("buildOriginalPatch", () => {
  it("drops moved files and keeps the kept slide's thumbnail", () => {
    const save = imageCarousel();
    const plan = planSaveSplit(save);
    if (!plan) throw new Error("Expected a plan.");
    const { patch, removed } = buildOriginalPatch(save, plan);
    expect(paths(removed)).toEqual(["media-2.jpg"]);
    expect(paths(patch.files)).toEqual([
      "media-1.jpg",
      "media-1.jpg_thumbnail.webp",
      "avatar.jpg",
    ]);
    expect(patch.rawJson?.split).toEqual({ sourceId: "post-1", media: [0] });
    expect(patch.blurhash).toBeUndefined();
    expect(patch.captionModel).toBeUndefined();
  });

  it("resets media enrichments when the save's primary video moves out", () => {
    const save = carousel();
    const plan = planSaveSplit(save);
    if (!plan) throw new Error("Expected a plan.");
    const { patch } = buildOriginalPatch(save, plan);
    expect(patch).toMatchObject({
      mediaType: "image",
      captionModel: null,
      clipModel: null,
      transcriptModel: null,
      sensitiveModel: null,
    });
  });

  it("removes a thumbnail drawn from a moved file and resets the card colors", () => {
    const save = imageCarousel();
    const files = save.files.map((entry) =>
      entry.kind === "thumbnail"
        ? file("thumbnail", "media-2.jpg_thumbnail.webp")
        : entry,
    );
    const moved = { ...save, files };
    const plan = planSaveSplit(moved);
    if (!plan) throw new Error("Expected a plan.");
    const { patch, removed } = buildOriginalPatch(moved, plan);
    expect(paths(removed)).toEqual([
      "media-2.jpg",
      "media-2.jpg_thumbnail.webp",
    ]);
    expect(patch).toMatchObject({ blurhash: null, dominantColors: [] });
  });

  it("keeps a custom thumbnail", () => {
    const save = imageCarousel();
    const files = save.files.map((entry) =>
      entry.kind === "thumbnail"
        ? file("thumbnail", "media-2.jpg_thumbnail.webp", { custom: true })
        : entry,
    );
    const plan = planSaveSplit({ ...save, files });
    if (!plan) throw new Error("Expected a plan.");
    const { removed } = buildOriginalPatch({ ...save, files }, plan);
    expect(paths(removed)).toEqual(["media-2.jpg"]);
  });
});

describe("splitsOnImport", () => {
  it("splits only a multi-media save's first ingest when the setting is on", () => {
    const fresh = carousel({ status: "ingesting" });
    expect(splitsOnImport(fresh, true)).toBe(true);
    expect(splitsOnImport(fresh, false)).toBe(false);
    const refreshed = {
      ...fresh,
      ingestStartedAt: new Date(fresh.createdAt.getTime() + 60_000),
    };
    expect(splitsOnImport(refreshed, true)).toBe(false);
    const single = { ...fresh, files: [file("image", "media-1.jpg")] };
    expect(splitsOnImport(single, true)).toBe(false);
  });
});

function fakeLibrary(initial: Save) {
  const library = { original: initial };
  const slides = new Map<string, NewSave>();
  const copies = new Map<string, string[]>();
  const memberships: string[] = [];
  const discarded: string[] = [];
  const updates: string[] = [];
  let failCopyOn: string | null = null;
  const runtime: SplitSaveRuntime = {
    async read(id) {
      return id === library.original.id ? library.original : null;
    },
    async findSlide(row) {
      for (const [id, existing] of slides)
        if (existing.sourceId === row.sourceId) return id;
      return null;
    },
    async create(row) {
      if (row.id) slides.set(row.id, row);
    },
    async copyFiles(_from, to, files) {
      if (to === failCopyOn) return 0;
      copies.set(to, paths(files));
      return files.length;
    },
    async copyMemberships(_from, to) {
      memberships.push(to);
    },
    async discard(ids) {
      discarded.push(...ids);
      for (const id of ids) slides.delete(id);
    },
    async updateOriginal(id, { patch }) {
      updates.push(id);
      library.original = {
        ...library.original,
        files: patch.files ?? library.original.files,
        rawJson: patch.rawJson ?? library.original.rawJson,
      };
    },
    async refresh() {},
    newId: sequentialIds(),
  };
  return {
    get original() {
      return library.original;
    },
    slides,
    copies,
    memberships,
    discarded,
    updates,
    runtime,
    failCopy(id: string) {
      failCopyOn = id;
    },
  };
}

describe("runSplitSave", () => {
  it("copies each slide into its own save before changing the original", async () => {
    const library = fakeLibrary(carousel());
    const result = await runSplitSave("original", "user", library.runtime);
    expect(result).toEqual({ ok: true, created: ["slide-1", "slide-2"] });
    expect(Object.fromEntries(library.copies)).toEqual({
      "slide-1": ["media-2.jpg"],
      "slide-2": ["video-1.mp4", "poster-1.jpg"],
    });
    expect(library.memberships).toEqual(["slide-1", "slide-2"]);
    expect(library.updates).toEqual(["original"]);
    expect(paths(library.original.files)).toEqual([
      "media-1.jpg",
      "media-1.jpg_thumbnail.webp",
      "avatar.jpg",
    ]);
  });

  it("leaves the original whole and removes new slides when a copy fails", async () => {
    const library = fakeLibrary(carousel());
    library.failCopy("slide-2");
    await expect(
      runSplitSave("original", "user", library.runtime),
    ).rejects.toThrow();
    expect(library.updates).toEqual([]);
    expect(library.discarded).toEqual(["slide-1", "slide-2"]);
    expect(paths(library.original.files)).toHaveLength(6);
  });

  it("reuses a slide a failed split already created", async () => {
    const library = fakeLibrary(carousel());
    const plan = planSaveSplit(carousel());
    if (!plan) throw new Error("Expected a plan.");
    const [leftover] = buildSlideRows(carousel(), plan, () => "leftover");
    if (!leftover) throw new Error("Expected a slide.");
    library.slides.set("leftover", leftover);
    const result = await runSplitSave("original", "user", library.runtime);
    expect(result.ok && result.created).toEqual(["leftover", "slide-2"]);
    expect([...library.slides.keys()]).toEqual(["leftover", "slide-2"]);
  });

  it("finds nothing more to split once a save holds one slide", async () => {
    const library = fakeLibrary(carousel());
    await runSplitSave("original", "user", library.runtime);
    const again = await runSplitSave("original", "user", library.runtime);
    expect(again).toEqual({ ok: false, reason: "single" });
  });

  it("splits an ingesting save only from the pipeline", async () => {
    const ingesting = carousel({ status: "ingesting" });
    const user = await runSplitSave(
      "original",
      "user",
      fakeLibrary(ingesting).runtime,
    );
    expect(user).toEqual({ ok: false, reason: "missing" });
    const system = await runSplitSave(
      "original",
      "system",
      fakeLibrary(ingesting).runtime,
    );
    expect(system.ok).toBe(true);
  });

  it("skips saves in Trash", async () => {
    const library = fakeLibrary(carousel({ deletedAt: new Date() }));
    expect(await runSplitSave("original", "user", library.runtime)).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});
