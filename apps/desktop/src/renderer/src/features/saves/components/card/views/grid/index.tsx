import type React from "react";
import { PreparedCardThumb } from "@/features/saves/components/card/media";
import { Card } from "@/features/saves/components/card/parts";
import type { SaveCardViewProps } from "@/features/saves/components/card/views/types";
import styles from "./styles.module.css";

interface FrameStyle extends React.CSSProperties {
  "--frame-aspect": string;
  "--frame-width": string;
}

export function GridCard({
  model,
  width,
  detail,
  overlay = true,
}: SaveCardViewProps & {
  /** The file type, count and Source badges over the picture; off where the card is only a reference. */
  overlay?: boolean;
}) {
  const frameStyle: FrameStyle = {
    "--frame-aspect": String(model.aspect),
    "--frame-width": `${Math.min(1, model.aspect) * 100}%`,
  };

  return (
    <>
      <Card.Media className={styles.media}>
        <Card.Frame className={styles.frame} style={frameStyle}>
          <PreparedCardThumb
            save={model.save}
            view="grid"
            width={width}
            mediaUnits={model.mediaUnits}
            pickOptions={model.pickOptions}
            unit={model.unit}
            primary={model.primary}
          />
        </Card.Frame>
        {overlay ? <Card.Overlay model={model.overlay} /> : null}
      </Card.Media>
      <Card.Meta title={model.title} time={detail ?? model.time} />
    </>
  );
}
