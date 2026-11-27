import { Button, Tooltip } from "@pond/ui";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

const EASE = [0.25, 0.1, 0.25, 1] as const;

type Side = "left" | "right";

const SIDES = {
  left: {
    x: 4.75,
    label: "Toggle Sidebar",
    shortcut: "view.sidebar",
    toggle: () => libraryChrome.toggleSidebar(),
  },
  right: {
    x: 13.25,
    label: "Toggle Details",
    shortcut: "view.inspector",
    toggle: () => libraryChrome.toggleDetails(),
  },
} as const;

function Glyph({ open, side }: { open: boolean; side: Side }) {
  const inset = open ? 5.75 : 7.5;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 18 18"
      width={18}
      height={18}
      fill="none"
      className={styles.glyph}
      aria-hidden
    >
      <title>{SIDES[side].label}</title>
      <rect
        x="1.75"
        y="2.75"
        width="14.5"
        height="12.5"
        rx="2"
        ry="2"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <motion.line
        x1={SIDES[side].x}
        x2={SIDES[side].x}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ y1: inset, y2: 18 - inset }}
        transition={{ duration: 0.18, ease: EASE }}
      />
    </svg>
  );
}

export function SidebarToggle({
  open,
  side = "left",
  disabled = false,
}: {
  open: boolean;
  side?: Side;
  disabled?: boolean;
}) {
  const { label, shortcut, toggle } = SIDES[side];
  const [visual, setVisual] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisual(open));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Tooltip label={label} shortcut={<ShortcutKeys id={shortcut} />}>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label={label}
        aria-pressed={open}
        disabled={disabled}
        onClick={toggle}
      >
        <Glyph open={visual} side={side} />
      </Button>
    </Tooltip>
  );
}
