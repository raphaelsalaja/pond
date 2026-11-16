import { Caption, defineVideo, Frame, Lockup } from "@pond/video";
import { BRANDS, RIVALS } from "./data";
import { Table } from "./table";
import { CUES, DURATION, end, start } from "./timeline";

function Composition({ t }: { t: number }) {
  return (
    <Frame>
      <Table t={t} />
      <Lockup t={t} enter={CUES.logo} />
      <Caption
        t={t}
        y={540}
        size={54}
        text="Pond next to [mymind], [Eagle], [Raindrop.io] and [Karakeep]."
        brands={BRANDS}
        enter={start("hook") + 200}
        exit={CUES.tableRise - 450}
      />
      <Caption
        t={t}
        y={78}
        size={50}
        text="Only {Pond} has a check in every row."
        enter={CUES.verdict + 200}
        exit={end("table") - 700}
      />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond: how it compares",
  duration: DURATION,
  poster: CUES.verdict + 1800,
  media: RIVALS.map((rival) => rival.logo),
  Composition,
});
