import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeBundleJson } from "../lib/library-config";
import { StoredInfoDocSchema } from "../lib/library-format";
import { exportFiles } from "./export-files";
import { copyPackageToLibrary, packageLibrary } from "./library-transfer-files";
import { PackageOrganizationSchema } from "./package-organization";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "pond-library-transfer-")),
  );
  roots.push(root);
  const target = join(root, "Target.pond");
  const pack = join(root, "Saves.pondpack");
  const original = join(root, "original");
  await mkdir(join(target, "items"), { recursive: true });
  await mkdir(join(target, "trash"));
  await mkdir(pack);
  await mkdir(original);
  await writeFile(
    join(target, "metadata.json"),
    JSON.stringify({ id: "target", name: "Target" }),
  );
  writeBundleJson(join(target, "organization.json"), {
    folders: [
      {
        id: "existing",
        parent_id: null,
        name: "Keep",
        color: null,
        sort_order: 0,
        created_at: 1,
      },
    ],
    views: [],
  });
  const bytes = "original bytes";
  await writeFile(join(original, "one.pdf"), bytes);
  await exportFiles({
    directory: pack,
    includeDerived: true,
    organization: PackageOrganizationSchema.parse({
      tags: [
        {
          id: "research-tag",
          name: "Research",
          description: "Source tag description",
          starred: true,
          archived: false,
          lastUsedAt: 1,
          usageCount: 0,
          createdAt: 1,
        },
      ],
      folderViews: {
        "source-folder": {
          icon: "bookmark",
          layout: "grid",
          sortKey: "manual",
          manualOrder: ["original-save"],
        },
      },
      folderRules: { "source-folder": { automaticTags: ["Research"] } },
      views: [
        {
          id: "source-view",
          name: "Research papers",
          kind: "smart_folder",
          parent_id: null,
          question: null,
          query: JSON.stringify({
            combinator: "and",
            rules: [
              { field: "folder", operator: "some", value: ["source-folder"] },
            ],
          }),
          sort_key: "title",
          sort_dir: "asc",
          layout: "list",
          sort_order: 0,
          created_at: 1,
        },
      ],
    }),
    folders: [{ id: "source-folder", name: "Research", parentId: null }],
    items: [
      {
        directory: original,
        folderIds: ["source-folder"],
        save: {
          id: "original-save",
          title: "Paper",
          url: "https://example.test/paper",
          source: "web",
          sourceId: "paper",
          notes: "Read again",
          tags: ["Research"],
          mediaType: "document",
          rating: 5,
          favorite: true,
          files: [
            {
              path: "one.pdf",
              kind: "document",
              size: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
            },
          ],
        },
      },
    ],
  });
  return { root, target, pack };
}
describe("copy into an inactive library", () => {
  it("copies originals and metadata, preserves prior organization, and skips existing source identities", async () => {
    const { root, target, pack } = await fixture();
    expect(await copyPackageToLibrary(pack, target)).toEqual({
      path: target,
      imported: 1,
      skipped: 0,
    });
    const [name] = await readdir(join(target, "items"));
    if (!name) throw new Error("Missing imported Save");
    const info = StoredInfoDocSchema.parse(
      JSON.parse(
        await readFile(join(target, "items", name, "info.json"), "utf8"),
      ),
    );
    expect(info.source).toBe("web");
    expect(info.sourceId).toBe("paper");
    expect(info.userData).toMatchObject({ rating: 5, favorite: true });
    expect(await readFile(join(target, "items", name, "one.pdf"), "utf8")).toBe(
      "original bytes",
    );
    const organization = JSON.parse(
      await readFile(join(target, "organization.json"), "utf8"),
    );
    expect(
      organization.data.folders.map((folder: { name: string }) => folder.name),
    ).toEqual(["Keep", "Research"]);
    const preferences = JSON.parse(
      await readFile(join(target, "settings.json"), "utf8"),
    ).data;
    expect(
      preferences.folderViews[info.folderIds[0] ?? "missing"],
    ).toMatchObject({
      icon: "bookmark",
      layout: "grid",
      manualOrder: [info.id],
    });
    expect(preferences.folderRules[info.folderIds[0] ?? "missing"]).toEqual({
      automaticTags: ["Research"],
    });
    expect(
      JSON.parse(await readFile(join(target, "tags.json"), "utf8")).data.tags,
    ).toMatchObject([
      {
        name: "Research",
        description: "Source tag description",
        starred: true,
      },
    ]);
    expect(organization.data.views[0].name).toBe("Research papers");
    expect(JSON.parse(organization.data.views[0].query).rules[0].value).toEqual(
      info.folderIds,
    );
    expect(await copyPackageToLibrary(pack, target)).toEqual({
      path: target,
      imported: 0,
      skipped: 1,
    });
    const exported = join(root, "merged.pondpack");
    await mkdir(exported);
    expect((await packageLibrary(target, exported)).exported).toBe(1);
    expect(
      JSON.parse(await readFile(join(exported, "pond-export.json"), "utf8"))
        .saves[0],
    ).toMatchObject({ rating: 5, favorite: true });
    expect(await readdir(pack)).toContain("pond-export.json");
    expect(await readdir(target)).not.toContain(".pond-transfer.lock");
  });
  it("creates canonical tags when importing a legacy package without registry metadata", async () => {
    const { target, pack } = await fixture();
    const file = join(pack, "pond-export.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    delete manifest.organization;
    await writeFile(file, JSON.stringify(manifest));
    await copyPackageToLibrary(pack, target);
    expect(
      JSON.parse(await readFile(join(target, "tags.json"), "utf8")).data.tags,
    ).toMatchObject([{ name: "Research" }]);
  });
  it("does not write into a library with a live transfer lock", async () => {
    const { target, pack } = await fixture();
    await writeFile(
      join(target, ".pond-transfer.lock"),
      JSON.stringify({ host: hostname(), pid: process.pid }),
    );
    await expect(copyPackageToLibrary(pack, target)).rejects.toThrow(
      "Another transfer",
    );
    expect(await readdir(join(target, "items"))).toEqual([]);
  });
  it("requires an authoritative organization bundle before modifying an older inactive library", async () => {
    const { target, pack } = await fixture();
    await rm(join(target, "organization.json"));
    await expect(copyPackageToLibrary(pack, target)).rejects.toThrow(
      "Open this library",
    );
    expect(await readdir(join(target, "items"))).toEqual([]);
    expect(await readdir(target)).not.toContain(".pond-transfer.lock");
  });
});
