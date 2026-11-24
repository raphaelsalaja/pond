import type { NodeChange, NodePositionChange, XYPosition } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import {
  groupChanges,
  isLocked,
  sectionContents,
  snap,
} from "../../lib/document";
import type { Bounds, CanvasNode } from "../../lib/document";
import { snapResize, snapToObjects } from "../../lib/snap";
import type { Guide } from "../../lib/snap";

/** On-screen pixels within which a dragged edge or centre pulls to another item's. */
const SNAP_DISTANCE = 6;

interface Carry {
  sections: Map<string, XYPosition>;
  members: Map<string, { section: string; start: XYPosition }>;
}

function rectOf(node: CanvasNode): Bounds {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? node.measured?.width ?? 0,
    height: node.height ?? node.measured?.height ?? 0,
  };
}

/** Rewrites React Flow's node changes so groups select together, drags snap, and sections carry their contents. */
export function useSettle(
  nodesNow: () => ReadonlyArray<CanvasNode>,
  zoomNow: () => number,
) {
  const [guides, setGuides] = useState<Array<Guide>>([]);
  const carry = useRef<Carry | null>(null);

  const settleDrag = useCallback(
    (
      changes: Array<NodeChange<CanvasNode>>,
      drags: ReadonlyArray<NodePositionChange>,
    ): Array<NodeChange<CanvasNode>> => {
      const nodes = nodesNow();
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const moving = new Set(drags.map((change) => change.id));
      const carried = carry.current;
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (const change of drags) {
        const node = byId.get(change.id);
        if (!node || !change.position) {
          continue;
        }
        const { width, height } = rectOf(node);
        left = Math.min(left, change.position.x);
        top = Math.min(top, change.position.y);
        right = Math.max(right, change.position.x + width);
        bottom = Math.max(bottom, change.position.y + height);
      }
      if (!Number.isFinite(left)) {
        return changes;
      }
      const others = nodes
        .filter(
          (node) =>
            !moving.has(node.id) &&
            !node.hidden &&
            !carried?.members.has(node.id),
        )
        .map(rectOf);
      const pulled = snapToObjects(
        { id: "", x: left, y: top, width: right - left, height: bottom - top },
        others,
        SNAP_DISTANCE / zoomNow(),
      );
      const x = pulled.x ?? snap(left) - left;
      const y = pulled.y ?? snap(top) - top;
      setGuides(drags.some((change) => change.dragging) ? pulled.guides : []);
      const shifted = changes.map((change) =>
        change.type === "position" && change.position && moving.has(change.id)
          ? {
              ...change,
              position: { x: change.position.x + x, y: change.position.y + y },
            }
          : change,
      );
      if (!carried) {
        return shifted;
      }
      const extra: Array<NodeChange<CanvasNode>> = [];
      for (const change of shifted) {
        if (change.type !== "position" || !change.position) {
          continue;
        }
        const start = carried.sections.get(change.id);
        if (!start) {
          continue;
        }
        const dx = change.position.x - start.x;
        const dy = change.position.y - start.y;
        for (const [id, member] of carried.members) {
          if (member.section === change.id && !moving.has(id)) {
            extra.push({
              type: "position",
              id,
              position: { x: member.start.x + dx, y: member.start.y + dy },
              dragging: change.dragging,
            });
          }
        }
      }
      return [...shifted, ...extra];
    },
    [nodesNow, zoomNow],
  );

  const settleResize = useCallback(
    (changes: Array<NodeChange<CanvasNode>>): Array<NodeChange<CanvasNode>> => {
      const byId = new Map(nodesNow().map((node) => [node.id, node]));
      const frames = new Map<string, Bounds>();
      for (const change of changes) {
        if (
          change.type !== "dimensions" ||
          change.resizing === undefined ||
          !change.dimensions
        ) {
          continue;
        }
        const node = byId.get(change.id);
        if (!node) {
          continue;
        }
        const position = changes.find(
          (entry): entry is NodePositionChange =>
            entry.type === "position" && entry.id === change.id,
        )?.position;
        frames.set(
          change.id,
          snapResize(rectOf(node), {
            id: change.id,
            x: position?.x ?? node.position.x,
            y: position?.y ?? node.position.y,
            width: change.dimensions.width,
            height: change.dimensions.height,
          }),
        );
      }
      if (!frames.size) {
        return changes;
      }
      return changes.map((change) => {
        if (change.type === "add") {
          return change;
        }
        const frame = frames.get(change.id);
        if (!frame) {
          return change;
        }
        if (change.type === "position" && change.position) {
          return { ...change, position: { x: frame.x, y: frame.y } };
        }
        if (change.type === "dimensions" && change.dimensions) {
          return {
            ...change,
            dimensions: { width: frame.width, height: frame.height },
          };
        }
        return change;
      });
    },
    [nodesNow],
  );

  const settle = useCallback(
    (
      incoming: Array<NodeChange<CanvasNode>>,
    ): Array<NodeChange<CanvasNode>> => {
      const changes = groupChanges(nodesNow(), incoming);
      /** A drag's final change keeps React Flow's raw position, so it settles again rather than passing through. */
      const drags = changes.filter(
        (change): change is NodePositionChange =>
          change.type === "position" &&
          change.dragging !== undefined &&
          change.position !== undefined,
      );
      return drags.length ? settleDrag(changes, drags) : settleResize(changes);
    },
    [nodesNow, settleDrag, settleResize],
  );

  const begin = useCallback(
    (dragged: ReadonlyArray<CanvasNode>) => {
      const ids = new Set(dragged.map((node) => node.id));
      const sections = dragged.filter((node) => node.type === "section");
      if (!sections.length) {
        carry.current = null;
        return;
      }
      const loose = nodesNow().filter(
        (node) => !ids.has(node.id) && !isLocked(node),
      );
      const frames = loose.map(rectOf);
      const starts = new Map(loose.map((node) => [node.id, node.position]));
      const members: Carry["members"] = new Map();
      for (const section of sections) {
        for (const id of sectionContents(rectOf(section), frames)) {
          const start = starts.get(id);
          if (start && !members.has(id)) {
            members.set(id, { section: section.id, start });
          }
        }
      }
      carry.current = {
        sections: new Map(sections.map((node) => [node.id, node.position])),
        members,
      };
    },
    [nodesNow],
  );

  const end = useCallback(() => {
    carry.current = null;
    setGuides([]);
  }, []);

  return { guides, settle, begin, end };
}
