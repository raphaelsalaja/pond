import {
  CANVAS_SIDES,
  type CanvasCap,
  type CanvasColor,
  type CanvasConnector,
  type CanvasContent,
  type CanvasItem,
  type CanvasOutline,
  type CanvasSide,
  type CanvasViewport,
  saveGridColumns,
} from "@shared/canvas-contracts";
import type { Edge, Node, NodeChange, XYPosition } from "@xyflow/react";

type Frame = "id" | "kind" | "x" | "y" | "width" | "height" | "locked";
type DataOf<Kind extends CanvasItem["kind"]> = Omit<
  Extract<CanvasItem, { kind: Kind }>,
  Frame
>;

export type SaveNode = Node<DataOf<"save">, "save">;
export type NoteNode = Node<DataOf<"note">, "note">;
export type TextNode = Node<DataOf<"text">, "text">;
export type DrawingNode = Node<DataOf<"drawing">, "drawing">;
export type FigureNode = Node<DataOf<"figure">, "figure">;
export type SectionNode = Node<DataOf<"section">, "section">;
export type TableNode = Node<DataOf<"table">, "table">;
export type CodeNode = Node<DataOf<"code">, "code">;
export type TopicNode = Node<DataOf<"topic">, "topic">;
export type CanvasNode =
  | SaveNode
  | NoteNode
  | TextNode
  | DrawingNode
  | FigureNode
  | SectionNode
  | TableNode
  | CodeNode
  | TopicNode;

export type ConnectorStyle = Omit<
  CanvasConnector,
  "id" | "from" | "to" | "fromSide" | "toSide"
>;
export type ConnectorEdge = Edge<ConnectorStyle, "connector">;

export const CONNECTOR_STYLE: ConnectorStyle = {
  line: "curved",
  startArrow: false,
  endArrow: true,
  dashed: false,
  color: "gray",
  label: "",
};

export type StrokePoint = [x: number, y: number, pressure: number];

export interface CanvasSnapshot {
  items: CanvasItem[];
  connectors: CanvasConnector[];
}

export const GRID = 24;

const SAVE_SIZE = { width: 240, height: 216 };
const NOTE_SIZE = { width: 192, height: 192 };
const TEXT_SIZE = { width: 264, height: 48 };
const FIGURE_SIZE = { width: 192, height: 192 };
const SECTION_SIZE = { width: 720, height: 480 };
const CODE_SIZE = { width: 432, height: 216 };
const TOPIC_SIZE = { width: 192, height: 48 };
const CELL = { width: 144, height: 48 };
const LINE_HEIGHT = 24;
const GAP = 48;
const DUPLICATE_OFFSET = GRID;

export type Bounds = Pick<CanvasItem, "id" | "x" | "y" | "width" | "height">;
export type AlignEdge =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type Axis = "horizontal" | "vertical";
export type LayerMove = "front" | "forward" | "backward" | "back";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function newId(): string {
  return crypto.randomUUID();
}

function isSide(value: string | null | undefined): value is CanvasSide {
  return CANVAS_SIDES.some((side) => side === value);
}

export function isLocked(node: CanvasNode): boolean {
  return node.draggable === false;
}

/** Unlocked nodes leave the flags unset so the board's tool still decides whether they drag. */
export function withLock(node: CanvasNode, locked: boolean): CanvasNode {
  return {
    ...node,
    draggable: locked ? false : undefined,
    deletable: locked ? false : undefined,
  };
}

export function withData<Entry extends CanvasNode>(
  node: Entry,
  patch: Partial<Entry["data"]>,
): Entry {
  return { ...node, data: { ...node.data, ...patch } };
}

/** Drawing points live in the drawing's own frame, so a new size rescales them. */
export function withBox(
  node: CanvasNode,
  box: Pick<Bounds, "x" | "y" | "width" | "height">,
): CanvasNode {
  const { width, height } = frameOf(node);
  const frame = {
    position: { x: box.x, y: box.y },
    width: box.width,
    height: box.height,
  };
  if (node.type !== "drawing") return { ...node, ...frame };
  const scaleX = box.width / width;
  const scaleY = box.height / height;
  return {
    ...node,
    ...frame,
    data: {
      ...node.data,
      points: node.data.points.map(
        ([x, y, pressure]): StrokePoint => [x * scaleX, y * scaleY, pressure],
      ),
    },
  };
}

