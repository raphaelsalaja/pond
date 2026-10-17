import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listInstalledBlankDocumentApps,
  listInstalledBlankDocuments,
  writeBlankDocumentFile,
} from "./blank-documents";

const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("blank documents", () => {
  it("lists only document types whose apps are installed", () => {
    expect(
      listInstalledBlankDocuments(
        {
          exists: () => true,
          entries: () => [
            "Adobe Photoshop 2025.app",
            "Pages.app",
            "Safari.app",
          ],
        },
        "darwin",
      ),
    ).toEqual(["photoshop", "pages"]);
  });

  it("retains each installed application's path for native icon lookup", () => {
    expect(
      listInstalledBlankDocumentApps(
        {
          exists: () => true,
          entries: (path) =>
            path === "/Applications"
              ? ["Microsoft Excel.app", "Safari.app"]
              : ["Pages.app"],
        },
        "darwin",
      ),
    ).toEqual([
      { kind: "excel", path: "/Applications/Microsoft Excel.app" },
      { kind: "pages", path: "/System/Applications/Pages.app" },
    ]);
  });

  it("does not advertise macOS application bundles on Windows", () => {
    expect(
      listInstalledBlankDocuments(
        { exists: () => true, entries: () => ["Pages.app"] },
        "win32",
      ),
    ).toEqual([]);
  });

  it("writes a file with the document extension", async () => {
    const path = await writeBlankDocumentFile("word");
    expect(path).toMatch(/Untitled\.docx$/);
    if (path) scratch.push(dirname(path));
    const bytes = path ? await readFile(path) : Buffer.alloc(0);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
