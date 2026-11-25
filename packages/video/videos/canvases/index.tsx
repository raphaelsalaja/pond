import {
  Camera,
  Caption,
  defineVideo,
  ease,
  Fade,
  Frame,
  Lockup,
  progress,
  WHOLE,
} from "@pond/video";
import { LOOKS, media } from "./data";
import { CUES, DURATION, end, start } from "./timeline";
import { CanvasWindow } from "./window";

const BRANDS = {
  Canvases: { color: "var(--ds-blue)" },
};

/** Stage-space crops the camera eases between. */
const CAMERA = [
  { at: 0, ...WHOLE, move: 1 },
  { at: start("notes") + 500, x: 300, y: 180, width: 1600, move: 1000 },
  { at: CUES.pullBack + 900, ...WHOLE, move: 1000 },
];

function Composition({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.windowRise, 1150));
  const hide = ease.inOut(progress(t, CUES.logo - 700, 450));
  const opacity =
    (t < CUES.windowRise ? 0 : Math.min(1, rise * 3)) * (1 - hide);
  const fades = opacity * ease.inOut(progress(t, start("board") + 200, 500));
  return (
    <Frame>
      <Camera t={t} keys={CAMERA} opacity={opacity}>
        <CanvasWindow
          t={t}
          style={{ transform: `translateY(${(1 - rise) * 700}px)` }}
        />
      </Camera>
      <Fade edge="top" height={230} opacity={fades} />
      <Lockup t={t} enter={CUES.logo} />
      <Caption
        t={t}
        y={540}
        size={56}
        text="Pond now has [Canvases]."
        brands={BRANDS}
        enter={start("hook") + 200}
        exit={CUES.windowRise - 420}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Arrange saves from any folder."
        enter={start("board") + 700}
        exit={end("board") - 300}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Add notes and drawings."
        enter={start("notes") + 300}
        exit={end("notes") - 350}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Link them with connectors."
        enter={start("link") + 250}
        exit={end("link") - 300}
      />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond: Canvases",
  duration: DURATION,
  poster: 15_200,
  media: Object.values(LOOKS).map((look) => media(look.id)),
  Composition,
});
