import { describe, expect, it, vi } from "vitest";
import {
  formatShare,
  labelForExtension,
  labelForKind,
  labelForSourceIdentity,
  labelForType,
} from "./labels";

vi.mock("@/features/sources", () => {
  const defs: Record<string, { source: string; label: string }> = {
    local: { source: "local", label: "Local" },
    "rss:feed": { source: "rss", label: "RSS" },
  };
  return { getSourceDefForIdentity: (identity: string) => defs[identity] };
});

describe("storage labels", () => {
  it("names media types the way the Library filter does", () => {
    expect(labelForType("link")).toBe("Website");
    expect(labelForType("image")).toBe("Image");
    expect(labelForType("3d_model")).toBe("3d Model");
  });

  it("names file kinds and extensions for display", () => {
    expect(labelForKind("thumbnail_dark")).toBe("Dark Thumbnail");
    expect(labelForKind("video")).toBe("Video");
    expect(labelForExtension("mp4")).toBe("MP4");
  });

  it("names sources by identity", () => {
    expect(labelForSourceIdentity("local")).toBe("Local Files");
    expect(labelForSourceIdentity("rss:feed")).toBe("RSS");
    expect(labelForSourceIdentity("unknown")).toBe("unknown");
  });

  it("rounds shares and keeps tiny ones visible", () => {
    expect(formatShare(250, 1000)).toBe("25%");
    expect(formatShare(1, 1000)).toBe("<1%");
    expect(formatShare(0, 1000)).toBe("0%");
    expect(formatShare(10, 0)).toBe("0%");
  });
});
