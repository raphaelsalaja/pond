import { IconDots } from "@pond/icons";
import { Button, Chip, Popover, Tooltip } from "@pond/ui";
import {
  FISH_COLORS,
  FISH_SPECIES,
  type FishColor,
  type FishSummary,
} from "@shared/fish-contracts";
import { useRef } from "react";
import { updateFish } from "../../../lib/menu";
import { FishMark, fishColorCss, fishMood, SPECIES_LABELS } from "../../mark";
import styles from "./styles.module.css";

const COLOR_LABELS = {
  red: "Red",
  orange: "Orange",
  gold: "Gold",
  yellow: "Yellow",
  lime: "Lime",
  green: "Green",
  jade: "Jade",
  teal: "Teal",
  cyan: "Cyan",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  purple: "Purple",
  magenta: "Magenta",
  pink: "Pink",
} satisfies Record<FishColor, string>;

export function FishAppearance({ fish }: { fish: FishSummary }) {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rowRef} className={styles.row}>
      <div className={styles.tile}>
        <FishMark
          key={`${fish.color}-${fish.species}`}
          color={fish.color}
          species={fish.species}
          activity={fish.activity}
          mood={fishMood(fish)}
          size={56}
        />
        <Popover.Root>
          <Tooltip label="Species and Color">
            <Popover.Trigger
              render={
                <Button
                  type="button"
                  icon
                  size="sm"
                  variant="secondary"
                  rounding="full"
                  className={styles.edit}
                  aria-label="Species and Color"
                />
              }
            >
              <IconDots size={12} />
            </Popover.Trigger>
          </Tooltip>
          <Popover.Portal>
            <Popover.Positioner anchor={rowRef} side="bottom" sideOffset={8}>
              <Popover.Popup
                className={styles.picker}
                aria-label="Species and Color"
              >
                <div className={styles.grid}>
                  {FISH_SPECIES.map((species) => (
                    <Button
                      key={species}
                      type="button"
                      icon
                      size="md"
                      className={styles.cell}
                      variant={fish.species === species ? "tertiary" : "ghost"}
                      aria-label={SPECIES_LABELS[species]}
                      aria-pressed={fish.species === species}
                      onClick={() => updateFish(fish, { species })}
                    >
                      <FishMark
                        color={fish.color}
                        species={species}
                        size={28}
                      />
                    </Button>
                  ))}
                </div>
                <div className={styles.divider} aria-hidden />
                <div className={styles.grid}>
                  {FISH_COLORS.map((color) => (
                    <Button
                      key={color}
                      type="button"
                      icon
                      size="md"
                      className={styles.cell}
                      variant="ghost"
                      aria-label={COLOR_LABELS[color]}
                      aria-pressed={fish.color === color}
                      onClick={() => updateFish(fish, { color })}
                    >
                      <Chip.Swatch
                        className={styles.swatch}
                        color={fishColorCss(color)}
                        selected={fish.color === color}
                      />
                    </Button>
                  ))}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
