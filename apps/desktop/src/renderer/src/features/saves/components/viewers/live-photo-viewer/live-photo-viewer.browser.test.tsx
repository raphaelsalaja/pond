import JSZip from "jszip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LivePhotoViewer } from "./";

it.each([
  {
    captions: "with",
    extra: { "captions.vtt": "WEBVTT\n\n00:00.000 --> 00:01.000\nBirdsong\n" },
    track: expect.stringMatching(/^blob:/),
    revoked: 3,
  },
  { captions: "without", extra: {}, track: null, revoked: 2 },
])(
  "renders only supplied caption tracks ($captions captions)",
  async ({ extra, track, revoked }) => {
    const archive = new JSZip()
      .file("photo.jpg", "image")
      .file("motion.mov", "movie");
    for (const [name, body] of Object.entries(extra)) {
      archive.file(name, body);
    }
    const fixture = URL.createObjectURL(
      await archive.generateAsync({ type: "blob" }),
    );
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <LivePhotoViewer
            url={fixture}
            onUnavailable={() => {
              throw new Error("Fixture unavailable");
            }}
          />,
        ),
      );
      await vi.waitFor(async () => {
        await act(async () => {
          await Promise.resolve();
        });
        expect(host.querySelector("img")).not.toBeNull();
      });
      const motion = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Motion"]',
      );
      expect(motion?.textContent?.trim()).toBe("");
      await act(async () => motion?.click());
      expect(motion?.getAttribute("aria-pressed")).toBe("true");
      expect(host.querySelector("video")?.controls).toBe(true);
      expect(
        host.querySelector('track[kind="captions"]')?.getAttribute("src") ??
          null,
      ).toEqual(track);
    } finally {
      await act(async () => root.unmount());
      expect(revoke).toHaveBeenCalledTimes(revoked);
      host.remove();
      vi.restoreAllMocks();
      URL.revokeObjectURL(fixture);
    }
  },
);
