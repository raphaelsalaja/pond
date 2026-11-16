import {
  IconMediaFastBackwards,
  IconMediaFastForward,
  IconMediaPause,
  IconMediaPlay,
} from "@pond/icons";
import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { Clip } from "../lib/clip";
import type { Player } from "../lib/player";
import { formatClock } from "../lib/range";
import styles from "./styles.module.css";

interface TransportProps extends React.ComponentPropsWithoutRef<"div"> {
  clip: Clip;
  player: Player;
}

/** Time, start and end jumps around play, and the trimmed length. */
export function Transport({
  clip,
  player,
  className,
  ...props
}: TransportProps) {
  const { range, duration } = clip;
  const bounded = duration > 0 && !clip.probe.isLive;
  return (
    <div className={cn(styles.transport, className)} {...props}>
      <span className={styles.clock}>
        {bounded || player.playable ? formatClock(player.time) : null}
        {bounded ? (
          <span className={styles.total}> / {formatClock(duration)}</span>
        ) : null}
      </span>
      <div className={styles.buttons}>
        {bounded ? (
          <Button
            icon
            size="sm"
            variant="ghost"
            aria-label="Go to Start"
            onClick={() => player.seek(range.start)}
          >
            <IconMediaFastBackwards size={16} />
          </Button>
        ) : null}
        <Button
          icon
          size="md"
          variant="ghost"
          aria-label={player.playing ? "Pause" : "Play"}
          disabled={!player.playable}
          onClick={player.toggle}
        >
          {player.playing ? <IconMediaPause /> : <IconMediaPlay />}
        </Button>
        {bounded ? (
          <Button
            icon
            size="sm"
            variant="ghost"
            aria-label="Go to End"
            onClick={() => player.seek(range.end)}
          >
            <IconMediaFastForward size={16} />
          </Button>
        ) : null}
      </div>
      <span className={styles.length}>
        {bounded && !clip.full
          ? `Clip ${formatClock(range.end - range.start)}`
          : null}
      </span>
    </div>
  );
}
