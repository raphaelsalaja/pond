import { MANUAL_LIKELY_SENSITIVE_MODEL } from "@pond/schema/content-safety";
import type { NewSave, Save } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { runGroupSaves } from "./group-saves";
import type { GroupSavesRuntime } from "./group-saves";
import { canGroupMember, groupFiles, planGroup } from "./group-saves-plan";
import type { GroupFile } from "./group-saves-plan";
import { carousel, file } from "./split-save.fixtures";

function photo(id: string, overrides: Partial<Save> = {}): Save {
  return carousel({
    id,
    source: "local",
    sourceId: id,
    url: `pond:local/${id}`,
    title: null,
    notes: null,
    tags: [],
    rating: null,
    sensitiveScore: null,
    sensitiveModel: null,
    files: [file("image", `${id}.jpg`, { width: 800, height: 600 })],
    ...overrides,
  });
}

function reel(): Save {
  return carousel({
    id: "reel",
    files: [
      file("video", "video-1.mp4", { mimeType: "video/mp4" }),
      file("image", "media-1.jpg"),
      file("avatar", "avatar.jpg"),
    ],
  });
}

function names(files: ReadonlyArray<GroupFile>): Array<string> {
  return files.map((entry) => entry.filename);
}

describe("groupFiles", () => {
  it("joins members in the given order with posters after the slides", () => {
    const files = groupFiles([carousel(), photo("b")]);
    expect(names(files)).toEqual([
      "media-1.jpg",
      "media-2.jpg",
      "video-1.mp4",
      "b.jpg",
      "poster-1.jpg",
    ]);
    expect(files.map((entry) => entry.from)).toEqual([
      "original",
      "original",
      "original",
      "b",
      "original",
    ]);
    expect(files.at(-1)?.file.kind).toBe("poster");
  });

  it("leaves thumbnails and avatars behind", () => {
    const files = groupFiles([carousel(), photo("b")]);
    expect(names(files)).not.toContain("media-1.jpg_thumbnail.webp");
    expect(names(files)).not.toContain("avatar.jpg");
  });

  it("uses a harvested post's lone image as its video's poster", () => {
    const files = groupFiles([reel(), photo("b")]);
    expect(names(files)).toEqual(["video-1.mp4", "b.jpg", "poster-1.jpg"]);
    expect(files.at(-1)?.file).toMatchObject({
      kind: "poster",
      path: "media-1.jpg",
    });
  });

  it("keeps a local Save's video and image as two slides", () => {
    const local = photo("a", {
      files: [
        file("video", "clip.mp4", { mimeType: "video/mp4" }),
        file("image", "still.jpg"),
      ],
    });
    expect(names(groupFiles([local, photo("b")]))).toEqual([
      "clip.mp4",
      "still.jpg",
      "b.jpg",
    ]);
  });

  it("stops pairing posters after a video without one", () => {
    const bare = photo("a", {
      files: [file("video", "a.mp4", { mimeType: "video/mp4" })],
    });
    const posted = photo("b", {
      files: [
        file("video", "b.mp4", { mimeType: "video/mp4" }),
        file("poster", "poster-1.jpg"),
      ],
    });
    expect(names(groupFiles([bare, posted]))).toEqual(["a.mp4", "b.mp4"]);
  });

  it("lands a file shared by two members once", () => {
    const again = photo("b", { files: photo("a").files });
    expect(names(groupFiles([photo("a"), again]))).toEqual(["a.jpg"]);
  });
});

describe("canGroupMember", () => {
  it("refuses Saves in Trash, still downloading, or without media", () => {
    expect(canGroupMember(photo("a"))).toBeNull();
    expect(canGroupMember(photo("a", { deletedAt: new Date() }))).toBe(
      "missing",
    );
    expect(canGroupMember(photo("a", { status: "ingesting" }))).toBe("busy");
    expect(
      canGroupMember(photo("a", { files: [file("file", "deck.pdf")] })),
    ).toBe("media");
  });
});