export function withGroup<Entry extends CanvasNode>(
  node: Entry,
  group: string | null,
): Entry {
  const { group: _previous, ...data } = node.data;
  return { ...node, data: group ? { ...data, group } : data };
}

function dataOf<Item extends CanvasItem>(item: Item): Omit<Item, Frame> {
  const {
    id: _id,
    kind: _kind,
    x: _x,
    y: _y,
    width: _width,
    height: _height,
    locked: _locked,
    ...data
  } = item;
  return data;
}

export function toNode(item: CanvasItem): CanvasNode {
  const base: Pick<
    CanvasNode,
    | "id"
    | "position"
    | "width"
    | "height"
    | "draggable"
    | "deletable"
    | "zIndex"
  > = {
    id: item.id,
    position: { x: item.x, y: item.y },
    width: item.width,
    height: item.height,
  };
  if (item.locked) {
    base.draggable = false;
    base.deletable = false;
  }
  switch (item.kind) {
    case "save":
      return { ...base, type: "save", data: dataOf(item) };
    case "note":
      return { ...base, type: "note", data: dataOf(item) };
    case "text":
      return { ...base, type: "text", data: dataOf(item) };
    case "figure":
      return { ...base, type: "figure", data: dataOf(item) };
    case "drawing":
      return { ...base, type: "drawing", data: dataOf(item) };
    case "section":
      /** Sections sit under everything, connectors included, so items dropped on them stay visible. */
      return { ...base, zIndex: -1, type: "section", data: dataOf(item) };
    case "table":
      return { ...base, type: "table", data: dataOf(item) };
    case "code":
      return { ...base, type: "code", data: dataOf(item) };
    case "topic":
      return { ...base, type: "topic", data: dataOf(item) };
  }
}

export function toItem(node: CanvasNode): CanvasItem {
  const frame: Omit<Pick<CanvasItem, Frame>, "kind"> = {
    id: node.id,
    x: round(node.position.x),
    y: round(node.position.y),
    width: round(Math.max(1, node.width ?? node.measured?.width ?? 1)),
    height: round(Math.max(1, node.height ?? node.measured?.height ?? 1)),
  };
  if (isLocked(node)) frame.locked = true;
  switch (node.type) {
    case "save":
      return { ...node.data, ...frame, kind: "save" };
    case "note":
      return { ...node.data, ...frame, kind: "note" };
    case "text":
      return { ...node.data, ...frame, kind: "text" };
    case "figure":
      return { ...node.data, ...frame, kind: "figure" };
    case "drawing":
      return { ...node.data, ...frame, kind: "drawing" };
    case "section":
      return { ...node.data, ...frame, kind: "section" };
    case "table":
      return { ...node.data, ...frame, kind: "table" };
    case "code":
      return { ...node.data, ...frame, kind: "code" };
    case "topic":
      return { ...node.data, ...frame, kind: "topic" };
    default:
      throw new Error(`Unknown canvas item ${frame.id}`);
  }
}

export function frameOf(node: CanvasNode): Bounds {
  const { id, x, y, width, height } = toItem(node);
  return { id, x, y, width, height };
}

export function toEdge({
  id,
  from,
  to,
  fromSide,
  toSide,
  ...style
}: CanvasConnector): ConnectorEdge {
  return {
    id,
    type: "connector",
    source: from,
    target: to,
    sourceHandle: fromSide,
    targetHandle: toSide,
    data: style,
  };
}

function toConnector(edge: ConnectorEdge): CanvasConnector {
  return {
    ...CONNECTOR_STYLE,
    ...edge.data,
    id: edge.id,
    from: edge.source,
    to: edge.target,
    fromSide: isSide(edge.sourceHandle) ? edge.sourceHandle : "right",
    toSide: isSide(edge.targetHandle) ? edge.targetHandle : "left",
  };
}

export function snapshotOf(
  nodes: readonly CanvasNode[],
  edges: readonly ConnectorEdge[],
): CanvasSnapshot {
  const ids = new Set(nodes.map((node) => node.id));
  return {
    items: nodes.map(toItem),
    connectors: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map(toConnector),
  };
}

