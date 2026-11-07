import { describe, expect, it } from "vitest";
import type { MymindObject } from "./client";
import { mymindContentText } from "./content";

describe("mymindContentText", () => {
  it("keeps Markdown and plain text without changing their content", () => {
    for (const type of ["text/markdown", "text/plain"]) {
      expect(mymindContentText({ type, body: "  Café **notes**\n\n" })).toBe(
        "  Café **notes**\n\n",
      );
    }
    expect(mymindContentText(undefined)).toBe("");
  });

  it("keeps headings, marks, links, hard breaks, and nested list text", () => {
    expect(
      mymindContentText({
        type: "application/prose+json",
        body: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Café 東京" }],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Read " },
                {
                  type: "text",
                  text: "this",
                  marks: [
                    { type: "bold" },
                    {
                      type: "link",
                      attrs: { href: "https://example.com/a(b)" },
                    },
                  ],
                },
                { type: "hardBreak" },
                {
                  type: "text",
                  text: "then think",
                  marks: [{ type: "italic" }],
                },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Parent" }],
                    },
                    {
                      type: "orderedList",
                      attrs: { start: 3 },
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Child" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ).toBe(
      "## Café 東京\n\nRead [**this**](https://example.com/a%28b%29)  \n*then think*\n\n- Parent\n\n  3. Child",
    );
  });

  it("keeps quotes, tasks, and code without turning code into formatting", () => {
    expect(
      mymindContentText({
        type: "application/prose+json",
        body: {
          type: "doc",
          content: [
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "A quote" }],
                },
              ],
            },
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: true },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Done" }],
                    },
                  ],
                },
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Next" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "a`b", marks: [{ type: "code" }] },
              ],
            },
            {
              type: "codeBlock",
              attrs: { language: "js" },
              content: [{ type: "text", text: "const text = `a`;\n// ```" }],
            },
          ],
        },
      }),
    ).toBe(
      "> A quote\n\n- [x] Done\n- [ ] Next\n\n``a`b``\n\n````js\nconst text = `a`;\n// ```\n````",
    );
  });

  it("keeps text inside unknown containers and escapes literal Markdown", () => {
    expect(
      mymindContentText({
        type: "application/prose+json",
        body: {
          type: "doc",
          content: [
            {
              type: "customContainer",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "# [literal] *text*" }],
                },
              ],
            },
          ],
        },
      }),
    ).toBe("\\# \\[literal\\] \\*text\\*");
  });

  it("rejects invalid bodies and unsupported leaves instead of dropping content", () => {
    const invalid: NonNullable<MymindObject["content"]>[] = [
      { type: "text/markdown", body: {} },
      { type: "text/plain", body: 12 },
      { type: "text/html", body: "<p>Text</p>" },
      { type: "application/prose+json", body: { text: "Missing node type" } },
      {
        type: "application/prose+json",
        body: { type: "image", attrs: { src: "https://example.com/image" } },
      },
      { type: "application/prose+json", body: { type: "text" } },
      {
        type: "application/prose+json",
        body: { type: "text", text: "Link", marks: [{ type: "link" }] },
      },
    ];
    for (const content of invalid) {
      expect(() => mymindContentText(content)).toThrow(
        "mymind returned invalid note content.",
      );
    }
  });
});
