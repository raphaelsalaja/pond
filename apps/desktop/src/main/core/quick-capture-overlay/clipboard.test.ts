import { describe, expect, it } from "vitest";
import { type ClipboardReader, clipboardPrefill } from "./clipboard";

function raw(type: string): string {
  return `electron application/osclipboard;format="${type}"`;
}

function reader(
  text: string,
  formats: string[] = ["text/plain"],
): ClipboardReader {
  return {
    has: async (format) => formats.includes(format),
    readText: async () => text,
  };
}

describe("clipboardPrefill", () => {
  it("prefills plain copied text", async () => {
    const plain = reader("https://a.com");
    expect(await clipboardPrefill(plain)).toBe("https://a.com");
  });

  it("skips a secret a password manager marked as concealed", async () => {
    const marked = reader("hunter2", [raw("org.nspasteboard.ConcealedType")]);
    expect(await clipboardPrefill(marked)).toBe("");
  });

  it("skips transient clipboard content", async () => {
    const marked = reader("otp", [raw("org.nspasteboard.TransientType")]);
    expect(await clipboardPrefill(marked)).toBe("");
  });

  it("skips content a password manager marked with a MIME hint", async () => {
    const marked = reader("secret", ["x-kde-passwordManagerHint"]);
    expect(await clipboardPrefill(marked)).toBe("");
  });

  it("caps long text", async () => {
    const long = reader("a".repeat(100_010));
    expect(await clipboardPrefill(long)).toHaveLength(100_000);
  });
});
