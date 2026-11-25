import {
  IconChatBubble,
  IconChevron,
  IconCircle,
  IconCylinder,
  IconDiamond,
  IconDocument,
  IconHexagon,
  IconParallelogram,
  IconSquare,
  IconSquareRounded,
  IconStar,
  IconTrapezoid,
  IconTriangle,
} from "@pond/icons";
import type { CanvasOutline } from "@shared/canvas-contracts";
import type { ComponentType } from "react";

export const OUTLINES: ReadonlyArray<{
  outline: CanvasOutline;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}> = [
  { outline: "rectangle", label: "Rectangle", Icon: IconSquare },
  { outline: "rounded", label: "Rounded Rectangle", Icon: IconSquareRounded },
  { outline: "ellipse", label: "Ellipse", Icon: IconCircle },
  { outline: "diamond", label: "Diamond", Icon: IconDiamond },
  { outline: "triangle", label: "Triangle", Icon: IconTriangle },
  { outline: "hexagon", label: "Hexagon", Icon: IconHexagon },
  { outline: "parallelogram", label: "Parallelogram", Icon: IconParallelogram },
  { outline: "trapezoid", label: "Trapezoid", Icon: IconTrapezoid },
  { outline: "star", label: "Star", Icon: IconStar },
  { outline: "cylinder", label: "Cylinder", Icon: IconCylinder },
  { outline: "speech", label: "Speech Bubble", Icon: IconChatBubble },
  { outline: "document", label: "Document", Icon: IconDocument },
  { outline: "chevron", label: "Chevron", Icon: IconChevron },
];

/** Drawn outlines live in a 100×100 box stretched to the item, so paths never depend on its size. */
export interface Drawing {
  fill: string;
  details?: string;
}

export function drawingOf(outline: CanvasOutline): Drawing | null {
  switch (outline) {
    case "diamond":
      return { fill: "M50 0L100 50L50 100L0 50Z" };
    case "triangle":
      return { fill: "M50 0L100 100H0Z" };
    case "hexagon":
      return { fill: "M25 0H75L100 50L75 100H25L0 50Z" };
    case "parallelogram":
      return { fill: "M20 0H100L80 100H0Z" };
    case "trapezoid":
      return { fill: "M20 0H80L100 100H0Z" };
    case "star":
      return {
        fill: "M50 0L61 35H98L68 57L79 91L50 70L21 91L32 57L2 35H39Z",
      };
    case "cylinder":
      return {
        fill: "M0 12A50 12 0 0 1 100 12V88A50 12 0 0 1 0 88Z",
        details: "M0 12A50 12 0 0 0 100 12",
      };
    case "speech":
      return {
        fill: "M8 0H92Q100 0 100 8V68Q100 76 92 76H42L22 100L26 76H8Q0 76 0 68V8Q0 0 8 0Z",
      };
    case "document":
      return {
        fill: "M6 4H94V72Q82 88 70 72Q58 56 46 72Q34 88 22 72Q10 56 6 72Z",
      };
    case "chevron":
      return { fill: "M0 0H62L100 50L62 100H0L38 50Z" };
    default:
      return null;
  }
}
