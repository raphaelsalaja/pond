/** pond:// video taints a renderer canvas, so the frame is decoded in main from the file at currentTime. */

import { z } from "zod";
import { notify } from "@/shared/lib/toast";

const OkSchema = z
  .object({ ok: z.boolean().catch(false) })
  .catch({ ok: false });

type FrameParams = {
  src: string;
  timeSec: number;
};

function frameParams(video: HTMLVideoElement): FrameParams | null {
  const src = video.currentSrc || video.src;
  if (!src) return null;
  return { src, timeSec: video.currentTime };
}

export async function copyVideoFrame(video: HTMLVideoElement): Promise<void> {
  const params = frameParams(video);
  if (!params) return;
  const result = OkSchema.parse(
    await window.pond.query("video.copyFrame", params),
  );
  if (!result.ok) return;
  notify({
    id: "copy-frame",
    title: "Frame copied to clipboard",
  });
}

export async function saveVideoFrame(video: HTMLVideoElement): Promise<void> {
  const params = frameParams(video);
  if (!params) return;
  const result = OkSchema.parse(
    await window.pond.query("video.saveFrame", params),
  );
  if (!result.ok) return;
  notify({
    id: "save-frame",
    title: "Frame saved",
  });
}

export async function setVideoThumbnail(
  saveId: string,
  video: HTMLVideoElement,
): Promise<void> {
  const params = frameParams(video);
  if (!params) return;
  await window.pond.query("video.setThumbnail", { saveId, ...params });
}