export function contentOf(
  nodes: readonly CanvasNode[],
  edges: readonly ConnectorEdge[],
  viewport: CanvasViewport,
): CanvasContent {
  return {
    viewport: {
      x: round(viewport.x),
      y: round(viewport.y),
      zoom: round(viewport.zoom),
    },
    ...snapshotOf(nodes, edges),
  };
}

function saveGrid(
  saveIds: readonly string[],
  origin: XYPosition,
  columns: number,
): CanvasItem[] {
  return saveIds.map((saveId, index) => ({
    kind: "save",
    id: newId(),
    saveId,
    x: origin.x + (index % columns) * (SAVE_SIZE.width + GAP),
    y: origin.y + Math.floor(index / columns) * (SAVE_SIZE.height + GAP),
    ...SAVE_SIZE,
  }));
}

/** Saves dropped together fan out in a grid centred on the drop point. */
export function placeSaves(
  saveIds: readonly string[],
  center: XYPosition,
): CanvasItem[] {
  const columns = saveGridColumns(saveIds.length);
  const across = Math.min(columns, saveIds.length);
  const rows = Math.ceil(saveIds.length / columns);
  return saveGrid(
    saveIds,
    {
      x: snap(center.x - (across * SAVE_SIZE.width + (across - 1) * GAP) / 2),
      y: snap(center.y - (rows * SAVE_SIZE.height + (rows - 1) * GAP) / 2),
    },
    columns,
  );
}

/** A batch from a folder lands to the right of everything on the board, so it never covers existing work. */
export function placeSavesBeside(
  saveIds: readonly string[],
  frames: readonly { x: number; y: number; width: number; height: number }[],
  fallback: XYPosition,
): CanvasItem[] {
  if (!frames.length) return placeSaves(saveIds, fallback);
  return saveGrid(
    saveIds,
    {
      x: snap(Math.max(...frames.map((frame) => frame.x + frame.width)) + GAP),
      y: snap(Math.min(...frames.map((frame) => frame.y))),
    },
    saveGridColumns(saveIds.length),
  );
}

export function noteAt(point: XYPosition, color: CanvasColor): CanvasItem {
  return {
    kind: "note",
    id: newId(),
    x: snap(point.x - NOTE_SIZE.width / 2),
    y: snap(point.y - NOTE_SIZE.height / 2),
    ...NOTE_SIZE,
    text: "",
    color,
  };
}

export function textAt(point: XYPosition, text = ""): CanvasItem {
  const lines = text.split("\n").length;
  const height = Math.max(TEXT_SIZE.height, (lines + 1) * LINE_HEIGHT);
  return {
    kind: "text",
    id: newId(),
    x: snap(point.x),
    y: snap(point.y - height / 2),
    width: TEXT_SIZE.width,
    height,
    text,
  };
}

export function figureAt(
  point: XYPosition,
  outline: CanvasOutline,
  color: CanvasColor,
): CanvasItem {
  return {
    kind: "figure",
    id: newId(),
    x: snap(point.x - FIGURE_SIZE.width / 2),
    y: snap(point.y - FIGURE_SIZE.height / 2),
    ...FIGURE_SIZE,
    outline,
    text: "",
    color,
  };
}

export function sectionAt(point: XYPosition, color: CanvasColor): CanvasItem {
  return {
    kind: "section",
    id: newId(),
    x: snap(point.x - SECTION_SIZE.width / 2),
    y: snap(point.y - SECTION_SIZE.height / 2),
    ...SECTION_SIZE,
    title: "Section",
    color,
  };
}

/** A wrapping section leaves a grid step of room around its contents. */
export function sectionAround(
  frames: readonly Bounds[],
  color: CanvasColor,
): CanvasItem | null {
  const box = extentOf(frames);
  if (!box) return null;
  const x = box.left - GRID * 2;
  const y = box.top - GRID * 3;
  return {
    kind: "section",
    id: newId(),
    x: round(x),
    y: round(y),
    width: round(box.right + GRID * 2 - x),
    height: round(box.bottom + GRID * 2 - y),
    title: "Section",
    color,
  };
}

