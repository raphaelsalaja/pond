import { describe, expect, it } from "vitest";
import { runRenderTextCover } from "./render-text-cover";
import type {
  RenderTextCoverRuntime,
  TextCoverSave,
} from "./render-text-cover";

const save: TextCoverSave = {
  id: "save-1",
  source: "web",
  sourceId: "https://example.com/notes",
  url: "https://example.com/notes",
  title: "Notes",
  description: "A short page",
  mediaType: null,
  files: [],
  rawJson: null,
};

type SearchCard = Parameters<RenderTextCoverRuntime["renderSearchCard"]>[0];

function setup({
  stored = save,
  cardMisses = false,
}: { stored?: TextCoverSave; cardMisses?: boolean } = {}) {
  const searchCards: Array<[SearchCard, "light" | "dark"]> = [];
  const calls = { cards: 0, persists: 0, searchCards };
  const runtime: RenderTextCoverRuntime = {
    readSave: async () => stored,
    persistSave: async () => {
      calls.persists += 1;
      return null;
    },
    renderCard: async () => {
      calls.cards += 1;
      return cardMisses
        ? null
        : { bytes: Buffer.from("png"), width: 550, height: 1400 };
    },
    renderSearchCard: async (search, scheme) => {
      calls.searchCards.push([search, scheme]);
      return { bytes: Buffer.from("png"), width: 550, height: 288 };
    },
  };
  return { runtime, calls };
}

describe("runRenderTextCover", () => {
  it("serves the pipeline and the visible card from one render", async () => {
    const { runtime, calls } = setup();

    const [pipeline, card] = await Promise.all([
      runRenderTextCover("save-1", {}, runtime),
      runRenderTextCover("save-1", {}, runtime),
    ]);

    expect(pipeline).toBe(2);
    expect(card).toBe(2);
    /** One light card and one dark card, not two of each. */
    expect(calls.cards).toBe(2);
    /** Two cover files plus the version stamp. */
    expect(calls.persists).toBe(3);
  });

  it("renders again once the first attempt has finished", async () => {
    const { runtime, calls } = setup();

    await runRenderTextCover("save-1", {}, runtime);
    await runRenderTextCover("save-1", {}, runtime);

    expect(calls.cards).toBe(4);
  });

  it("skips a save that already has visual media", async () => {
    const { runtime, calls } = setup({
      stored: {
        ...save,
        files: [{ kind: "image", path: "cover.jpg", sha256: "", size: 1 }],
      },
    });

    await expect(runRenderTextCover("save-1", {}, runtime)).resolves.toBe(0);
    expect(calls.cards).toBe(0);
  });

  it("draws a search card for a search results page without a description", async () => {
    const url = "https://www.google.com/search?q=malaga";
    const { runtime, calls } = setup({
      stored: {
        ...save,
        url,
        title: "malaga",
        description: null,
        files: [
          { kind: "source_icon", path: "icon.png", sha256: "", size: 1 },
        ],
        rawJson: {
          capture: {
            id: url,
            source: "web",
            url,
            media: [],
            extras: { search: { engine: "Google Search", query: "malaga" } },
          },
          extractorId: "web",
          extractedAt: "2026-11-22T00:00:00.000Z",
        },
      },
    });

    await expect(runRenderTextCover("save-1", {}, runtime)).resolves.toBe(2);
    expect(calls.cards).toBe(0);
    expect(calls.searchCards).toContainEqual([
      expect.objectContaining({ engine: "Google Search", query: "malaga" }),
      "light",
    ]);
    expect(calls.searchCards).toContainEqual([
      expect.objectContaining({ engine: "Google Search", query: "malaga" }),
      "dark",
    ]);
  });

  it("keeps the save when the card cannot be captured", async () => {
    const { runtime, calls } = setup({ cardMisses: true });

    await expect(runRenderTextCover("save-1", {}, runtime)).resolves.toBe(0);
    expect(calls.persists).toBe(0);
  });
});
