import { IconCompass, IconMinus, IconPlus } from "@pond/icons";
import { Button, Keyboard, Tooltip } from "@pond/ui";
import { useReactFlow, useViewport } from "@xyflow/react";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

interface ZoomProps {
  minimap: boolean;
  onMinimap(): void;
}

export function Zoom({ minimap, onMinimap }: ZoomProps) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const minimapLabel = minimap ? "Hide Minimap" : "Show Minimap";
  return (
    <Tooltip.Group>
      <fieldset className={styles.zoom} aria-label="Zoom">
        <Tooltip label="Zoom Out" side="bottom">
          <Button
            rounding="full"
            icon
            size="xs"
            variant="text"
            aria-label="Zoom Out"
            onClick={() => void flow.zoomOut({ duration: 150 })}
          >
            <IconMinus size={12} />
          </Button>
        </Tooltip>
        <Tooltip
          label="Zoom to Fit"
          shortcut={<Keyboard.Cluster keys={platformGlyphs(["⇧", "1"])} />}
          side="bottom"
        >
          <Button
            rounding="full"
            size="xs"
            variant="text"
            className={styles.level}
            aria-label={`Zoom ${Math.round(zoom * 100)}%. Zoom to Fit`}
            onClick={() => void flow.fitView({ duration: 200, padding: 0.2 })}
          >
            {Math.round(zoom * 100)}%
          </Button>
        </Tooltip>
        <Tooltip label="Zoom In" side="bottom">
          <Button
            rounding="full"
            icon
            size="xs"
            variant="text"
            aria-label="Zoom In"
            onClick={() => void flow.zoomIn({ duration: 150 })}
          >
            <IconPlus size={12} />
          </Button>
        </Tooltip>
        <span className={styles.divider} aria-hidden="true" />
        <Tooltip label={minimapLabel} side="bottom">
          <Button
            rounding="full"
            icon
            size="xs"
            variant="text"
            aria-label={minimapLabel}
            aria-pressed={minimap}
            data-pressed={minimap || undefined}
            onClick={onMinimap}
          >
            <IconCompass size={12} />
          </Button>
        </Tooltip>
      </fieldset>
    </Tooltip.Group>
  );
}
