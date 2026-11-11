import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readLibraryIdentity, updateLibraryIdentity } from "./library-identity";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createLibrary(name = "Existing") {
  const parent = await mkdtemp(join(tmpdir(), "library-id-"));
  roots.push(parent);
  const root = join(parent, `${name}.pond`);
  await mkdir(root);
  await writeFile(
    join(root, "metadata.json"),
    JSON.stringify({ id: "library-id", createdAt: 1 }),
  );
  return root;
}

it("falls back to the folder name for existing libraries", async () => {
  const root = await createLibrary();
  expect(await readLibraryIdentity(root)).toEqual({
    name: "Existing",
    icon: null,
    mark: null,
    accent: null,
  });
});

it("updates portable identity without dropping metadata", async () => {
  const root = await createLibrary();
  expect(
    updateLibraryIdentity(root, {
      name: "Design",
      icon: "data:image/png;base64,aWNvbg==",
      accent: "#12abef",
    }),
  ).toEqual({
    name: "Design",
    icon: "data:image/png;base64,aWNvbg==",
    mark: null,
    accent: "#12ABEF",
  });
  expect(
    JSON.parse(await readFile(join(root, "metadata.json"), "utf8")),
  ).toMatchObject({
    id: "library-id",
    createdAt: 1,
    name: "Design",
    accent: "#12ABEF",
  });
  expect(await readLibraryIdentity(root)).toEqual({
    name: "Design",
    icon: "data:image/png;base64,aWNvbg==",
    mark: null,
    accent: "#12ABEF",
  });
});

it("removes optional customization fields", async () => {
  const root = await createLibrary();
  updateLibraryIdentity(root, {
    icon: "data:image/png;base64,aWNvbg==",
    accent: "#123456",
  });
  expect(updateLibraryIdentity(root, { icon: null, accent: null })).toEqual({
    name: "Existing",
    icon: null,
    mark: null,
    accent: null,
  });
});

it("remembers a Pond logo tint with its rendered logo", async () => {
  const root = await createLibrary();
  const mark = { kind: "pond", tint: "grape" } as const;
  updateLibraryIdentity(root, { icon: "data:image/png;base64,aWNvbg==", mark });
  await expect(readLibraryIdentity(root)).resolves.toMatchObject({ mark });
});

it("keeps the logo mark until the icon changes without one", async () => {
  const root = await createLibrary();
  const mark = { kind: "icon", icon: "pond", color: "red-bright" } as const;
  updateLibraryIdentity(root, { icon: "data:image/png;base64,aWNvbg==", mark });
  expect(updateLibraryIdentity(root, { name: "Design" }).mark).toEqual(mark);
  expect(
    updateLibraryIdentity(root, { icon: "data:image/png;base64,b3RoZXI=" })
      .mark,
  ).toBeNull();
});
