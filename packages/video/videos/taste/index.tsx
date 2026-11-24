import { Caption, defineVideo, Fade, Frame, Lockup } from "@pond/video";
import { Audit } from "./audit";
import { Board } from "./board";
import { MEDIA } from "./data";
import { Lab } from "./lab";
import { Prompt } from "./prompt";
import { CUES, DURATION, end, start } from "./timeline";

const TOP = { y: 118, size: 54 };

function Composition({ t }: { t: number }) {
  const washed = t >= CUES.boardIn && t < CUES.auditOut + 400 ? 1 : 0;
  return (
    <Frame>
      <Prompt t={t} />
      <Board t={t} />
      <Lab t={t} />
      <Audit t={t} />
      <Fade edge="top" height={290} opacity={washed} />
      <Fade edge="bottom" opacity={washed} />
      <Caption
        t={t}
        {...TOP}
        text="I ask Pond for references."
        enter={start("prompt") + 250}
        exit={CUES.promptOut - 100}
      />
      <Caption
        t={t}
        {...TOP}
        text="Gather puts all 77 on one board."
        enter={CUES.boardIn + 300}
        exit={CUES.boardOut - 150}
      />
      <Caption
        t={t}
        {...TOP}
        text="Lab opens every state of the real dialog."
        enter={CUES.labIn + 250}
        exit={CUES.labOut - 150}
      />
      <Caption
        t={t}
        {...TOP}
        text="Audit checks it against my standards."
        enter={CUES.auditIn + 250}
        exit={CUES.auditOut - 150}
      />
      <Caption
        t={t}
        y={540}
        size={72}
        text="My {taste}, in every prompt."
        enter={start("taste") + 200}
        exit={end("taste") - 450}
      />
      <Lockup t={t} enter={CUES.logo} />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond: My taste, in every prompt",
  duration: DURATION,
  poster: 10_800,
  media: MEDIA,
  Composition,
});
