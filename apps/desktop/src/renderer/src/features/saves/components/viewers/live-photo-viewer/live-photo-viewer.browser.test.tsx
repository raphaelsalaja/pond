import JSZip from "jszip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LivePhotoViewer } from "./";

it.each([true, false])(
  "renders only supplied caption tracks (captions: %s)",
  async (captions) => {
    const archive = new JSZip()
      .file("photo.jpg", "image")
      .file("motion.mov", "movie");
    if (captions) {
      archive.file(
        "captions.vtt",
        "WEBVTT\n\n00:00.000 --> 00:01.000\nBirdsong\n",
      );
    }
    const buffer = await archive.generateAsync({ type: "arraybuffer" });
    vi.stubGlobal("fetch", async () => new Response(buffer));
    const createDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const revokeDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    let sequence = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => `blob:live-photo-${++sequence}`,
    });
    const revoke = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <LivePhotoViewer
            url="pond://fixture/photo.livp"
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
      ).toBe(captions ? "blob:live-photo-3" : null);
    } finally {
      await act(async () => root.unmount());
      expect(revoke).toHaveBeenCalledTimes(captions ? 3 : 2);
      host.remove();
      if (createDescriptor) {
        Object.defineProperty(URL, "createObjectURL", createDescriptor);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (revokeDescriptor) {
        Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
      vi.unstubAllGlobals();
    }
  },
);
