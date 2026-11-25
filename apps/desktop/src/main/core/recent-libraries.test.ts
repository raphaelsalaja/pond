import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  listRecentLibraries,
  recordRecentLibrary,
  removeRecentLibrary,
  renameRecentLibrary,
  setRecentLibraryIcon,
} from "./recent-libraries";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("keeps recent libraries in open order and marks unavailable libraries without forgetting them", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-recent-"));
  roots.push(root);
  const active = join(root, "Active.pond");
  await mkdir(active);
  await writeFile(join(active, "metadata.json"), "{}");
  const absent = join(root, "Offline.pond");
  const file = join(root, "recent.json");
  recordRecentLibrary(file, active, 1);
  recordRecentLibrary(file, absent, 2);
  recordRecentLibrary(file, active, 3);
  expect(await listRecentLibraries(file, active)).toEqual([
    {
      path: active,
      lastOpened: 3,
      icon: null,
      accent: null,
      name: "Active",
      active: true,
      available: true,
    },
    {
      path: absent,
      lastOpened: 2,
      icon: null,
      accent: null,
      name: "Offline",
      active: false,
      available: false,
    },
  ]);
});

it("stores library icons and hides removed libraries until reopened", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-recent-actions-"));
  roots.push(root);
  const active = join(root, "Active.pond");
  await mkdir(active);
  await writeFile(join(active, "metadata.json"), "{}");
  const file = join(root, "recent.json");

  recordRecentLibrary(file, active, 1);
  setRecentLibraryIcon(file, active, "data:image/png;base64,icon");
  expect((await listRecentLibraries(file, active))[0]?.icon).toBe(
    "data:image/png;base64,icon",
  );

  removeRecentLibrary(file, active);
  expect(await listRecentLibraries(file, active)).toEqual([]);

  recordRecentLibrary(file, active, 2);
  expect(await listRecentLibraries(file, active)).toMatchObject([
    {
      path: active,
      lastOpened: 2,
      icon: "data:image/png;base64,icon",
      active: true,
    },
  ]);

  setRecentLibraryIcon(file, active, null);
  expect((await listRecentLibraries(file, active))[0]?.icon).toBeNull();
});

it("reads portable identity and preserves history when a library is renamed", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-recent-identity-"));
  roots.push(root);
  const previous = join(root, "Previous.pond");
  const next = join(root, "Renamed.pond");
  await mkdir(next);
  await writeFile(
    join(next, "metadata.json"),
    JSON.stringify({
      name: "Design Library",
      icon: "data:image/png;base64,aWNvbg==",
      accent: "#FF3366",
    }),
  );
  const file = join(root, "recent.json");
  recordRecentLibrary(file, previous, 4);
  renameRecentLibrary(file, previous, next);

  expect(await listRecentLibraries(file, next)).toMatchObject([
    {
      path: next,
      lastOpened: 4,
      name: "Design Library",
      icon: "data:image/png;base64,aWNvbg==",
      accent: "#FF3366",
      active: true,
    },
  ]);
});
