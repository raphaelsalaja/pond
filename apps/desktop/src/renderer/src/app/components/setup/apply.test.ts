import { DEFAULT_PREFS } from "@pond/schema/db";
import type { QueryResult } from "@shared/query-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openExistingLibrary, relaunchesLibrary } from "./apply";
import { choicesFrom } from "./model";

type LibraryQuery = "library.pickExisting" | "library.switchTo";

function stubQuery(results: {
  [Name in LibraryQuery]?: QueryResult<Name>;
}) {
  const query = vi.fn(async (name: LibraryQuery) => results[name]);
  vi.stubGlobal("window", { pond: { query } });
  return query;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openExistingLibrary", () => {
  it("switches to the picked Library", async () => {
    const query = stubQuery({
      "library.pickExisting": { ok: true, path: "/Volumes/Archive/Ada.pond" },
      "library.switchTo": { ok: true, path: "/Volumes/Archive/Ada.pond" },
    });
    await expect(openExistingLibrary()).resolves.toBe("");
    expect(query).toHaveBeenCalledWith("library.switchTo", {
      path: "/Volumes/Archive/Ada.pond",
    });
  });

  it("does nothing when the picker is cancelled", async () => {
    const query = stubQuery({
      "library.pickExisting": { ok: false, reason: "cancelled" },
    });
    await expect(openExistingLibrary()).resolves.toBeNull();
    expect(query).not.toHaveBeenCalledWith("library.switchTo", {
      path: expect.anything(),
    });
  });

  it("surfaces why the folder couldn't be opened", async () => {
    stubQuery({
      "library.pickExisting": { ok: true, path: "/Users/ada/Downloads" },
      "library.switchTo": { ok: false, error: "Not a Pond library." },
    });
    await expect(openExistingLibrary()).resolves.toBe("Not a Pond library.");
  });
});

describe("relaunchesLibrary", () => {
  const library = {
    name: "My Pond",
    path: "/Users/ada/Pond/My Pond.pond",
    parent: "/Users/ada/Pond",
    saves: 0,
  };
  const kept = choicesFrom(DEFAULT_PREFS, library, "new");

  it("stays put when a new Library keeps its name and folder", () => {
    expect(relaunchesLibrary(kept, library, "new")).toBe(false);
  });

  it("relaunches when a new Library is renamed or placed elsewhere", () => {
    expect(
      relaunchesLibrary({ ...kept, libraryName: "Archive" }, library, "new"),
    ).toBe(true);
    expect(
      relaunchesLibrary(
        { ...kept, libraryLocation: "/Volumes/Archive" },
        library,
        "new",
      ),
    ).toBe(true);
  });

  it("relaunches an existing Library only when you choose to move it", () => {
    const elsewhere = { ...kept, libraryLocation: "/Volumes/Archive" };
    expect(relaunchesLibrary(elsewhere, library, "existing")).toBe(false);
    expect(
      relaunchesLibrary(
        { ...elsewhere, moveLibrary: true },
        library,
        "existing",
      ),
    ).toBe(true);
  });
});