describe("planGroup", () => {
  const first = photo("a", {
    title: "Moodboard",
    tags: ["Color", "Type"],
    notes: "Warm palette",
    rating: 2,
    savedAt: new Date("2026-10-01T12:00:00.000Z"),
  });
  const second = photo("b", {
    title: "Other",
    tags: ["color", "Layout"],
    notes: "Warm palette\n\nTight grid",
    rating: 5,
    favorite: true,
    sensitiveScore: 0.8,
    sensitiveModel: MANUAL_LIKELY_SENSITIVE_MODEL,
    savedAt: new Date("2026-10-03T12:00:00.000Z"),
  });
  const now = new Date("2026-11-01T12:00:00.000Z");
  const plan = planGroup([first, second], () => "gallery", now);

  it("creates a local Save that waits for its files", () => {
    expect(plan.id).toBe("gallery");
    expect(plan.row).toMatchObject({
      id: "gallery",
      source: "local",
      sourceId: "gallery",
      url: "pond:local/gallery",
      mediaType: "image",
      width: 800,
      height: 600,
      files: [],
      status: "ingesting",
      ingestStartedAt: now,
      createdAt: now,
    });
  });

  it("takes the first title and the newest saved date", () => {
    expect(plan.row.title).toBe("Moodboard");
    expect(plan.row.savedAt).toEqual(second.savedAt);
  });

  it("merges tags, notes, rating, and favorite", () => {
    expect(plan.row.tags).toEqual(["Color", "Type", "Layout"]);
    expect(plan.row.notes).toBe("Warm palette\n\nTight grid");
    expect(plan.row.rating).toBe(5);
    expect(plan.row.favorite).toBe(true);
  });

  it("keeps the strictest sensitivity decision", () => {
    expect(plan.row).toMatchObject({
      sensitiveScore: 0.8,
      sensitiveModel: MANUAL_LIKELY_SENSITIVE_MODEL,
    });
  });

  it("drops a model's verdict so the gallery is scored again", () => {
    const scored = photo("c", {
      sensitiveScore: 0.4,
      sensitiveModel: "sensitive-1",
    });
    const { row } = planGroup([first, scored], () => "gallery", now);
    expect(row).toMatchObject({ sensitiveScore: 0.4, sensitiveModel: null });
  });
});

function fakeLibrary(rows: Array<Save>) {
  const events: Array<string> = [];
  const created: Array<NewSave> = [];
  const copies: Array<Array<GroupFile>> = [];
  const memberships = new Map<string, Array<string>>();
  let failCopy = false;
  const runtime: GroupSavesRuntime = {
    async read(ids) {
      return rows.filter((row) => ids.includes(row.id)).reverse();
    },
    async folders(id) {
      return memberships.get(id) ?? [];
    },
    async create(row) {
      created.push(row);
      events.push(`create ${row.id}`);
    },
    async copyFiles(id, files) {
      events.push(`copy ${id}`);
      copies.push([...files]);
      return failCopy ? files.length - 1 : files.length;
    },
    async assignFolders(id, folderIds) {
      events.push(`folders ${id} ${folderIds.join(",")}`);
    },
    async discard(id) {
      events.push(`discard ${id}`);
    },
    async trash(groupId, ids) {
      events.push(`trash ${ids.join(",")} for ${groupId}`);
      return "undo-1";
    },
    async refresh() {},
    newId: () => "gallery",
  };
  return {
    runtime,
    events,
    created,
    copies,
    memberships,
    failCopies() {
      failCopy = true;
    },
  };
}

describe("runGroupSaves", () => {
  it("copies every file in before the members move to Trash", async () => {
    const library = fakeLibrary([photo("a"), photo("b"), photo("c")]);
    library.memberships.set("a", ["inspiration"]);
    library.memberships.set("c", ["inspiration", "client"]);
    const result = await runGroupSaves(["c", "a", "b"], library.runtime);
    expect(result).toEqual({
      ok: true,
      id: "gallery",
      grouped: 3,
      undoId: "undo-1",
    });
    expect(library.events).toEqual([
      "create gallery",
      "copy gallery",
      "folders gallery inspiration,client",
      "trash c,a,b for gallery",
    ]);
    expect(library.copies[0]?.map((entry) => entry.filename)).toEqual([
      "c.jpg",
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("refuses fewer than two Saves without changing anything", async () => {
    const library = fakeLibrary([photo("a")]);
    const result = await runGroupSaves(["a", "a"], library.runtime);
    expect(result.ok).toBe(false);
    expect(library.events).toEqual([]);
  });

  it("refuses a missing or unfinished member without changing anything", async () => {
    const library = fakeLibrary([
      photo("a"),
      photo("b", { status: "ingesting" }),
    ]);
    expect((await runGroupSaves(["a", "b"], library.runtime)).ok).toBe(false);
    expect((await runGroupSaves(["a", "gone"], library.runtime)).ok).toBe(
      false,
    );
    expect(library.events).toEqual([]);
  });

  it("removes the gallery and keeps the members when a copy fails", async () => {
    const library = fakeLibrary([photo("a"), photo("b")]);
    library.failCopies();
    const result = await runGroupSaves(["a", "b"], library.runtime);
    expect(result.ok).toBe(false);
    expect(library.events).toEqual([
      "create gallery",
      "copy gallery",
      "discard gallery",
    ]);
  });
});
