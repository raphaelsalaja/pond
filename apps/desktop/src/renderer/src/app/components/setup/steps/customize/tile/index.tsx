import { Switch } from "@pond/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import type { OptionId, StepProps } from "../../../model";
import styles from "./styles.module.css";

export interface TileSpec {
  id: OptionId;
  title: string;
  /** Named area in the grid template. */
  area: string;
  visual: ReactNode;
}

export function Tile({
  id,
  title,
  area,
  visual,
  choices,
  update,
}: StepProps & TileSpec) {
  const titleId = useId();
  const disabled =
    id === "enableAutoTitle" &&
    !choices.options.enableCaption &&
    !choices.options.enableOcr;
  return (
    <div
      className={styles.tile}
      style={{ gridArea: area }}
      data-disabled={disabled || undefined}
    >
      <div className={styles.visual} aria-hidden>
        {visual}
      </div>
      <div className={styles.footer}>
        <p id={titleId} className={styles.title}>
          {title}
        </p>
        <Switch.Root
          aria-labelledby={titleId}
          checked={choices.options[id]}
          disabled={disabled}
          onCheckedChange={(checked) =>
            update({ options: { ...choices.options, [id]: checked } })
          }
        />
      </div>
    </div>
  );
}
