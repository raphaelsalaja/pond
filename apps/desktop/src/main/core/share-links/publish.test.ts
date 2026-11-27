import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeS3 } from "./fake-s3";
import { s3ShareHost } from "./host";
import {
  newShareLinkId,
  publishShareLink,
  stopExpiredShareLinks,
  stopSharing,
} from "./publish";
import type { ShareLinkDeps, ShareLinkTarget } from "./publish";
import { readShareLinks } from "./records";

let libraryRoot: string;
let clock: number;

beforeEach(async () => {
  libraryRoot = await mkdtemp(join(tmpdir(), "pond-share-links-"));
  clock = 1000;
});

afterEach(async () => {
  await rm(libraryRoot, { recursive: true, force: true });
});

/** Stages one media file per Save, named by its position, like a real Share Page. */
async function fakeStage(input: {
  target: ShareLinkTarget;
  destination: string;
  pageUrl: string;
}) {
  await mkdir(join(input.destination, "media"), { recursive: true });
  for (const [index] of input.target.ids.entries()) {
    await writeFile(
      join(input.destination, "media", `s${index + 1}-0.webp`),
      "image",
    );
  }
  await writeFile(
    join(input.destination, "index.html"),
    `<a href="${input.pageUrl}">`,
  );
  return { exported: input.target.ids.length };
}

function setup(overrides: Partial<ShareLinkDeps> = {}) {
  const s3 = createFakeS3({ bucket: "links" });
  const host = s3ShareHost(
    {
      provider: "r2",
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "links",
      publicUrl: "https://links.example.com",
      accessKeyId: "key",
      secretAccessKey: "secret",
      expireAfterDays: null,
    },
    { fetch: s3.fetch },
  );
  const deps: ShareLinkDeps = {
    libraryRoot,
    host,
    stage: fakeStage,
    describe: async (target) => ({
      kind: target.folderId ? "folder" : "selection",
      title: target.folderId ? "References" : `${target.ids.length} Saves`,
    }),
    now: () => clock,
    ...overrides,
  };
  return { s3, deps };
}

describe("publishShareLink", () => {
  it("uploads the page last and records the live link", async () => {
    const { s3, deps } = setup();
    const { link, updated } = await publishShareLink(deps, {
      target: { ids: ["a", "b"], folderId: "f1" },
      expiresAt: 5000,
    });
    expect(updated).toBe(false);
    expect(link).toMatchObject({
      kind: "folder",
      title: "References",
      status: "live",
      saves: 2,
      expiresAt: 5000,
      url: `https://links.example.com/${link.id}/index.html`,
    });
    const puts = s3.log.filter((entry) => entry.startsWith("PUT"));
    expect(puts.at(-1)).toBe(`PUT /links/${link.id}/index.html`);
    expect(s3.objects.get(`${link.id}/index.html`)).toMatchObject({
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache",
    });
    expect(s3.objects.get(`${link.id}/media/s1-0.webp`)?.cacheControl).toBe(
      "public, max-age=3600",
    );
    expect(await readShareLinks(libraryRoot)).toEqual([link]);
  });

  it("republishes a Folder at the same address and removes files it no longer needs", async () => {
    const { s3, deps } = setup();
    const first = await publishShareLink(deps, {
      target: { ids: ["a", "b"], folderId: "f1" },
    });
    clock = 2000;
    const second = await publishShareLink(deps, {
      target: { ids: ["a"], folderId: "f1" },
    });
    expect(second.updated).toBe(true);
    expect(second.link.id).toBe(first.link.id);
    expect(second.link.createdAt).toBe(1000);
    expect(second.link.updatedAt).toBe(2000);
    expect([...s3.objects.keys()].sort()).toEqual([
      `${first.link.id}/index.html`,
      `${first.link.id}/media/s1-0.webp`,
    ]);
  });

  it("removes a new link's partial upload when it fails", async () => {
    const { s3, deps } = setup({
      progress: async (key) => {
        if (key.endsWith("s2-0.webp")) s3.failNext("PUT", 500, "InternalError");
      },
    });
    await expect(
      publishShareLink(deps, { target: { ids: ["a", "b", "c"] } }),
    ).rejects.toThrow();
    expect(s3.objects.size).toBe(0);
    const [link] = await readShareLinks(libraryRoot);
    expect(link?.status).toBe("failed");
    expect(link?.keys).toEqual([]);
  });
});

describe("stopSharing", () => {
  it("removes every file under the link, even ones a failed upload left", async () => {
    const { s3, deps } = setup();
    const { link } = await publishShareLink(deps, { target: { ids: ["a"] } });
    await deps.host.put(`${link.id}/media/stray.webp`, new Uint8Array(), {
      contentType: "image/webp",
      cacheControl: "",
    });
    await stopSharing(deps, link.id);
    expect(s3.objects.size).toBe(0);
    expect(await readShareLinks(libraryRoot)).toEqual([]);
  });
});

describe("stopExpiredShareLinks", () => {
  it("stops only the links whose time has come", async () => {
    const { deps } = setup();
    const soon = await publishShareLink(deps, {
      target: { ids: ["a"] },
      expiresAt: 3000,
    });
    const later = await publishShareLink(deps, {
      target: { ids: ["b"] },
      expiresAt: 9000,
    });
    const never = await publishShareLink(deps, { target: { ids: ["c"] } });
    clock = 5000;
    const { stopped, failed } = await stopExpiredShareLinks(deps);
    expect(stopped.map((link) => link.id)).toEqual([soon.link.id]);
    expect(failed).toEqual([]);
    expect(
      (await readShareLinks(libraryRoot)).map((link) => link.id).sort(),
    ).toEqual([later.link.id, never.link.id].sort());
  });
});

describe("newShareLinkId", () => {
  it("makes 26 lowercase base32 characters, different every time", () => {
    const ids = new Set(Array.from({ length: 200 }, newShareLinkId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z2-7]{26}$/);
  });
});
