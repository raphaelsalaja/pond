import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAppGroupContainer } from "./app-group";
import type { AppGroupModule } from "./app-group";

const GROUP = "7VFLYD5292.so.pond";
const CONTAINER = `/Users/someone/Library/Group Containers/${GROUP}`;

const roots: Array<string> = [];

/** A `Contents/Resources` folder holding these bytes as `app-group.node`, when given. */
function resources(moduleBytes?: string): string {
  const root = mkdtempSync(join(tmpdir(), "pond-app-group-"));
  roots.push(root);
  if (moduleBytes !== undefined) {
    writeFileSync(join(root, "app-group.node"), moduleBytes);
  }
  return root;
}

/** Stands in for app-group.node: answers every request with this container, or null. */
function appGroupModule(container: string | null) {
  const requests: Array<string> = [];
  const module: AppGroupModule = {
    containerPath(identifier) {
      requests.push(identifier);
      return container;
    },
  };
  return { module, requests };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("openAppGroupContainer", () => {
  it("asks macOS for the group's container", () => {
    const { module, requests } = appGroupModule(CONTAINER);
    expect(openAppGroupContainer(GROUP, { module })).toBe(CONTAINER);
    expect(requests).toEqual([GROUP]);
  });

  it("passes on a missing URL", () => {
    const { module } = appGroupModule(null);
    expect(openAppGroupContainer(GROUP, { module })).toBeNull();
  });

  it("reports a build without the module", () => {
    expect(
      openAppGroupContainer(GROUP, { resourcesPath: resources() }),
    ).toBeNull();
  });

  it("treats a module that will not load as missing", () => {
    expect(
      openAppGroupContainer(GROUP, {
        resourcesPath: resources("not a Mach-O bundle"),
      }),
    ).toBeNull();
  });
});
