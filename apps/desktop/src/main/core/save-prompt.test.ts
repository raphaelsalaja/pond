import { describe, expect, it } from "vitest";
import { type PromptSave, savesPrompt } from "./save-prompt";

const tweet: PromptSave = {
  source: "twitter",
  url: "https://x.com/rauno/status/1",
  title: "Hover states",
  author: "@raunofreiberg",
  description: "Small details in hover states.",
  notes: null,
  tags: ["motion", "interaction"],
  ocrText: "  Hover me  ",
  transcript: "",
};

describe("savesPrompt", () => {
  it("lists metadata, files, and only the text a Save has", () => {
    expect(
      savesPrompt([
        {
          save: tweet,
          link: "pond://item/a?library=main",
          files: ["/library/a/video.mp4"],
        },
      ]),
    ).toBe(
      [
        "## Hover states",
        "Source: Twitter, by @raunofreiberg",
        "URL: https://x.com/rauno/status/1",
        "Pond: pond://item/a?library=main",
        "Files:",
        "- /library/a/video.mp4",
        "Tags: motion, interaction",
        "",
        "### Description",
        "Small details in hover states.",
        "",
        "### Text in Image",
        "Hover me",
      ].join("\n"),
    );
  });

  it("drops non-web URLs and names untitled Saves", () => {
    const prompt = savesPrompt([
      {
        save: {
          source: "local",
          url: "file:///Users/me/shot.png",
          title: " ",
          author: null,
          description: null,
          notes: null,
          tags: [],
        },
        link: "pond://item/b?library=main",
        files: [],
      },
    ]);
    expect(prompt).toBe(
      "## Untitled\nSource: Local\nPond: pond://item/b?library=main",
    );
  });

  it("separates multiple Saves", () => {
    const entry = { save: tweet, link: "pond://item/a", files: [] };
    expect(savesPrompt([entry, entry]).split("## Hover states")).toHaveLength(
      3,
    );
  });
});
