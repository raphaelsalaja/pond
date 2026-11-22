import { describe, expect, it } from "vitest";
import { type ClipboardReader, clipboardPrefill } from "./clipboard";

function reader(
  text: string,
  types: string[] = [],
  formats: string[] = ["text/plain"],
): ClipboardReader {
  return {
    has: (format) => types.includes(format),
    availableFormats: () => formats,
    readText: () => text,
  };
}

describe("clipboardPrefill", () => {
  it("prefills plain copied text", () => {
    expect(clipboardPrefill(reader("https://a.com"))).toBe("https://a.com");
  });

  it("skips a secret a password manager marked as concealed", () => {
    expect(
      clipboardPrefill(reader("hunter2", ["org.nspasteboard.ConcealedType"])),
    ).toBe("");
  });

  it("skips transient clipboard content", () => {
    expect(
      clipboardPrefill(reader("otp", ["org.nspasteboard.TransientType"])),
    ).toBe("");
  });

  it("skips content listed as private in the available formats", () => {
    expect(
      clipboardPrefill(
        reader("secret", [], ["text/plain", "x-kde-passwordManagerHint"]),
      ),
    ).toBe("");
  });

  it("caps long text", () => {
    expect(clipboardPrefill(reader("a".repeat(100_010)))).toHaveLength(100_000);
  });
});
