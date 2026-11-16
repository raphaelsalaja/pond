import { clsx as cn } from "clsx";
import type { ReactNode } from "react";
import { Button } from "../button";
import { Input } from "../input";
import styles from "./styles.module.css";

function clamp(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Native number stepping snaps to `min`, so arrows step from the shown value like the buttons do. */
function stepDirection(key: string) {
  if (key === "ArrowUp") return 1;
  if (key === "ArrowDown") return -1;
  return 0;
}

type StepperName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

type StepperProps = StepperFields & StepperName;

interface StepperFields {
  value: number;
  min: number;
  max: number;
  step?: number;
  fallback?: number;
  onValueChange: (next: number) => void;
  decrementIcon: ReactNode;
  incrementIcon: ReactNode;
  resetIcon?: ReactNode;
  decrementLabel?: string;
  incrementLabel?: string;
  resetLabel?: string;
  "aria-describedby"?: string;
  className?: string;
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  fallback = min,
  onValueChange,
  decrementIcon,
  incrementIcon,
  resetIcon,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
  resetLabel = "Reset",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  className,
}: StepperProps) {
  const safe = Number.isFinite(value) ? value : fallback;
  const set = (next: number) => onValueChange(clamp(next, min, max, fallback));

  return (
    <fieldset
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(styles.root, className)}
    >
      <Button
        size="xs"
        variant="ghost"
        aria-label={decrementLabel}
        onClick={() => set(safe - step)}
        disabled={safe <= min}
      >
        {decrementIcon}
      </Button>
      <Input.Field
        type="number"
        min={min}
        max={max}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        value={String(safe)}
        onChange={(e) => set(Number(e.target.value) || fallback)}
        onKeyDown={(event) => {
          const delta = stepDirection(event.key);
          if (delta === 0) return;
          event.preventDefault();
          set(safe + delta * step);
        }}
        className={styles.input}
      />
      <Button
        size="xs"
        variant="ghost"
        aria-label={incrementLabel}
        onClick={() => set(safe + step)}
        disabled={safe >= max}
      >
        {incrementIcon}
      </Button>
      {resetIcon ? (
        <Button
          size="xs"
          variant="ghost"
          aria-label={resetLabel}
          onClick={() => onValueChange(fallback)}
          disabled={safe === fallback}
        >
          {resetIcon}
        </Button>
      ) : null}
    </fieldset>
  );
}
