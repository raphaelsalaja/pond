import { describe, expect, it } from "vitest";
import { decodeTextBytes } from "./text-encoding";

describe("decodeTextBytes", () => {
  it("detects UTF-8 and UTF-16 byte order marks", () => {
    expect(
      decodeTextBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69])),
    ).toEqual({ text: "hi", encoding: "utf8", hadBom: true });
    expect(
      decodeTextBytes(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00])),
    ).toEqual({ text: "hi", encoding: "utf-16le", hadBom: true });
  });

  it("falls back to Windows-1252 without losing bytes", () => {
    expect(decodeTextBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toEqual({
      text: "café",
      encoding: "windows-1252",
      hadBom: false,
    });
  });
});
