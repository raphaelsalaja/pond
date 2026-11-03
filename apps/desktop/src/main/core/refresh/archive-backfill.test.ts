import { describe, expect, it, vi } from "vitest";
import { startArchiveBackfill } from "./archive-backfill";

describe("archive backfill", () => {
  it("does not queue archives when automatic archiving is off", async () => {
    const autoArchive = vi.fn(async () => false);

    await expect(startArchiveBackfill(autoArchive)).resolves.toEqual({
      ok: true,
      queued: 0,
    });
    expect(autoArchive).toHaveBeenCalled();
  });
});
