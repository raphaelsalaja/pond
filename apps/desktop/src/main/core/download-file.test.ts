import { describe, expect, it } from "vitest";

import { fileNameOf, fileProbeOf } from "./download-file";

describe("fileNameOf", () => {
  it("keeps the name from the path", () => {
    expect(
      fileNameOf("https://example.com/files/report.pdf", new Headers()),
    ).toBe("report.pdf");
  });

  it("prefers the server's attachment name", () => {
    const headers = new Headers({
      "content-disposition": `attachment; filename*=UTF-8''caf%C3%A9%20menu.pdf`,
    });
    expect(fileNameOf("https://example.com/download?id=4", headers)).toBe(
      "café menu.pdf",
    );
  });

  it("adds an extension from the content type", () => {
    const headers = new Headers({
      "content-type": "image/png; charset=binary",
    });
    expect(fileNameOf("https://cdn.example.com/a/b/abc123", headers)).toBe(
      "abc123.png",
    );
  });

  it("reads the format Twitter's image CDN puts in the query", () => {
    expect(
      fileNameOf(
        "https://pbs.twimg.com/media/GxYz?format=jpg&name=large",
        new Headers(),
      ),
    ).toBe("GxYz.jpg");
  });
});

describe("fileProbeOf", () => {
  it("describes a file with its type and size", () => {
    const headers = new Headers({
      "content-type": "application/pdf",
      "content-length": "20480",
    });
    expect(fileProbeOf("https://www.example.com/a.pdf", headers)).toEqual({
      kind: "file",
      url: "https://www.example.com/a.pdf",
      site: "example.com",
      name: "a.pdf",
      mimeType: "application/pdf",
      size: 20480,
      existingSaveId: null,
    });
  });

  it("leaves HTML to the post path", () => {
    const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
    expect(fileProbeOf("https://example.com/", headers)).toBeNull();
  });
});
