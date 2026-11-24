import { clsx as cn } from "clsx";
import { useVideo } from "../context";
import { SPEED_OPTIONS } from "../lib";
import styles from "./styles.module.css";

interface SpeedSelectProps {
  className?: string;
  options?: ReadonlyArray<number>;
}

export function SpeedSelect({
  className,
  options = SPEED_OPTIONS,
}: SpeedSelectProps) {
  const { state, actions, chrome } = useVideo();
  return (
    <select
      className={cn(styles.root, className)}
      data-chrome={chrome || undefined}
      value={state.rate}
      onChange={(event) => actions.setRate(Number(event.target.value))}
      aria-label="Playback Speed"
    >
      {options.map((rate) => (
        <option key={rate} value={rate}>
          {rate}×
        </option>
      ))}
    </select>
  );
}
