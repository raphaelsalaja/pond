import { FolderColorSchema } from "@pond/schema/folder-presentation";
import { expect, it } from "vitest";
import { setFolderColor } from "./folders";

it("accepts palette IDs and normalizes hex colors", () => {
  expect(FolderColorSchema.parse("teal")).toBe("teal");
  expect(FolderColorSchema.parse("#AB12CD")).toBe("#ab12cd");
});

it("rejects colors that aren't a palette ID or six-digit hex", async () => {
  for (const color of ["plum", "#abc", "#ab12cz", "rgb(0 0 0)", "#ab12cd00"]) {
    expect(FolderColorSchema.safeParse(color).success).toBe(false);
    await expect(setFolderColor("folder", color)).resolves.toEqual({
      ok: false,
      error: "Choose a palette color or a hex color.",
    });
  }
});
