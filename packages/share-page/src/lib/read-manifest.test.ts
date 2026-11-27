import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readManifest } from "./read-manifest";

const EXAMPLE = resolve(
  import.meta.dirname,
  "../../../../apps/desktop/test/fixtures/compatibility/share-page/example-manifest.json",
);

function pageWith(json: string): Document {
  const document = new DOMParser().parseFromString(
    "<!doctype html><html><body></body></html>",
    "text/html",
  );
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "pond-share-page";
  script.textContent = json;
  document.body.append(script);
  return document;
}

describe("readManifest", () => {
  it("reads the frozen version 1 example", () => {
    const read = readManifest(pageWith(readFileSync(EXAMPLE, "utf8")));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.manifest.title).toBe("References");
    expect(read.manifest.saves.map((save) => save.id)).toEqual(["s1", "s2"]);
  });

  it("refuses a page without a manifest", () => {
    const document = new DOMParser().parseFromString(
      "<!doctype html><html><body></body></html>",
      "text/html",
    );
    expect(readManifest(document)).toEqual({
      ok: false,
      error: "This page has no content.",
    });
  });

  it("refuses damaged JSON", () => {
    expect(readManifest(pageWith("{")).ok).toBe(false);
  });

  it("refuses links that aren't http or https", () => {
    const manifest = JSON.parse(readFileSync(EXAMPLE, "utf8"));
    manifest.saves[0].url = "javascript:alert(1)";
    expect(readManifest(pageWith(JSON.stringify(manifest))).ok).toBe(false);
  });

  it("refuses media paths outside media/", () => {
    const manifest = JSON.parse(readFileSync(EXAMPLE, "utf8"));
    manifest.saves[0].thumbnail.src = "../secret.png";
    expect(readManifest(pageWith(JSON.stringify(manifest))).ok).toBe(false);
  });
});
