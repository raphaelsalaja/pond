import { describe, expect, it } from "vitest";
import { mergeWrittenFiles } from "./library";
import {
  applyPatchToInfo,
  type InfoFile,
  StoredInfoDocSchema,
} from "./library-format";

const original: InfoFile = {
  kind: "video",
  path: "clip.mp4",
  sha256: "original",
  size: 100,
  mimeType: "video/mp4",
  width: 1920,
  height: 1080,
  sourceUrl: "https://example.com/original.mp4",
};
describe("portable original manifest", () => {
  it("retains all originals when a new thumbnail is written", () => {
    const manifest = mergeWrittenFiles(
      [original],
      [{ filename: "cover.png", buf: Buffer.from("thumbnail") }],
    );
    expect(manifest[0]).toEqual(original);
    expect(manifest[1]).toMatchObject({
      kind: "image",
      path: "cover.png",
      size: 9,
    });
  });
  it("updates written bytes while retaining the supplied file role and metadata", () => {
    const manifest = mergeWrittenFiles(
      [original],
      [{ filename: "clip.mp4", buf: Buffer.from("replacement") }],
    );
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({
      ...original,
      size: 11,
      sha256: expect.not.stringMatching(/^original$/),
    });
  });
  it("persists explicit file changes and source URLs for index reconstruction", () => {
    const info = StoredInfoDocSchema.parse({
      id: "save",
      source: "local",
      sourceId: "save",
      url: "pond:save",
      files: [original],
    });
    const next = applyPatchToInfo(info, {
      files: [
        original,
        {
          kind: "media",
          path: "image.png",
          sha256: "image",
          size: 10,
          width: 30,
          height: 20,
          mimeType: "image/png",
        },
      ],
    });
    expect(StoredInfoDocSchema.parse(next).files).toEqual(next.files);
    expect(next.files[0]?.sourceUrl).toBe(original.sourceUrl);
    expect(applyPatchToInfo(next, { files: [] }).files).toEqual([]);
  });
  it("records Inbox state only while a Save is in the Inbox", () => {
    const info = StoredInfoDocSchema.parse({
      id: "save",
      source: "local",
      sourceId: "save",
      url: "pond:save",
      files: [],
    });
    expect(info.inbox).toBeUndefined();
    const until = Date.parse("2030-01-02T03:04:05.000Z");
    const snoozed = applyPatchToInfo(info, {
      inboxState: "snoozed",
      inboxUntil: until,
    });
    expect(snoozed.inbox).toEqual({
      state: "snoozed",
      until: "2030-01-02T03:04:05.000Z",
    });
    expect(StoredInfoDocSchema.parse(snoozed).inbox).toEqual(snoozed.inbox);
    expect(applyPatchToInfo(snoozed, { title: "Kept" }).inbox).toEqual(
      snoozed.inbox,
    );
    expect(
      applyPatchToInfo(snoozed, { inboxState: "processed", inboxUntil: null })
        .inbox,
    ).toEqual({ state: "processed" });
    expect(
      applyPatchToInfo(snoozed, { inboxState: null, inboxUntil: null }).inbox,
    ).toBeUndefined();
    expect(
      StoredInfoDocSchema.parse({ ...info, inbox: { state: "later" } }).inbox,
    ).toBeUndefined();
  });
});