export function tableAt(point: XYPosition, color: CanvasColor): CanvasItem {
  const rows = Array.from({ length: 3 }, () => ["", "", ""]);
  return {
    kind: "table",
    id: newId(),
    x: snap(point.x - (3 * CELL.width) / 2),
    y: snap(point.y - (3 * CELL.height) / 2),
    width: 3 * CELL.width,
    height: 3 * CELL.height,
    rows,
    color,
  };
}

export function codeAt(point: XYPosition, language: string): CanvasItem {
  return {
    kind: "code",
    id: newId(),
    x: snap(point.x - CODE_SIZE.width / 2),
    y: snap(point.y - CODE_SIZE.height / 2),
    ...CODE_SIZE,
    text: "",
    language,
  };
}

export function topicAt(point: XYPosition, color: CanvasColor): CanvasItem {
  return {
    kind: "topic",
    id: newId(),
    x: snap(point.x - TOPIC_SIZE.width / 2),
    y: snap(point.y - TOPIC_SIZE.height / 2),
    ...TOPIC_SIZE,
    text: "",
    color,
  };
}

/** Table rows and columns change one at a time; the frame grows or shrinks by one cell. */
export function resizeTable(
  item: Extract<CanvasItem, { kind: "table" }>,
  change: "add-row" | "add-column" | "remove-row" | "remove-column",
): Extract<CanvasItem, { kind: "table" }> {
  const columns = item.rows[0]?.length ?? 1;
  const cellWidth = item.width / columns;
  const cellHeight = item.height / item.rows.length;
  switch (change) {
    case "add-row":
      return {
        ...item,
        rows: [...item.rows, Array.from({ length: columns }, () => "")],
        height: round(item.height + cellHeight),
      };
    case "remove-row":
      if (item.rows.length < 2) return item;
      return {
        ...item,
        rows: item.rows.slice(0, -1),
        height: round(item.height - cellHeight),
      };
    case "add-column":
      return {
        ...item,
        rows: item.rows.map((row) => [...row, ""]),
        width: round(item.width + cellWidth),
      };
    case "remove-column":
      if (columns < 2) return item;
      return {
        ...item,
        rows: item.rows.map((row) => row.slice(0, -1)),
        width: round(item.width - cellWidth),
      };
  }
}

export interface ConnectorCaps {
  start: CanvasCap;
  end: CanvasCap;
}

export function capsOf(style: ConnectorStyle): ConnectorCaps {
  return {
    start: style.start ?? (style.startArrow ? "arrow" : "none"),
    end: style.end ?? (style.endArrow ? "arrow" : "none"),
  };
}

/** Setting a cap also writes the arrow flag, so builds that predate caps still draw an arrow. */
export function withCap(
  end: "start" | "end",
  cap: CanvasCap,
): Partial<ConnectorStyle> {
  return end === "start"
    ? { start: cap, startArrow: cap !== "none" }
    : { end: cap, endArrow: cap !== "none" };
}

/** Selecting or deselecting one member of a group applies to the whole group; selecting wins a tie. */
export function groupChanges(
  nodes: readonly CanvasNode[],
  changes: NodeChange<CanvasNode>[],
): NodeChange<CanvasNode>[] {
  const groupOf = new Map(
    nodes.flatMap((node) =>
      node.data.group ? [[node.id, node.data.group] as const] : [],
    ),
  );
  if (!groupOf.size) return changes;
  const picked = new Set<string>();
  const dropped = new Set<string>();
  for (const change of changes) {
    if (change.type !== "select") continue;
    const group = groupOf.get(change.id);
    if (group) (change.selected ? picked : dropped).add(group);
  }
  if (!picked.size && !dropped.size) return changes;
  const members = nodes.flatMap((node): NodeChange<CanvasNode>[] => {
    const group = node.data.group;
    if (!group) return [];
    if (picked.has(group))
      return [{ type: "select", id: node.id, selected: true }];
    if (dropped.has(group))
      return [{ type: "select", id: node.id, selected: false }];
    return [];
  });
  return [
    ...changes.filter(
      (change) => change.type !== "select" || !groupOf.has(change.id),
    ),
    ...members,
  ];
}

