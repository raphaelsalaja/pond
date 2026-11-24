import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFontFamily, renameWithFamily } from "./font-metadata";

function utf16be(value: string): Buffer {
  const bytes = Buffer.alloc(value.length * 2);
  for (let i = 0; i < value.length; i += 1) {
    bytes.writeUInt16BE(value.charCodeAt(i), i * 2);
  }
  return bytes;
}

function nameTableFont(family: string): Buffer {
  const name = utf16be(family);
  const nameCount = 1;
  const stringOffset = 6 + 12 * nameCount;
  const table = Buffer.alloc(stringOffset + name.length);
  table.writeUInt16BE(0, 0);
  table.writeUInt16BE(nameCount, 2);
  table.writeUInt16BE(stringOffset, 4);
  table.writeUInt16BE(3, 6);
  table.writeUInt16BE(1, 8);
  table.writeUInt16BE(0x04_09, 10);
  table.writeUInt16BE(1, 12);
  table.writeUInt16BE(name.length, 14);
  table.writeUInt16BE(0, 16);
  name.copy(table, stringOffset);
  const offsetTable = Buffer.alloc(12);
  offsetTable.writeUInt32BE(0x00_01_00_00, 0);
  offsetTable.writeUInt16BE(1, 4);
  const records = Buffer.alloc(16);
  records.write("name", 0, 4, "ascii");
  records.writeUInt32BE(28, 8);
  records.writeUInt32BE(table.length, 12);
  return Buffer.concat([offsetTable, records, table]);
}

describe("extractFontFamily", () => {
  it("reads the Windows family name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-font-"));
    const path = join(dir, "SourceSerif.ttf");
    await writeFile(path, nameTableFont("Source Serif"));
    expect(await extractFontFamily(path)).toBe("Source Serif");
  });

  it("returns null when the name table is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-font-empty-"));
    const path = join(dir, "empty.ttf");
    await writeFile(path, Buffer.alloc(32));
    expect(await extractFontFamily(path)).toBeNull();
  });
});

describe("renameWithFamily", () => {
  it("substitutes family, title, id, and index", () => {
    expect(
      renameWithFamily("{family} {n}", {
        n: 2,
        title: "Old",
        id: "s1",
        family: "Inter",
      }),
    ).toBe("Inter 2");
  });
});
