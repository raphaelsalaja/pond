import type { ReactNode } from "react";
import { useSaveCardModel } from "@/features/saves/components/card/model";
import { Card } from "@/features/saves/components/card/parts";
import { GridCard } from "@/features/saves/components/card/views/grid";
import { useSave } from "@/features/saves/hooks/use-saves";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

/** Takes a ref like a button, so a popover or tooltip can anchor to the card itself. */
interface SaveTileProps extends Omit<React.ComponentProps<"button">, "title"> {
  saveId?: string | null;
  selected?: boolean;
  dimmed?: boolean;
  detail?: ReactNode;
  /** Shown when the Save is missing or not loaded yet. */
  fallback?: { icon: ReactNode; title: string };
  /** The file type, count and Source badges over the picture; on by default, as in the Library grid. */
  badges?: boolean;
  width?: number;
  children?: ReactNode;
}

function Body({
  save,
  width,
  detail,
  badges,
}: {
  save: Save;
  width: number;
  detail?: ReactNode;
  badges: boolean;
}) {
  const model = useSaveCardModel(save, true);
  return (
    <GridCard model={model} width={width} detail={detail} overlay={badges} />
  );
}

/** A Library grid card that flows in normal layout, for Saves shown outside the Library view. */
export function SaveTile({
  saveId,
  selected,
  dimmed,
  detail,
  fallback,
  badges = true,
  width = 160,
  children,
  className,
  ...props
}: SaveTileProps) {
  const save = useSave(saveId);
  return (
    <Card.Root
      className={styles.tile}
      selected={selected}
      dimmed={dimmed}
      data-save-id={saveId ?? undefined}
    >
      <Card.Select className={className} {...props}>
        {save ? (
          <Body save={save} width={width} detail={detail} badges={badges} />
        ) : (
          <>
            <Card.Media className={styles.placeholder}>
              {fallback?.icon}
            </Card.Media>
            <Card.Meta title={fallback?.title} time={detail} />
          </>
        )}
      </Card.Select>
      {children ? <div className={styles.controls}>{children}</div> : null}
    </Card.Root>
  );
}