function inside(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.id !== outer.id &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** A section carries every item that sits wholly inside it, nested sections and their contents included. */
export function sectionContents(
  section: Bounds,
  frames: readonly Bounds[],
): string[] {
  return frames
    .filter((frame) => inside(section, frame))
    .map((frame) => frame.id);
}

const BRANCH_GAP = { x: 72, y: 24 };

function branchesOf(snapshot: CanvasSnapshot): Map<string, string[]> {
  const topics = new Set(
    snapshot.items.flatMap((item) => (item.kind === "topic" ? [item.id] : [])),
  );
  const children = new Map<string, string[]>();
  for (const connector of snapshot.connectors) {
    if (
      connector.fromSide !== "right" ||
      !topics.has(connector.from) ||
      !topics.has(connector.to)
    )
      continue;
    children.set(connector.from, [
      ...(children.get(connector.from) ?? []),
      connector.to,
    ]);
  }
  return children;
}

function parentOf(
  children: ReadonlyMap<string, readonly string[]>,
  id: string,
): string | null {
  for (const [parent, kids] of children) if (kids.includes(id)) return parent;
  return null;
}

/** Branches stack top to bottom in the order they were added, each subtree centred on its parent. */
function layoutMindMap(
  snapshot: CanvasSnapshot,
  id: string,
): Map<string, XYPosition> {
  const children = branchesOf(snapshot);
  const frames = new Map(snapshot.items.map((item) => [item.id, item]));
  let root = id;
  const seen = new Set([root]);
  for (let parent = parentOf(children, root); parent; ) {
    if (seen.has(parent)) break;
    seen.add(parent);
    root = parent;
    parent = parentOf(children, root);
  }
  const heights = new Map<string, number>();
  const heightOf = (node: string, trail: Set<string>): number => {
    const frame = frames.get(node);
    if (!frame || trail.has(node)) return 0;
    const kids = children.get(node) ?? [];
    const next = new Set(trail).add(node);
    const stacked =
      kids.reduce((total, kid) => total + heightOf(kid, next), 0) +
      Math.max(0, kids.length - 1) * BRANCH_GAP.y;
    const height = Math.max(frame.height, stacked);
    heights.set(node, height);
    return height;
  };
  heightOf(root, new Set());
  const positions = new Map<string, XYPosition>();
  const place = (
    node: string,
    x: number,
    centerY: number,
    trail: Set<string>,
  ) => {
    const frame = frames.get(node);
    if (!frame || trail.has(node)) return;
    positions.set(node, { x: round(x), y: round(centerY - frame.height / 2) });
    const kids = children.get(node) ?? [];
    const next = new Set(trail).add(node);
    const total =
      kids.reduce((sum, kid) => sum + (heights.get(kid) ?? 0), 0) +
      Math.max(0, kids.length - 1) * BRANCH_GAP.y;
    let top = centerY - total / 2;
    for (const kid of kids) {
      const height = heights.get(kid) ?? 0;
      place(kid, x + frame.width + BRANCH_GAP.x, top + height / 2, next);
      top += height + BRANCH_GAP.y;
    }
  };
  const rootFrame = frames.get(root);
  if (rootFrame)
    place(root, rootFrame.x, rootFrame.y + rootFrame.height / 2, new Set());
  return positions;
}

/** A child hangs off the topic's right side; a sibling joins the topic's parent, or becomes a child of a root. */
export function branchOf(
  snapshot: CanvasSnapshot,
  id: string,
  kind: "child" | "sibling",
): { snapshot: CanvasSnapshot; created: string } | null {
  const topic = snapshot.items.find((item) => item.id === id);
  if (topic?.kind !== "topic") return null;
  const parentId =
    kind === "sibling" ? (parentOf(branchesOf(snapshot), id) ?? id) : id;
  const parent = snapshot.items.find((item) => item.id === parentId);
  if (parent?.kind !== "topic") return null;
  const created: CanvasItem = {
    kind: "topic",
    id: newId(),
    x: parent.x + parent.width + BRANCH_GAP.x,
    y: parent.y,
    ...TOPIC_SIZE,
    text: "",
    color: parent.color,
    textSize: parent.textSize,
    font: parent.font,
  };
  const connector: CanvasConnector = {
    ...CONNECTOR_STYLE,
    endArrow: false,
    end: "none",
    color: parent.color,
    id: newId(),
    from: parent.id,
    to: created.id,
    fromSide: "right",
    toSide: "left",
  };
  const grown: CanvasSnapshot = {
    items: [...snapshot.items, created],
    connectors: [...snapshot.connectors, connector],
  };
  const positions = layoutMindMap(grown, created.id);
  return {
    created: created.id,
    snapshot: {
      ...grown,
      items: grown.items.map((item) => {
        const next = positions.get(item.id);
        return next ? { ...item, x: next.x, y: next.y } : item;
      }),
    },
  };
}

/** Stroke points are stored relative to the drawing's own frame so moving it never rewrites them. */
export function drawingFrom(
  points: readonly StrokePoint[],
  color: CanvasColor,
  size: number,
  ink?: "highlight",
): CanvasItem | null {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs) - size;
  const top = Math.min(...ys) - size;
  const drawing = {
    kind: "drawing" as const,
    id: newId(),
    x: round(left),
    y: round(top),
    width: round(Math.max(1, Math.max(...xs) + size - left)),
    height: round(Math.max(1, Math.max(...ys) + size - top)),
    color,
    size,
    points: points.map(
      ([x, y, pressure]): StrokePoint => [
        round(x - left),
        round(y - top),
        round(pressure),
      ],
    ),
  };
  if (!ink) return drawing;
  return { ...drawing, ink };
}

