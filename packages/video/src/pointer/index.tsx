import styles from "./styles.module.css";

interface PointerProps {
  x: number;
  y: number;
  opacity: number;
  pressed: boolean;
}

/** The macOS arrow, tip at `x`, `y`. */
export function Pointer({ x, y, opacity, pressed }: PointerProps) {
  if (opacity <= 0.002) return null;
  return (
    <svg
      className={styles.pointer}
      width="22"
      height="30"
      viewBox="0 0 22 30"
      aria-hidden
      style={{
        left: x,
        top: y,
        opacity,
        transform: `translate(-3px, -2px) scale(${pressed ? 0.88 : 1})`,
      }}
    >
      <path
        d="M3 2.5v21.2l5.1-4.9 3.3 7.7 3.6-1.5-3.3-7.6h7.1z"
        fill="#111"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
