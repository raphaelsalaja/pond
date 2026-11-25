import { Caption, defineVideo, Frame, Lockup } from "@pond/video";
import { Chat, DOCK, FLY } from "./chat";
import { ALL_MEDIA, MODELS } from "./data";
import { Intro } from "./intro";
import { Library } from "./library";
import { Orbit } from "./orbit";
import { Roll } from "./roll";
import { School } from "./school";
import { Substack } from "./substack";
import { CUES, DURATION, end, start } from "./timeline";

const TOP = { y: 118, size: 54 };
const MIDDLE = { y: 540, size: 64 };

function Composition({ t }: { t: number }) {
  return (
    <Frame>
      <School t={t} />
      <Intro
        t={t}
        enter={CUES.introLine}
        exit={CUES.introOut}
        dock={DOCK}
        fly={FLY}
      />
      <Chat t={t} />
      <Caption
        t={t}
        {...TOP}
        text="Ask about your saves."
        enter={CUES.chatRise + 700}
        exit={end("ask") - 300}
      />
      <Caption
        t={t}
        {...TOP}
        text="Run routines when new saves arrive."
        enter={start("routine") + 100}
        exit={end("routine") - 250}
      />
      <Caption
        t={t}
        {...TOP}
        text="Every change waits for your review."
        enter={start("review") + 100}
        exit={CUES.chatAway}
      />
      <Roll
        t={t}
        prefix="Your fish run on"
        items={MODELS}
        enter={start("model") + 300}
        roll={CUES.modelRoll}
        step={CUES.modelStep}
        exit={start("model") + 4300}
      />
      <Library t={t} />
      <Caption
        t={t}
        {...TOP}
        text="Pond 2.0 also introduces a cleaner library."
        enter={start("library") + 500}
        exit={end("library") - 250}
      />
      <Caption
        t={t}
        {...TOP}
        text="Cleaner previews."
        enter={start("preview") + 150}
        exit={end("preview") - 700}
      />
      <Caption
        t={t}
        {...MIDDLE}
        text="Pond 2.0 syncs nine new sources."
        enter={CUES.burst + 250}
        exit={CUES.substackFly - 600}
      />
      <Substack t={t} />
      <Orbit
        t={t}
        enter={CUES.burst}
        step={CUES.burstStep}
        exit={CUES.substackFly - 700}
        fly={CUES.substackFly}
      />
      <Caption
        t={t}
        {...TOP}
        text="Read Substack posts right in Pond."
        enter={CUES.substackFly + 900}
        exit={end("substack") - 300}
      />
      <Caption
        t={t}
        {...MIDDLE}
        text="And many more features and optimizations."
        enter={start("more") - 200}
        exit={end("more") - 300}
      />
      <Caption
        t={t}
        y={540}
        size={72}
        text="Pond {2.0} is out now."
        brands={{ "2.0": { color: "var(--ds-orange)" } }}
        enter={start("release") + 150}
        exit={end("release") - 400}
      />
      <Lockup t={t} enter={CUES.logo} />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond 2.0",
  duration: DURATION,
  poster: 29_300,
  media: ALL_MEDIA,
  Composition,
});
