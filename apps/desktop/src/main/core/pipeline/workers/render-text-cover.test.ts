import { describe, expect, it, vi } from "vitest";
import {
  type RenderTextCoverRuntime,
  runRenderTextCover,
  type TextCoverSave,
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

function setup() {
  const readSave = vi.fn(async () => save);
  const persistSave = vi.fn<RenderTextCoverRuntime["persistSave"]>(
    async () => null,
  );
  const renderCard = vi.fn(async () => ({
    bytes: Buffer.from("png"),
    width: 550,
    height: 1400,
  }));
  const runtime: RenderTextCoverRuntime = { readSave, persistSave, renderCard };
  return { runtime, readSave, persistSave, renderCard };
}

describe("runRenderTextCover", () => {
  it("serves the pipeline and the visible card from one render", async () => {
    const { runtime, renderCard, persistSave } = setup();

    const [pipeline, card] = await Promise.all([
      runRenderTextCover("save-1", {}, runtime),
      runRenderTextCover("save-1", {}, runtime),
    ]);

    expect(pipeline).toBe(2);
    expect(card).toBe(2);
    // One light card and one dark card, not two of each.
    expect(renderCard).toHaveBeenCalledTimes(2);
    // Two cover files plus the version stamp.
    expect(persistSave).toHaveBeenCalledTimes(3);
  });

  it("renders again once the first attempt has finished", async () => {
    const { runtime, renderCard } = setup();

    await runRenderTextCover("save-1", {}, runtime);
    await runRenderTextCover("save-1", {}, runtime);

    expect(renderCard).toHaveBeenCalledTimes(4);
  });

  it("skips a save that already has visual media", async () => {
    const { runtime, renderCard } = setup();
    vi.mocked(runtime.readSave).mockResolvedValueOnce({
      ...save,
      files: [{ kind: "image", path: "cover.jpg", sha256: "", size: 1 }],
    });

    await expect(runRenderTextCover("save-1", {}, runtime)).resolves.toBe(0);
    expect(renderCard).not.toHaveBeenCalled();
  });

  it("keeps the save when the card cannot be captured", async () => {
    const { runtime, persistSave } = setup();
    vi.mocked(runtime.renderCard).mockResolvedValueOnce(null);

    await expect(runRenderTextCover("save-1", {}, runtime)).resolves.toBe(0);
    expect(persistSave).not.toHaveBeenCalled();
  });
});
