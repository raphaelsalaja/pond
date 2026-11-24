import "./global.css";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { video } from "virtual:video";
import { FPS } from "../src/video";

const element = document.getElementById("stage");
if (!element) {
  throw new Error("#stage element missing");
}
document.title = video.title;
const root = createRoot(element);
const render = (t: number) =>
  flushSync(() => root.render(<video.Composition t={t} />));

const held: Array<HTMLImageElement> = [];
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

/** The seek API that `cli/capture.cjs` drives, one frame at a time. */
Object.assign(window, {
  __stage: {
    duration: video.duration,
    fps: FPS,
    poster: video.poster,
    async ready() {
      await Promise.all(
        video.media.map((src) => {
          const image = new Image();
          image.src = src;
          held.push(image);
          return image.decode().catch(() => undefined);
        }),
      );
      await document.fonts.ready;
      return true;
    },
    async seek(t: number) {
      render(t);
      await nextFrame();
      await nextFrame();
    },
  },
});

const query = new URLSearchParams(location.search);
const at = query.get("t");
render(at ? Number(at) : 0);

if (!at && query.has("play")) {
  const begin = performance.now();
  const loop = () => {
    render((performance.now() - begin) % video.duration);
    requestAnimationFrame(loop);
  };
  loop();
}