/** Copies take fresh IDs and start unlocked; a connector survives only when both of its ends were copied. */
function copyOf(source: CanvasSnapshot, offset: XYPosition): CanvasSnapshot {
  const copies = new Map<string, string>();
  const groups = new Map<string, string>();
  const items = source.items.map((item) => {
    const id = newId();
    copies.set(item.id, id);
    let group = item.group && groups.get(item.group);
    if (item.group && !group) {
      group = newId();
      groups.set(item.group, group);
    }
    return {
      ...item,
      id,
      group: group || undefined,
      locked: undefined,
      x: round(item.x + offset.x),
      y: round(item.y + offset.y),
    };
  });
  const connectors = source.connectors.flatMap((connector) => {
    const from = copies.get(connector.from);
    const to = copies.get(connector.to);
    return from && to ? [{ ...connector, id: newId(), from, to }] : [];
  });
  return { items, connectors };
}

/** Saves sit on a board once, so a duplicate copies everything else and the connectors between the copies. */
export function duplicateOf(
  snapshot: CanvasSnapshot,
  ids: ReadonlySet<string>,
): CanvasSnapshot {
  return copyOf(
    {
      items: snapshot.items.filter(
        (item) => ids.has(item.id) && item.kind !== "save",
      ),
      connectors: snapshot.connectors,
    },
    { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET },
  );
}

export function clipOf(
  snapshot: CanvasSnapshot,
  ids: ReadonlySet<string>,
): CanvasSnapshot {
  const items = snapshot.items.filter((item) => ids.has(item.id));
  const kept = new Set(items.map((item) => item.id));
  return {
    items,
    connectors: snapshot.connectors.filter(
      (connector) => kept.has(connector.from) && kept.has(connector.to),
    ),
  };
}

export function clipText(clip: CanvasSnapshot): string {
  return clip.items
    .flatMap((item) => ("text" in item && item.text.trim() ? [item.text] : []))
    .join("\n\n");
}

/** A pasted clip keeps its layout and lands centred on the point, skipping Saves the board already holds. */
export function pasteOf(
  clip: CanvasSnapshot,
  center: XYPosition,
  onBoard: ReadonlySet<string>,
): CanvasSnapshot {
  const seen = new Set(onBoard);
  const items = clip.items.filter((item) => {
    if (item.kind !== "save") return true;
    if (seen.has(item.saveId)) return false;
    seen.add(item.saveId);
    return true;
  });
  const box = extentOf(items);
  if (!box) return { items: [], connectors: [] };
  return copyOf(
    { items, connectors: clip.connectors },
    {
      x: snap(center.x - (box.left + box.right) / 2),
      y: snap(center.y - (box.top + box.bottom) / 2),
    },
  );
}

function extentOf(frames: readonly Bounds[]) {
  if (!frames.length) return null;
  return {
    left: Math.min(...frames.map((frame) => frame.x)),
    top: Math.min(...frames.map((frame) => frame.y)),
    right: Math.max(...frames.map((frame) => frame.x + frame.width)),
    bottom: Math.max(...frames.map((frame) => frame.y + frame.height)),
  };
}

