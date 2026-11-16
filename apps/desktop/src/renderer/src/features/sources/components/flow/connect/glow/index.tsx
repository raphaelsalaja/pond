import { useEffect, useRef } from "react";
import { useConnectCompleted } from "@/features/sources/state/connect-flow";
import { type GlowColors, startGlow } from "./shader";
import styles from "./styles.module.css";

function accentColor(element: Element, amount: number): number[] {
  const probe = document.createElement("span");
  probe.style.color = `color-mix(in oklab, var(--ds-accent) ${amount}%, var(--ds-background-primary))`;
  element.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [0, 0, 0];
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function ConnectGlow() {
  const completed = useConnectCompleted();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!completed || !canvas) return;
    const colors: GlowColors = {
      start: accentColor(canvas, 18),
      middle: accentColor(canvas, 11),
      end: accentColor(canvas, 5),
      core: accentColor(canvas, 32),
    };
    const origin = () => {
      const target = canvas.parentElement?.querySelector("[data-glow-origin]");
      const bounds = canvas.getBoundingClientRect();
      if (!target) return { x: bounds.width / 2, y: 96 };
      const rect = target.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - bounds.left,
        y: rect.top + rect.height / 2 - bounds.top,
      };
    };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return startGlow(canvas, colors, origin, still);
  }, [completed]);

  if (!completed) return null;
  return <canvas ref={canvasRef} className={styles.glow} />;
}
