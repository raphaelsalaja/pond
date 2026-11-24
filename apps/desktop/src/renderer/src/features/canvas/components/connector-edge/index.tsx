import type { CanvasCap } from "@shared/canvas-contracts";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useStore,
} from "@xyflow/react";
import type { EdgeProps, XYPosition } from "@xyflow/react";
import { clsx as cn } from "clsx";
import { INK } from "../../lib/colors";
import { CONNECTOR_STYLE, capsOf } from "../../lib/document";
import type { ConnectorEdge as ConnectorEdgeType } from "../../lib/document";
import { useBoard } from "../board/context";
import { ConnectorBar } from "../connector-bar";
import { EditableText } from "../editable-text";
import styles from "./styles.module.css";

const CAP_TIP = {
  arrow: 10,
  triangle: 11,
  circle: 10,
  diamond: 11,
} as const;

interface CapProps {
  id: string;
  cap: CanvasCap;
  ink: string;
}

function isRelation(
  cap: CanvasCap,
): cap is "one" | "many" | "zero-one" | "one-many" | "zero-many" {
  return (
    cap === "one" ||
    cap === "many" ||
    cap === "zero-one" ||
    cap === "one-many" ||
    cap === "zero-many"
  );
}

function Relation({ cap, ink }: { cap: CanvasCap; ink: string }) {
  const stroke = { stroke: ink };
  const bar = (x: number) => (
    <path className={styles.arrow} d={`M${x} 2V14`} style={stroke} />
  );
  const ring = (x: number) => (
    <circle cx={x} cy={8} r={4} className={styles.arrow} style={stroke} />
  );
  const foot = (from: number, to: number) => (
    <>
      <path className={styles.arrow} d={`M${from} 8L${to} 2`} style={stroke} />
      <path className={styles.arrow} d={`M${from} 8H${to}`} style={stroke} />
      <path className={styles.arrow} d={`M${from} 8L${to} 14`} style={stroke} />
    </>
  );
  switch (cap) {
    case "one":
      return bar(32);
    case "many":
      return foot(16, 32);
    case "zero-one":
      return (
        <>
          {ring(12)}
          {bar(32)}
        </>
      );
    case "one-many":
      return (
        <>
          {bar(12)}
          {foot(18, 32)}
        </>
      );
    case "zero-many":
      return (
        <>
          {ring(8)}
          {foot(18, 32)}
        </>
      );
    default:
      return null;
  }
}

function Cap({ id, cap, ink }: CapProps) {
  if (cap === "none") {
    return null;
  }
  if (isRelation(cap)) {
    return (
      <marker
        id={id}
        viewBox="0 0 36 16"
        refX={34}
        refY={8}
        markerWidth={28}
        markerHeight={14}
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <Relation cap={cap} ink={ink} />
      </marker>
    );
  }
  return (
    <marker
      id={id}
      viewBox="0 0 12 12"
      refX={CAP_TIP[cap]}
      refY={6}
      markerWidth={12}
      markerHeight={12}
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      {cap === "arrow" ? (
        <path
          className={styles.arrow}
          d="M2.5 2L10 6L2.5 10"
          style={{ stroke: ink }}
        />
      ) : cap === "triangle" ? (
        <path d="M1.5 1.5L11 6L1.5 10.5Z" style={{ fill: ink }} />
      ) : cap === "circle" ? (
        <circle cx={6} cy={6} r={4} style={{ fill: ink }} />
      ) : (
        <path d="M6 1L11 6L6 11L1 6Z" style={{ fill: ink }} />
      )}
    </marker>
  );
}

interface EndsProps {
  source: XYPosition;
  target: XYPosition;
}

/** Drag either end to reconnect; React Flow's own anchors sit on top and take the pointer. */
function Ends({ source, target }: EndsProps) {
  const zoom = useStore((state) => state.transform[2]);
  const end = (point: XYPosition) => (
    <circle
      className={styles.end}
      cx={point.x}
      cy={point.y}
      r={6 / zoom}
      strokeWidth={2 / zoom}
    />
  );
  return (
    <>
      {end(source)}
      {end(target)}
    </>
  );
}

export function ConnectorEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<ConnectorEdgeType>) {
  const board = useBoard();
  const style = { ...CONNECTOR_STYLE, ...data };
  const ends = {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  };
  const [path, labelX, labelY] =
    style.line === "elbow"
      ? getSmoothStepPath({ ...ends, borderRadius: 12 })
      : style.line === "straight"
        ? getStraightPath(ends)
        : getBezierPath(ends);
  const ink = INK[style.color];
  const caps = capsOf(style);
  const editing = board.editingId === id;
  return (
    <>
      <defs>
        <Cap id={`${id}-start`} cap={caps.start} ink={ink} />
        <Cap id={`${id}-end`} cap={caps.end} ink={ink} />
      </defs>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: ink,
          strokeWidth: style.weight === "thick" ? 3 : undefined,
          strokeDasharray: style.dashed ? "6 5" : undefined,
        }}
        markerStart={caps.start === "none" ? undefined : `url(#${id}-start)`}
        markerEnd={caps.end === "none" ? undefined : `url(#${id}-end)`}
      />
      {selected ? (
        <Ends
          source={{ x: sourceX, y: sourceY }}
          target={{ x: targetX, y: targetY }}
        />
      ) : null}
      <EdgeLabelRenderer>
        {style.label || editing ? (
          <div
            className={cn(styles.label, "nodrag", "nopan")}
            data-editing={editing || undefined}
            style={{
              transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
            }}
          >
            <EditableText
              id={id}
              text={style.label}
              label="Connector Label"
              placeholder="Add label"
              hint=""
              variant="label"
            />
          </div>
        ) : null}
      </EdgeLabelRenderer>
      {board.connectorBarId === id ? (
        <ConnectorBar id={id} x={labelX} y={labelY} style={style} />
      ) : null}
    </>
  );
}