export function alignFrames(
  frames: readonly Bounds[],
  edge: AlignEdge,
): Map<string, XYPosition> {
  const box = extentOf(frames);
  const moved = new Map<string, XYPosition>();
  if (!box) return moved;
  for (const frame of frames) {
    const x =
      edge === "left"
        ? box.left
        : edge === "center"
          ? (box.left + box.right - frame.width) / 2
          : edge === "right"
            ? box.right - frame.width
            : frame.x;
    const y =
      edge === "top"
        ? box.top
        : edge === "middle"
          ? (box.top + box.bottom - frame.height) / 2
          : edge === "bottom"
            ? box.bottom - frame.height
            : frame.y;
    moved.set(frame.id, { x: round(x), y: round(y) });
  }
  return moved;
}

/** The outermost frames stay put and the rest spread out so every gap between neighbours is equal. */
export function distributeFrames(
  frames: readonly Bounds[],
  axis: Axis,
): Map<string, XYPosition> {
  const start = axis === "horizontal" ? "x" : "y";
  const size = axis === "horizontal" ? "width" : "height";
  const sorted = [...frames].sort((a, b) => a[start] - b[start]);
  const moved = new Map<string, XYPosition>();
  const first = sorted[0];
  if (!first || sorted.length < 3) return moved;
  const end = Math.max(...sorted.map((frame) => frame[start] + frame[size]));
  const occupied = sorted.reduce((total, frame) => total + frame[size], 0);
  const gap = (end - first[start] - occupied) / (sorted.length - 1);
  let cursor = first[start];
  for (const frame of sorted) {
    const at = round(cursor);
    moved.set(
      frame.id,
      axis === "horizontal" ? { x: at, y: frame.y } : { x: frame.x, y: at },
    );
    cursor += frame[size] + gap;
  }
  return moved;
}

/** Tidy Up lays the frames out in reading order on a near-square grid with one grid step between cells. */
export function tidyFrames(frames: readonly Bounds[]): Map<string, XYPosition> {
  const box = extentOf(frames);
  const moved = new Map<string, XYPosition>();
  if (!box) return moved;
  const columns = Math.ceil(Math.sqrt(frames.length));
  const cell = Math.max(...frames.map((frame) => frame.width));
  const ordered = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
  let top = box.top;
  for (let index = 0; index < ordered.length; index += columns) {
    const row = ordered.slice(index, index + columns).sort((a, b) => a.x - b.x);
    row.forEach((frame, column) => {
      moved.set(frame.id, {
        x: round(box.left + column * (cell + GRID)),
        y: round(top),
      });
    });
    top += Math.max(...row.map((frame) => frame.height)) + GRID;
  }
  return moved;
}

/** List order is paint order, so the last entry draws on top. */
export function reorder<Entry extends { id: string }>(
  list: readonly Entry[],
  ids: ReadonlySet<string>,
  move: LayerMove,
): Entry[] {
  const picked = list.filter((entry) => ids.has(entry.id));
  const rest = list.filter((entry) => !ids.has(entry.id));
  if (move === "front") return [...rest, ...picked];
  if (move === "back") return [...picked, ...rest];
  const next = [...list];
  const step = move === "forward" ? 1 : -1;
  const order =
    move === "forward"
      ? next.map((_, index) => next.length - 2 - index)
      : next.map((_, index) => index + 1);
  for (const index of order) {
    const here = next[index];
    const there = next[index + step];
    if (!here || !there || !ids.has(here.id) || ids.has(there.id)) continue;
    next[index] = there;
    next[index + step] = here;
  }
  return next;
}

export function createHistory(limit = 100) {
  let past: CanvasSnapshot[] = [];
  let future: CanvasSnapshot[] = [];
  return {
    record(snapshot: CanvasSnapshot): void {
      past = [...past.slice(-(limit - 1)), snapshot];
      future = [];
    },
    undo(current: CanvasSnapshot): CanvasSnapshot | null {
      const previous = past.at(-1);
      if (!previous) return null;
      past = past.slice(0, -1);
      future = [...future, current];
      return previous;
    },
    redo(current: CanvasSnapshot): CanvasSnapshot | null {
      const next = future.at(-1);
      if (!next) return null;
      future = future.slice(0, -1);
      past = [...past, current];
      return next;
    },
  };
}
