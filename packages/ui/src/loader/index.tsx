import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type RootProps = React.ComponentPropsWithoutRef<"span">;

function Root({ className, ...props }: RootProps) {
  return (
    <span role="status" className={cn(styles.root, className)} {...props} />
  );
}

type DotsProps = React.ComponentPropsWithoutRef<"span">;

function Dots({ className, ...props }: DotsProps) {
  return (
    <span className={cn(styles.dots, className)} aria-hidden {...props}>
      <span />
      <span />
      <span />
    </span>
  );
}

/** Same ring geometry as the desktop Harvester mark; change both together. */
const SPINNER_VIEW_BOX = 207;
const SPINNER_RADIUS = 77;
const SPINNER_THICKNESS = 30;

type SpinnerProps = React.ComponentPropsWithoutRef<"svg">;

function Spinner({ className, ...props }: SpinnerProps) {
  const center = SPINNER_VIEW_BOX / 2;
  return (
    <svg
      className={cn(styles.spinner, className)}
      viewBox={`0 0 ${SPINNER_VIEW_BOX} ${SPINNER_VIEW_BOX}`}
      fill="none"
      aria-hidden
      {...props}
    >
      <circle
        className={styles.track}
        cx={center}
        cy={center}
        r={SPINNER_RADIUS}
        stroke="currentColor"
        strokeWidth={SPINNER_THICKNESS}
      />
      <circle
        className={styles.arc}
        cx={center}
        cy={center}
        r={SPINNER_RADIUS}
        stroke="currentColor"
        strokeWidth={SPINNER_THICKNESS}
        strokeLinecap="round"
        pathLength={100}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}

export const Loader = { Root, Dots, Spinner };
