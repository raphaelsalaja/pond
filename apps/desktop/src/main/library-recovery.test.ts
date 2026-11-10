import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type MissingLibraryChoice,
  type MissingLibraryPorts,
  recoverMissingLibrary,
} from "./library-recovery";

const NOT_A_LIBRARY = {
  message: "Couldn't open that Library.",
  detail: "Choose another Library.",
};

function fakePorts(
  choices: MissingLibraryChoice[],
  picks: (string | null)[] = [],
  canCreate = true,
) {
  const details: string[] = [];
  const adopted: [string, string][] = [];
  let created = 0;
  const ports: MissingLibraryPorts = {
    ask: async (detail) => {
      details.push(detail);
      return choices.shift() ?? "quit";
    },
    pick: async () => picks.shift() ?? null,
    check: (path) =>
      existsSync(join(path, "metadata.json")) ? null : NOT_A_LIBRARY,
    create: () => {
      created += 1;
      return canCreate;
    },
    adopt: (missing, located) => {
      adopted.push([missing, located]);
    },
  };
  return { ports, details, adopted, created: () => created };
}

function makeLibrary(path: string) {
  mkdirSync(join(path, "items"), { recursive: true });
  writeFileSync(join(path, "metadata.json"), JSON.stringify({ id: "library" }));
}

describe("recoverMissingLibrary", () => {
  let root: string;
  let missing: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pond-recovery-"));
    missing = join(root, "Pond", "Personal.pond");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("adopts the Library you locate", async () => {
    const moved = join(root, "iCloud", "Personal.pond");
    makeLibrary(moved);
    const fake = fakePorts(["locate"], [moved]);

    await expect(recoverMissingLibrary(missing, fake.ports)).resolves.toBe(
      true,
    );
    expect(fake.adopted).toEqual([[missing, moved]]);
  });

  it("asks again when you cancel the picker", async () => {
    const fake = fakePorts(["locate", "quit"], [null]);
    await expect(recoverMissingLibrary(missing, fake.ports)).resolves.toBe(
      false,
    );
    expect(fake.details).toHaveLength(2);
    expect(fake.adopted).toEqual([]);
  });

  it("asks again while the Library is still missing", async () => {
    const fake = fakePorts(["retry", "quit"]);
    await expect(recoverMissingLibrary(missing, fake.ports)).resolves.toBe(
      false,
    );
    expect(fake.details[1]).toContain("still missing");
  });

  it("continues once the Library is back at its saved path", async () => {
    makeLibrary(missing);
    const fake = fakePorts(["retry"]);
    await expect(recoverMissingLibrary(missing, fake.ports)).resolves.toBe(
      true,
    );
    expect(fake.adopted).toEqual([]);
  });

  it("rejects a folder that isn't a Library", async () => {
    const downloads = join(root, "Downloads");
    mkdirSync(downloads);
    const fake = fakePorts(["locate", "quit"], [downloads]);

    await expect(recoverMissingLibrary(missing, fake.ports)).resolves.toBe(
      false,
    );
    expect(fake.details[1]).toContain("Couldn't open that Library.");
    expect(fake.adopted).toEqual([]);
  });

  it("creates a new Library on request and reports a failure", async () => {
    const works = fakePorts(["new"]);
    await expect(recoverMissingLibrary(missing, works.ports)).resolves.toBe(
      true,
    );
    expect(works.created()).toBe(1);

    const fails = fakePorts(["new", "quit"], [], false);
    await expect(recoverMissingLibrary(missing, fails.ports)).resolves.toBe(
      false,
    );
    expect(fails.details[1]).toContain("Couldn't create a new Library.");
  });
});
