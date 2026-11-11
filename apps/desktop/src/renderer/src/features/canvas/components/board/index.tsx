import {
  IconBorder,
  IconBroom,
  IconCode2,
  IconContrast,
  IconFill,
  IconGroup,
  IconLineWeight,
  IconLock,
  IconLockOpen,
  IconRename,
  IconSection,
  IconTable,
  IconTextA,
  IconTextBold,
  IconTextStrikethrough,
  IconTypography,
  IconUngroup,
} from "@pond/icons";
import {
  type Canvas,
  type CanvasAlign,
  CanvasClipSchema,
  type CanvasColor,
  type CanvasConnector,
  type CanvasContent,
  type CanvasItem,
  type CanvasOutline,
  type CanvasSide,
  type CanvasTheme,
  type CanvasValign,
  type CanvasWeight,
} from "@shared/canvas-contracts";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnConnectEnd,
  type OnSelectionChangeParams,
  ReactFlow,
  type Rect,
  reconnectEdge,
  SelectionMode,
  useReactFlow,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isLibrarySaveDrag,
  type PasteImport,
  pasteImportOf,
  runPasteImport,
  saveDropIds,
} from "@/features/saves";
import {
  openSave,
  primarySelection,
  selection,
} from "@/features/saves/navigation";
import { ensureSaves, pool } from "@/features/saves/pool";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { claimUndo } from "@/shared/lib/undo-owner";
import {
  alignIcon,
  alignItems,
  arrangeItems,
  boardItems,
  borderItems,
  fillItems,
  fontItems,
  languageItems,
  type MenuTarget,
  sizeItems,
  type TableChange,
  tableItems,
  themeItems,
  weightItems,
} from "../../lib/board-menu";
import {
  type CanvasCommand,
  commandForKey,
  glyphsFor,
} from "../../lib/commands";
import {
  alignFrames,
  branchOf,
  type CanvasNode,
  type CanvasSnapshot,
  CONNECTOR_STYLE,
  type ConnectorEdge,
  type ConnectorStyle,
  clipOf,
  clipText,
  codeAt,
  contentOf,
  createHistory,
  distributeFrames,
  drawingFrom,
  duplicateOf,
  figureAt,
  frameOf,
  GRID,
  isLocked,
  newId,
  noteAt,
  pasteOf,
  placeSaves,
  reorder,
  resizeTable,
  type StrokePoint,
  sectionAround,
  sectionAt,
  snapshotOf,
  tableAt,
  textAt,
  tidyFrames,
  toEdge,
  toItem,
  toNode,
  topicAt,
  withBox,
  withData,
  withGroup,
  withLock,
} from "../../lib/document";
import {
  eraseDrawings,
  flipped,
  itemForRect,
  noteFromText,
  notesSorted,
  quickPair,
  type StampKind,
  turned,
} from "../../lib/edit";
import { renderBoard } from "../../lib/export";
import type { TextStyle } from "../../lib/text-style";
import {
  type Box,
  type Corner,
  groupScale,
  MIN_SIZE,
  type Size,
  scaleBox,
} from "../../lib/transform";
import { canvases } from "../../state/canvases";
import { minimap, useMinimapShown } from "../../state/minimap";
import { Affordance } from "../affordance";
import { CodeItem } from "../code-item";
import { ConnectorEdge as ConnectorEdgeView } from "../connector-edge";
import { DrawLayer } from "../draw-layer";
import { DrawingItem } from "../drawing-item";
import { FigureItem } from "../figure-item";
import { Guides } from "../guides";
import { Minimap, type MinimapItem } from "../minimap";
import { NoteItem } from "../note-item";
import { Picker } from "../picker";
import { PlaceLayer } from "../place-layer";
import { SaveItem } from "../save-item";
import { SectionItem } from "../section-item";
import { SelectionBar, type SelectionControl } from "../selection-bar";
import { SelectionFrame } from "../selection-frame";
import { TableItem } from "../table-item";
import { TextItem } from "../text-item";
import {
  type CanvasTool,
  COLORED_TOOLS,
  type PenMode,
  STAMP_TOOLS,
  Tools,
  toolForKey,
} from "../tools";
import { TopicItem } from "../topic-item";
import { Zoom } from "../zoom";
import { type BoardActions, BoardContext } from "./context";
import styles from "./styles.module.css";
import { useSettle } from "./use-settle";

const NODE_TYPES: NodeTypes = {
  save: SaveItem,
  note: NoteItem,
  text: TextItem,
  drawing: DrawingItem,
  figure: FigureItem,
  section: SectionItem,
  table: TableItem,
  code: CodeItem,
  topic: TopicItem,
};

const EDGE_TYPES: EdgeTypes = { connector: ConnectorEdgeView };

const DEFAULT_LANGUAGE = "typescript";
const SAVE_DELAY_MS = 400;
const PEN_SIZE = 4;
const HIGHLIGHT_SIZE = 28;
const CLIP_TYPE = "application/x-pond-canvas";

function parseClip(raw: string): CanvasSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = CanvasClipSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type ColoredNode = Exclude<CanvasNode, { type: "save" | "text" | "code" }>;
type StyledNode = Extract<
  CanvasNode,
  { type: "note" | "text" | "figure" | "table" | "topic" }
>;

function isColored(node: CanvasNode): node is ColoredNode {
  return node.type !== "save" && node.type !== "text" && node.type !== "code";
}

function isStyled(node: CanvasNode): node is StyledNode {
  return (
    node.type === "note" ||
    node.type === "text" ||
    node.type === "figure" ||
    node.type === "table" ||
    node.type === "topic"
  );
}

function canQuickCreate(node: CanvasNode): boolean {
  return (
    !isLocked(node) &&
    (node.type === "note" ||
      node.type === "figure" ||
      node.type === "text" ||
      node.type === "topic")
  );
}

function withText(node: CanvasNode, text: string): CanvasNode {
  switch (node.type) {
    case "note":
    case "text":
    case "figure":
    case "code":
    case "topic":
      return withData(node, { text });
    case "section":
      return withData(node, { title: text });
    default:
      return node;
  }
}

function hasText(node: CanvasNode): boolean {
  return node.type !== "save" && node.type !== "drawing";
}

function inkSize(
  ink: "pen" | "highlight" | undefined,
  weight: CanvasWeight,
): number {
  const base = ink === "highlight" ? HIGHLIGHT_SIZE : PEN_SIZE;
  return weight === "thick" ? base * 2 : base;
}

/** Notes read from the top; figures and topics center their text. */
function defaultValign(node: StyledNode): CanvasValign {
  return node.type === "note" ? "top" : "middle";
}

function defaultAlign(node: StyledNode): CanvasAlign {
  return node.type === "figure" || node.type === "topic" ? "center" : "left";
}

function sharedValue<Value>(values: readonly Value[]): Value | null {
  const unique = new Set(values);
  const [only] = unique;
  return unique.size === 1 && only !== undefined ? only : null;
}

function nearestSide(bounds: Rect, point: XYPosition): CanvasSide {
  const gaps: Array<[CanvasSide, number]> = [
    ["top", point.y - bounds.y],
    ["right", bounds.x + bounds.width - point.x],
    ["bottom", bounds.y + bounds.height - point.y],
    ["left", point.x - bounds.x],
  ];
  return gaps.reduce((best, gap) => (gap[1] < best[1] ? gap : best))[0];
}

function entryOf(snapshot: CanvasSnapshot, id: string): string {
  return JSON.stringify(
    snapshot.items.find((entry) => entry.id === id) ??
      snapshot.connectors.find((entry) => entry.id === id) ??
      null,
  );
}

interface BoardProps {
  canvas: Canvas;
}

export function Board({ canvas }: BoardProps) {
  const flow = useReactFlow<CanvasNode, ConnectorEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>(() =>
    canvas.items.map(toNode),
  );
  const [edges, setEdges] = useState<ConnectorEdge[]>(() =>
    canvas.connectors.map(toEdge),
  );
  const [tool, setTool] = useState<CanvasTool>("select");
  const [penMode, setPenMode] = useState<PenMode>("marker");
  const [kept, setKept] = useState(false);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [color, setColor] = useState<CanvasColor>("yellow");
  const [outline, setOutline] = useState<CanvasOutline>("rectangle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [savesReady, setSavesReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history] = useState(() => createHistory());
  const minimapShown = useMinimapShown();
  const minimapItems = useMemo(
    () =>
      nodes.flatMap((node): MinimapItem[] =>
        node.hidden
          ? []
          : [
              {
                id: node.id,
                kind: node.type === "section" ? "section" : "item",
                selected: Boolean(node.selected),
                x: node.position.x,
                y: node.position.y,
                width: node.width ?? node.measured?.width ?? 0,
                height: node.height ?? node.measured?.height ?? 0,
              },
            ],
      ),
    [nodes],
  );

  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };
  const {
    guides,
    settle,
    begin: beginSettle,
    end: endSettle,
  } = useSettle(
    useCallback(() => latest.current.nodes, []),
    useCallback(() => flow.getZoom(), [flow]),
  );
  const viewport = useRef<Viewport>(canvas.viewport);
  const editStart = useRef<{ id: string; snapshot: CanvasSnapshot } | null>(
    null,
  );
  const editing = useRef<string | null>(null);
  const ownsSelection = useRef(false);
  const pointer = useRef<XYPosition | null>(null);
  const menuKind = useRef<MenuTarget["kind"]>("pane");
  const groupResize = useRef<{
    corner: Corner;
    bounds: Box;
    members: { id: string; box: Box; min: Size }[];
  } | null>(null);

  const current = useCallback(
    () => snapshotOf(latest.current.nodes, latest.current.edges),
    [],
  );
  const record = useCallback(
    () => history.record(current()),
    [current, history],
  );

  const beginEdit = useCallback((id: string, start: CanvasSnapshot | null) => {
    editStart.current = start ? { id, snapshot: start } : null;
    editing.current = id;
    setEditingId(id);
  }, []);

  const restore = useCallback((snapshot: CanvasSnapshot) => {
    editing.current = null;
    setEditingId(null);
    editStart.current = null;
    setNodes(snapshot.items.map(toNode));
    setEdges(snapshot.connectors.map(toEdge));
  }, []);

  const insert = useCallback(
    (
      items: CanvasItem[],
      options?: { edit?: boolean; connectors?: CanvasConnector[] },
    ) => {
      if (!items.length) return;
      record();
      const added = new Set(items.map((item) => item.id));
      setNodes((existing) => [
        ...existing.map((node) => ({ ...node, selected: false })),
        ...items.map((item) => ({ ...toNode(item), selected: true })),
      ]);
      setEdges((existing) => [
        ...existing.map((edge) => ({ ...edge, selected: false })),
        ...(options?.connectors ?? []).map(toEdge),
      ]);
      const first = items[0];
      if (options?.edit && first && added.size === 1) beginEdit(first.id, null);
    },
    [beginEdit, record],
  );

  const viewCenter = useCallback((): XYPosition => {
    const bounds = wrapper.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return flow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
  }, [flow]);

  const addSaves = useCallback(
    (saveIds: readonly string[], at?: XYPosition) => {
      const onBoard = new Set(
        latest.current.nodes.flatMap((node) =>
          node.type === "save" ? [node.data.saveId] : [],
        ),
      );
      const fresh = [...new Set(saveIds)].filter((id) => !onBoard.has(id));
      if (!fresh.length) {
        const wanted = new Set(saveIds);
        setNodes((existing) =>
          existing.map((node) => ({
            ...node,
            selected: node.type === "save" && wanted.has(node.data.saveId),
          })),
        );
        return;
      }
      insert(placeSaves(fresh, at ?? viewCenter()));
    },
    [insert, viewCenter],
  );

  useEffect(
    () =>
      claimUndo({
        undo: () => {
          const previous = history.undo(current());
          if (previous) restore(previous);
        },
        redo: () => {
          const next = history.redo(current());
          if (next) restore(next);
        },
      }),
    [current, history, restore],
  );

  useEffect(
    () => canvases.attachBoard({ id: canvas.id, addSaves }),
    [addSaves, canvas.id],
  );

  const saveIdsKey = useMemo(
    () =>
      [
        ...new Set(
          nodes.flatMap((node) =>
            node.type === "save" ? [node.data.saveId] : [],
          ),
        ),
      ]
        .sort()
        .join("\n"),
    [nodes],
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await ensureSaves(saveIdsKey ? saveIdsKey.split("\n") : []);
      } finally {
        if (live) setSavesReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [saveIdsKey]);

  const [initialContent] = useState(() =>
    JSON.stringify(contentOf(nodes, edges, canvas.viewport)),
  );
  const lastSaved = useRef(initialContent);
  const save = useCallback(
    (content: CanvasContent) => {
      const serialized = JSON.stringify(content);
      if (serialized === lastSaved.current) return;
      lastSaved.current = serialized;
      void (async () => {
        try {
          await canvases.persist(canvas.id, content);
        } catch (error) {
          lastSaved.current = "";
          notify({
            id: "canvas-save",
            title: "Couldn't save the canvas",
            description: errorCopy(error, "Your next change retries the save."),
          });
        }
      })();
    },
    [canvas.id],
  );
  const flush = useCallback(
    () =>
      save(
        contentOf(latest.current.nodes, latest.current.edges, viewport.current),
      ),
    [save],
  );

  useEffect(() => {
    const handle = window.setTimeout(
      () => save(contentOf(nodes, edges, viewport.current)),
      SAVE_DELAY_MS,
    );
    return () => window.clearTimeout(handle);
  }, [edges, nodes, save]);

  useEffect(() => () => flush(), [flush]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const settled = settle(changes);
      setNodes((existing) => applyNodeChanges(settled, existing));
    },
    [settle],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<ConnectorEdge>[]) =>
      setEdges((existing) => applyEdgeChanges(changes, existing)),
    [],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      record();
      setEdges((existing) =>
        addEdge(
          {
            ...connection,
            id: newId(),
            type: "connector",
            data: CONNECTOR_STYLE,
          },
          existing,
        ),
      );
    },
    [record],
  );
  const onReconnect = useCallback(
    (previous: ConnectorEdge, connection: Connection) => {
      if (connection.source === connection.target) return;
      record();
      setEdges((existing) =>
        reconnectEdge(previous, connection, existing, {
          shouldReplaceId: false,
        }),
      );
    },
    [record],
  );

  /** React Flow only connects on a handle; dropping anywhere on another item should link to its nearest side. */
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      setConnecting(false);
      if (state.isValid || !state.fromNode || !state.fromHandle) return;
      const pointer =
        "changedTouches" in event ? event.changedTouches[0] : event;
      if (!pointer) return;
      const point = flow.screenToFlowPosition(
        { x: pointer.clientX, y: pointer.clientY },
        { snapToGrid: false },
      );
      const fromId = state.fromNode.id;
      const target = flow
        .getIntersectingNodes({ x: point.x, y: point.y, width: 1, height: 1 })
        .findLast((node) => node.id !== fromId);
      if (!target) return;
      const bounds = flow.getNodesBounds([target]);
      onConnect({
        source: fromId,
        sourceHandle: state.fromHandle.id ?? null,
        target: target.id,
        targetHandle: nearestSide(bounds, point),
      });
    },
    [flow, onConnect],
  );

  const onSelectionChange = useCallback(
    ({ nodes: picked }: OnSelectionChangeParams<CanvasNode>) => {
      const saveIds = picked.flatMap((node) =>
        node.type === "save" ? [node.data.saveId] : [],
      );
      if (saveIds.length) {
        ownsSelection.current = true;
        selection.set(saveIds);
        primarySelection.set(saveIds[0] ?? null);
        return;
      }
      if (!ownsSelection.current) return;
      ownsSelection.current = false;
      selection.clear();
      primarySelection.set(null);
    },
    [],
  );

  const onStroke = useCallback(
    (points: StrokePoint[], size: number) => {
      const drawing = drawingFrom(
        points,
        color,
        size,
        penMode === "highlight" ? "highlight" : undefined,
      );
      if (drawing) insert([drawing]);
    },
    [color, insert, penMode],
  );

  const onErase = useCallback(
    (points: StrokePoint[]) => {
      const next = eraseDrawings(current().items, points, 18 / flow.getZoom());
      if (!next) return;
      record();
      const selectedIds = new Set(
        latest.current.nodes.flatMap((node) =>
          node.selected ? [node.id] : [],
        ),
      );
      setNodes(
        next.map((item) => ({
          ...toNode(item),
          selected: selectedIds.has(item.id),
        })),
      );
    },
    [current, flow, record],
  );

  const recolor = (next: CanvasColor) => {
    const recolors = latest.current.nodes.some(
      (node) => node.selected && isColored(node) && node.data.color !== next,
    );
    if (!recolors) return;
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && isColored(node)
          ? withData(node, { color: next })
          : node,
      ),
    );
  };

  const restyleText = (style: TextStyle) => {
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && isStyled(node) ? withData(node, style) : node,
      ),
    );
  };

  const restyleFigures = (
    data: Partial<Extract<CanvasNode, { type: "figure" }>["data"]>,
  ) => {
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && node.type === "figure" ? withData(node, data) : node,
      ),
    );
  };

  const changeTheme = (theme: CanvasTheme | undefined) => {
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && node.type === "code"
          ? withData(node, { theme })
          : node,
      ),
    );
  };

  const changeInkWeight = (weight: CanvasWeight) => {
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && node.type === "drawing"
          ? withData(node, { size: inkSize(node.data.ink, weight) })
          : node,
      ),
    );
  };

  const changeLanguage = (language: string) => {
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && node.type === "code"
          ? withData(node, { language })
          : node,
      ),
    );
  };

  const changeTable = (id: string, change: TableChange) => {
    const item = current().items.find((entry) => entry.id === id);
    if (item?.kind !== "table") return;
    const next = resizeTable(item, change);
    if (next === item) return;
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.id === id && node.type === "table"
          ? {
              ...withData(node, { rows: next.rows }),
              width: next.width,
              height: next.height,
            }
          : node,
      ),
    );
  };

  const changeOutline = (next: CanvasOutline) => {
    const reoutlines = latest.current.nodes.some(
      (node) =>
        node.selected && node.type === "figure" && node.data.outline !== next,
    );
    if (!reoutlines) return;
    record();
    setNodes((existing) =>
      existing.map((node) =>
        node.selected && node.type === "figure"
          ? { ...node, data: { ...node.data, outline: next } }
          : node,
      ),
    );
  };

  const finishEditing = useCallback(
    (id: string) => {
      if (editing.current !== id) return;
      const start = editStart.current;
      editStart.current = null;
      editing.current = null;
      setEditingId(null);
      if (start && entryOf(start.snapshot, id) !== entryOf(current(), id))
        history.record(start.snapshot);
    },
    [current, history],
  );

  const selected = nodes.filter((node) => node.selected);
  const [only] = selected;
  const selectedEdges = edges.filter((edge) => edge.selected);
  const connectorBarId =
    tool === "select" && !selected.length
      ? (selectedEdges.at(-1)?.id ?? null)
      : null;

  const actions = useMemo<BoardActions>(() => {
    const branch: BoardActions["branch"] = (id, kind) => {
      finishEditing(id);
      const result = branchOf(current(), id, kind);
      if (!result) return;
      record();
      const positions = new Map(
        result.snapshot.items.map((item) => [
          item.id,
          { x: item.x, y: item.y },
        ]),
      );
      const knownNodes = new Set(latest.current.nodes.map((node) => node.id));
      const knownEdges = new Set(latest.current.edges.map((edge) => edge.id));
      setNodes((existing) => [
        ...existing.map((node) => ({
          ...node,
          selected: false,
          position: positions.get(node.id) ?? node.position,
        })),
        ...result.snapshot.items
          .filter((item) => !knownNodes.has(item.id))
          .map((item) => ({ ...toNode(item), selected: true })),
      ]);
      setEdges((existing) => [
        ...existing.map((edge) => ({ ...edge, selected: false })),
        ...result.snapshot.connectors
          .filter((connector) => !knownEdges.has(connector.id))
          .map(toEdge),
      ]);
      beginEdit(result.created, null);
    };
    return {
      editingId,
      savesReady,
      connectorBarId,
      barsHidden: dragging,
      croppingId,
      record,
      setText: (id, text) => {
        setNodes((existing) =>
          existing.map((node) =>
            node.id === id ? withText(node, text) : node,
          ),
        );
        setEdges((existing) =>
          existing.map((edge) =>
            edge.id === id
              ? {
                  ...edge,
                  data: { ...CONNECTOR_STYLE, ...edge.data, label: text },
                }
              : edge,
          ),
        );
      },
      setCrop: (id, crop) => {
        const node = latest.current.nodes.find((entry) => entry.id === id);
        if (node?.type !== "save") return;
        record();
        setNodes((existing) =>
          existing.map((entry) => {
            if (entry.id !== id || entry.type !== "save") return entry;
            if (!crop) {
              const { crop: _crop, ...data } = entry.data;
              return { ...entry, data };
            }
            return withData(entry, { crop });
          }),
        );
        setCroppingId(null);
      },
      replaceSave: (id, saveId) => {
        record();
        setNodes((existing) =>
          existing.map((entry) => {
            if (entry.id !== id || entry.type !== "save") return entry;
            const { crop: _crop, ...data } = entry.data;
            return { ...entry, data: { ...data, saveId } };
          }),
        );
      },
      setRows: (id, rows) => {
        setNodes((existing) =>
          existing.map((node) =>
            node.id === id && node.type === "table"
              ? withData(node, { rows })
              : node,
          ),
        );
      },
      startEditing: (id) => beginEdit(id, current()),
      finishEditing,
      branch,
      quickCreate: (id, side) => {
        const node = latest.current.nodes.find((entry) => entry.id === id);
        if (!node || isLocked(node)) return;
        if (node.type === "topic" && side === "right") {
          branch(id, "child");
          return;
        }
        const pair = quickPair(toItem(node), side);
        if (!pair) return;
        insert([pair.item], { connectors: [pair.connector], edit: true });
      },
      restyle: (patch: Partial<ConnectorStyle>) => {
        record();
        setEdges((existing) =>
          existing.map((edge) =>
            edge.selected
              ? {
                  ...edge,
                  data: { ...CONNECTOR_STYLE, ...edge.data, ...patch },
                }
              : edge,
          ),
        );
      },
      deleteConnectors: () =>
        void flow.deleteElements({
          edges: latest.current.edges.filter((edge) => edge.selected),
        }),
    };
  }, [
    beginEdit,
    connectorBarId,
    croppingId,
    current,
    dragging,
    editingId,
    finishEditing,
    flow,
    insert,
    record,
    savesReady,
  ]);

  const pickedIds = () =>
    new Set(
      latest.current.nodes.flatMap((node) => (node.selected ? [node.id] : [])),
    );
  const movable = () =>
    latest.current.nodes.filter((node) => node.selected && !isLocked(node));

  const duplicate = () => {
    const copy = duplicateOf(current(), pickedIds());
    insert(copy.items, { connectors: copy.connectors });
  };

  const place = (positions: ReadonlyMap<string, XYPosition>) => {
    const moves = latest.current.nodes.some((node) => {
      const next = positions.get(node.id);
      return next && (next.x !== node.position.x || next.y !== node.position.y);
    });
    if (!moves) return;
    record();
    setNodes((existing) =>
      existing.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
      }),
    );
  };

  const nudge = (x: number, y: number): boolean => {
    const targets = movable();
    if (!targets.length) return false;
    place(
      new Map(
        targets.map((node) => [
          node.id,
          { x: node.position.x + x, y: node.position.y + y },
        ]),
      ),
    );
    return true;
  };

  const restack = (move: Parameters<typeof reorder>[2]) => {
    const ids = pickedIds();
    const next = reorder(latest.current.nodes, ids, move);
    if (next.every((node, index) => node === latest.current.nodes[index]))
      return;
    record();
    setNodes((existing) => reorder(existing, ids, move));
  };

  const toggleLock = () => {
    const picked = latest.current.nodes.filter((node) => node.selected);
    if (!picked.length) return;
    const lock = picked.some((node) => !isLocked(node));
    record();
    setNodes((existing) =>
      existing.map((node) => (node.selected ? withLock(node, lock) : node)),
    );
  };

  const writeClip = (data: DataTransfer): boolean => {
    const ids = pickedIds();
    if (!ids.size) return false;
    const clip = clipOf(current(), ids);
    data.setData(CLIP_TYPE, JSON.stringify(clip));
    data.setData("text/plain", clipText(clip));
    return true;
  };

  const regroup = (group: string | null) => {
    const picked = latest.current.nodes.filter((node) => node.selected);
    if (group ? picked.length < 2 : !picked.some((node) => node.data.group))
      return;
    record();
    setNodes((existing) =>
      existing.map((node) => (node.selected ? withGroup(node, group) : node)),
    );
  };

  const wrap = () => {
    const picked = latest.current.nodes.filter((node) => node.selected);
    const section = sectionAround(picked.map(frameOf), "gray");
    if (!section) return;
    record();
    setNodes((existing) => {
      const at = Math.max(
        0,
        existing.findIndex((node) => node.selected),
      );
      const rest = existing.map((node) => ({ ...node, selected: false }));
      return [
        ...rest.slice(0, at),
        { ...toNode(section), selected: true },
        ...rest.slice(at),
      ];
    });
    beginEdit(section.id, null);
  };

  const exportImage = async (
    format: "png" | "pdf",
    scope: "board" | "selection" | undefined,
  ) => {
    const surface = wrapper.current;
    const all = latest.current.nodes;
    const picked = all.filter((node) => node.selected);
    const targets =
      scope === "board" || (!scope && !picked.length) ? all : picked;
    if (!surface || !targets.length) return;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const shown = new Set(targets.map((node) => node.id));
    const wasSelected = new Set(picked.map((node) => node.id));
    const selectedEdges = new Set(
      latest.current.edges.flatMap((edge) => (edge.selected ? [edge.id] : [])),
    );
    const view = flow.getViewport();
    const bounds = flow.getNodesBounds(targets);
    const padding = 48;
    setExporting(true);
    setNodes((existing) =>
      existing.map((node) => ({
        ...node,
        selected: false,
        hidden: !shown.has(node.id) || undefined,
      })),
    );
    setEdges((existing) =>
      existing.map((edge) => ({ ...edge, selected: false })),
    );
    let image: Awaited<ReturnType<typeof renderBoard>>;
    try {
      image = await renderBoard({
        surface,
        bounds: {
          x: bounds.x - padding,
          y: bounds.y - padding,
          width: bounds.width + padding * 2,
          height: bounds.height + padding * 2,
        },
        setViewport: (next) => {
          void flow.setViewport(next);
        },
      });
    } catch (error) {
      notify({
        id: "canvas-export",
        title: "Couldn't export the canvas",
        description: errorCopy(error, "Try exporting again."),
      });
      return;
    } finally {
      setNodes((existing) =>
        existing.map((node) => ({
          ...node,
          selected: wasSelected.has(node.id),
          hidden: undefined,
        })),
      );
      setEdges((existing) =>
        existing.map((edge) => ({
          ...edge,
          selected: selectedEdges.has(edge.id),
        })),
      );
      void flow.setViewport(view);
      setExporting(false);
    }
    try {
      const result = await window.pond.query("canvases.export", {
        name: canvas.name,
        format,
        ...image,
      });
      if (result.ok)
        notify({
          id: "canvas-export",
          title: format === "png" ? "Exported PNG" : "Exported PDF",
        });
    } catch (error) {
      notify({
        id: "canvas-export",
        title: "Couldn't export the canvas",
        description: errorCopy(error, "Try exporting again."),
      });
    }
  };

  const importAt = async (plan: PasteImport, at: XYPosition) => {
    try {
      const ids = await runPasteImport(plan);
      if (ids.length) addSaves(ids, at);
    } catch (error) {
      notify({
        id: "canvas-import",
        title: "Couldn't add the pasted items",
        description: errorCopy(error, "Try pasting again."),
      });
    }
  };

  const pasteFrom = (data: DataTransfer): boolean => {
    const at = pointer.current
      ? flow.screenToFlowPosition(pointer.current)
      : viewCenter();
    const clip = parseClip(data.getData(CLIP_TYPE));
    if (clip) {
      const onBoard = new Set(
        latest.current.nodes.flatMap((node) =>
          node.type === "save" ? [node.data.saveId] : [],
        ),
      );
      const copy = pasteOf(clip, at, onBoard);
      if (copy.items.length)
        insert(copy.items, { connectors: copy.connectors });
      else
        addSaves(
          clip.items.flatMap((item) =>
            item.kind === "save" ? [item.saveId] : [],
          ),
        );
      return true;
    }
    const plan = pasteImportOf(data);
    if (plan) {
      void importAt(plan, at);
      return true;
    }
    const text = data.getData("text/plain").trim();
    if (!text) return false;
    insert([textAt(at, text)]);
    return true;
  };

  const run = (command: CanvasCommand) => {
    switch (command.type) {
      case "select-all":
        setNodes((existing) =>
          existing.map((node) => ({ ...node, selected: true })),
        );
        return;
      case "copy":
      case "cut":
        /** Menu clicks carry user activation, which lets `execCommand` raise a real clipboard event on the board. */
        wrapper.current?.focus();
        document.execCommand(command.type);
        return;
      case "duplicate":
        duplicate();
        return;
      case "delete":
        void flow.deleteElements({
          nodes: latest.current.nodes.filter((node) => node.selected),
          edges: latest.current.edges.filter((edge) => edge.selected),
        });
        return;
      case "layer":
        restack(command.move);
        return;
      case "align": {
        const frames = movable().map(frameOf);
        if (frames.length > 1) place(alignFrames(frames, command.edge));
        return;
      }
      case "distribute":
        place(distributeFrames(movable().map(frameOf), command.axis));
        return;
      case "tidy": {
        const frames = movable().map(frameOf);
        if (frames.length > 1) place(tidyFrames(frames));
        return;
      }
      case "lock":
        toggleLock();
        return;
      case "group":
        regroup(newId());
        return;
      case "ungroup":
        regroup(null);
        return;
      case "wrap":
        wrap();
        return;
      case "export":
        void exportImage(command.format, command.scope);
        return;
      case "zoom": {
        const picked = latest.current.nodes.filter((node) => node.selected);
        if (command.to === "actual") void flow.zoomTo(1, { duration: 200 });
        else if (command.to === "selection" && picked.length)
          void flow.fitView({ nodes: picked, duration: 200, padding: 0.2 });
        else if (command.to === "fit")
          void flow.fitView({ duration: 200, padding: 0.2 });
        return;
      }
      case "minimap":
        minimap.toggle();
        return;
      case "nudge":
        nudge(command.x, command.y);
        return;
      case "rotate": {
        const targets = movable().filter((node) => node.type !== "section");
        if (!targets.length) return;
        record();
        const ids = new Set(targets.map((node) => node.id));
        setNodes((existing) =>
          existing.map((node) =>
            ids.has(node.id)
              ? withData(node, {
                  rotation: turned(node.data.rotation, command.delta),
                })
              : node,
          ),
        );
        return;
      }
      case "flip": {
        const figures = latest.current.nodes.filter(
          (node) => node.selected && node.type === "figure" && !isLocked(node),
        );
        if (!figures.length) return;
        record();
        const ids = new Set(figures.map((node) => node.id));
        setNodes((existing) =>
          existing.map((node) => {
            if (!ids.has(node.id) || node.type !== "figure") return node;
            const item = toItem(node);
            if (item.kind !== "figure") return node;
            return { ...toNode(flipped(item, command.axis)), selected: true };
          }),
        );
        return;
      }
      case "convert-notes": {
        const texts = latest.current.nodes.filter(
          (node) => node.selected && node.type === "text" && !isLocked(node),
        );
        if (!texts.length) return;
        record();
        const ids = new Set(texts.map((node) => node.id));
        setNodes((existing) =>
          existing.map((node) => {
            if (!ids.has(node.id) || node.type !== "text") return node;
            const item = toItem(node);
            return item.kind === "text"
              ? { ...toNode(noteFromText(item, color)), selected: true }
              : node;
          }),
        );
        return;
      }
      case "sort-notes": {
        const notes = latest.current.nodes.filter(
          (node) => node.selected && node.type === "note" && !isLocked(node),
        );
        if (notes.length < 2) return;
        place(
          notesSorted(
            notes.flatMap((node) =>
              node.type === "note"
                ? [
                    {
                      id: node.id,
                      color: node.data.color,
                      x: node.position.x,
                      y: node.position.y,
                      width: node.width ?? node.measured?.width ?? 0,
                      height: node.height ?? node.measured?.height ?? 0,
                    },
                  ]
                : [],
            ),
          ),
        );
        return;
      }
      case "crop": {
        const save = latest.current.nodes.find(
          (node) => node.selected && node.type === "save",
        );
        if (save) setCroppingId(save.id);
        return;
      }
      case "reset-crop": {
        const saves = latest.current.nodes.filter(
          (node) => node.selected && node.type === "save" && node.data.crop,
        );
        if (!saves.length) return;
        record();
        const ids = new Set(saves.map((node) => node.id));
        setNodes((existing) =>
          existing.map((node) => {
            if (!ids.has(node.id) || node.type !== "save") return node;
            const { crop: _crop, ...data } = node.data;
            return { ...node, data };
          }),
        );
        return;
      }
      case "quick": {
        const picked = latest.current.nodes.filter((node) => node.selected);
        const [single] = picked;
        if (picked.length === 1 && single)
          actions.quickCreate(single.id, command.side);
        return;
      }
    }
  };

  const startGroupResize = (corner: Corner) => {
    const members = latest.current.nodes
      .filter((node) => node.selected)
      .map((node) => ({
        id: node.id,
        box: frameOf(node),
        min: MIN_SIZE[node.type],
      }));
    const left = Math.min(...members.map(({ box }) => box.x));
    const top = Math.min(...members.map(({ box }) => box.y));
    const right = Math.max(...members.map(({ box }) => box.x + box.width));
    const bottom = Math.max(...members.map(({ box }) => box.y + box.height));
    record();
    groupResize.current = {
      corner,
      bounds: { x: left, y: top, width: right - left, height: bottom - top },
      members,
    };
  };

  const resizeGroup = (point: XYPosition, keepAspect: boolean) => {
    const resize = groupResize.current;
    if (!resize) return;
    const scale = groupScale(
      resize.bounds,
      resize.corner,
      point,
      resize.members.map(({ box, min }) => ({ ...box, min })),
      keepAspect,
    );
    const boxes = new Map(
      resize.members.map(({ id, box }) => [id, scaleBox(box, scale)]),
    );
    setNodes((existing) =>
      existing.map((node) => {
        const box = boxes.get(node.id);
        return box ? withBox(node, box) : node;
      }),
    );
  };

  const startDrag = (dragged: readonly CanvasNode[]) => {
    record();
    setDragging(true);
    beginSettle(dragged);
  };

  const stopDrag = () => {
    endSettle();
    setDragging(false);
  };

  const menuItems = () => {
    if (menuKind.current === "pane")
      return boardItems({ kind: "pane", minimap: minimap.shown() }, run);
    if (menuKind.current === "edge") return boardItems({ kind: "edge" }, run);
    const picked = latest.current.nodes.filter((node) => node.selected);
    return boardItems(
      {
        kind: "nodes",
        count: picked.length,
        grouped: picked.some((node) => node.data.group),
        movable: picked.filter((node) => !isLocked(node)).length,
        locked: picked.length > 0 && picked.every(isLocked),
        duplicable: picked.some((node) => node.type !== "save"),
        canRotate: picked.some(
          (node) => node.type !== "section" && !isLocked(node),
        ),
        canFlip: picked.some(
          (node) => node.type === "figure" && !isLocked(node),
        ),
        canConvert: picked.some(
          (node) => node.type === "text" && !isLocked(node),
        ),
        canSort:
          picked.filter((node) => node.type === "note" && !isLocked(node))
            .length > 1,
        canCrop: picked.some((node) => node.type === "save"),
        cropped: picked.some((node) => node.type === "save" && node.data.crop),
        canQuick:
          picked.length === 1 && picked.some((node) => canQuickCreate(node)),
      },
      run,
    );
  };

  const openable =
    selected.length === 1 && only?.type === "save" && pool.get(only.data.saveId)
      ? only.data.saveId
      : null;
  const showColors =
    COLORED_TOOLS.has(tool) && (tool !== "pen" || penMode !== "erase");
  const onCanvas = useMemo(
    () => new Set(saveIdsKey ? saveIdsKey.split("\n") : []),
    [saveIdsKey],
  );

  const arrangeable = selected.filter((node) => !isLocked(node)).length;

  const lead: SelectionControl[] = [];
  const style: SelectionControl[] = [];
  const extras: SelectionControl[] = [];
  const figures = selected.filter((node) => node.type === "figure");
  if (figures.length) {
    lead.push({
      kind: "custom",
      label: "Shape",
      element: (
        <Picker.Outlines
          value={sharedValue(figures.map((node) => node.data.outline))}
          size="xs"
          onChange={changeOutline}
        />
      ),
    });
    style.push(
      {
        kind: "menu",
        label: "Fill",
        icon: <IconFill />,
        buildItems: () =>
          fillItems(
            sharedValue(figures.map((node) => node.data.fill ?? "solid")),
            (fill) =>
              restyleFigures({ fill: fill === "solid" ? undefined : fill }),
          ),
      },
      {
        kind: "menu",
        label: "Border",
        icon: <IconBorder />,
        buildItems: () =>
          borderItems(
            sharedValue(figures.map((node) => node.data.border ?? "solid")),
            (border) =>
              restyleFigures({
                border: border === "solid" ? undefined : border,
              }),
          ),
      },
    );
  }
  const codes = selected.filter((node) => node.type === "code");
  if (codes.length) {
    const language = sharedValue(codes.map((node) => node.data.language));
    lead.push(
      {
        kind: "menu",
        label: "Language",
        icon: <IconCode2 />,
        buildItems: () => languageItems(language, changeLanguage),
      },
      {
        kind: "menu",
        label: "Theme",
        icon: <IconContrast />,
        buildItems: () =>
          themeItems(
            sharedValue(codes.map((node) => node.data.theme ?? null)),
            changeTheme,
          ),
      },
    );
  }
  if (selected.length === 1 && only?.type === "table")
    lead.push({
      kind: "menu",
      label: "Table",
      icon: <IconTable />,
      buildItems: () => tableItems((change) => changeTable(only.id, change)),
    });
  const inks = selected.filter((node) => node.type === "drawing");
  if (inks.length)
    style.push({
      kind: "menu",
      label: "Stroke",
      icon: <IconLineWeight />,
      buildItems: () =>
        weightItems(
          sharedValue(
            inks.map((node) =>
              node.data.size > inkSize(node.data.ink, "thin")
                ? "thick"
                : "thin",
            ),
          ),
          changeInkWeight,
        ),
    });
  const styled = selected.filter(isStyled);
  if (styled.length) {
    const bold = styled.every((node) => node.data.bold);
    const strike = styled.every((node) => node.data.strike);
    const align = sharedValue(
      styled.map((node) => node.data.align ?? defaultAlign(node)),
    );
    style.push(
      {
        kind: "menu",
        label: "Font",
        icon: <IconTypography />,
        buildItems: () =>
          fontItems(
            sharedValue(styled.map((node) => node.data.font ?? "simple")),
            restyleText,
          ),
      },
      {
        kind: "menu",
        label: "Size",
        icon: <IconTextA />,
        buildItems: () =>
          sizeItems(
            sharedValue(styled.map((node) => node.data.textSize ?? "medium")),
            restyleText,
          ),
      },
      {
        kind: "action",
        label: "Bold",
        icon: <IconTextBold />,
        pressed: bold,
        onClick: () => restyleText({ bold: bold ? undefined : true }),
      },
      {
        kind: "action",
        label: "Strikethrough",
        icon: <IconTextStrikethrough />,
        pressed: strike,
        onClick: () => restyleText({ strike: strike ? undefined : true }),
      },
      {
        kind: "menu",
        label: "Align",
        icon: alignIcon(align),
        buildItems: () =>
          alignItems(
            {
              align,
              valign: sharedValue(
                styled.map((node) => node.data.valign ?? defaultValign(node)),
              ),
            },
            restyleText,
            styled.every(
              (node) => node.type === "note" || node.type === "figure",
            ),
          ),
      },
    );
  }
  if (selected.length === 1 && only?.type === "section" && !isLocked(only))
    extras.push({
      kind: "action",
      label: "Rename",
      icon: <IconRename />,
      onClick: () => actions.startEditing(only.id),
    });
  if (arrangeable > 1)
    extras.push(
      {
        kind: "action",
        label: "Tidy Up",
        icon: <IconBroom />,
        shortcut: glyphsFor({ type: "tidy" }),
        onClick: () => run({ type: "tidy" }),
      },
      {
        kind: "action",
        label: "Wrap in Section",
        icon: <IconSection />,
        onClick: () => run({ type: "wrap" }),
      },
    );
  if (selected.some((node) => node.data.group))
    extras.push({
      kind: "action",
      label: "Ungroup",
      icon: <IconUngroup />,
      shortcut: glyphsFor({ type: "ungroup" }),
      onClick: () => run({ type: "ungroup" }),
    });
  else if (selected.length > 1)
    extras.push({
      kind: "action",
      label: "Group",
      icon: <IconGroup />,
      shortcut: glyphsFor({ type: "group" }),
      onClick: () => run({ type: "group" }),
    });
  if (selected.length) {
    const locked = selected.every(isLocked);
    extras.push({
      kind: "action",
      label: locked ? "Unlock" : "Lock",
      icon: locked ? <IconLock /> : <IconLockOpen />,
      shortcut: glyphsFor({ type: "lock" }),
      pressed: locked,
      onClick: () => run({ type: "lock" }),
    });
  }

  const placeAt = (point: XYPosition): CanvasItem | null => {
    switch (tool) {
      case "note":
        return noteAt(point, color);
      case "figure":
        return figureAt(point, outline, color);
      case "text":
        return textAt(point);
      case "section":
        return sectionAt(point, color);
      case "table":
        return tableAt(point, color);
      case "code":
        return codeAt(point, DEFAULT_LANGUAGE);
      case "topic":
        return topicAt(point, color);
      default:
        return null;
    }
  };

  const placeStamp = (
    rect: { x: number; y: number; width: number; height: number } | null,
    point: XYPosition,
  ) => {
    if (!isStamp(tool)) return;
    const item = rect
      ? itemForRect(tool, rect, {
          color,
          outline,
          language: DEFAULT_LANGUAGE,
        })
      : placeAt(point);
    if (!item) return;
    insert([item], {
      edit:
        item.kind === "note" ||
        item.kind === "text" ||
        item.kind === "figure" ||
        item.kind === "topic" ||
        item.kind === "code",
    });
    if (!kept) setTool("select");
  };

  function isStamp(value: CanvasTool): value is StampKind {
    return STAMP_TOOLS.has(value);
  }

  return (
    <BoardContext.Provider value={actions}>
      <SpecContextMenu buildItems={menuItems}>
        <div
          ref={wrapper}
          className={styles.board}
          role="application"
          aria-label={canvas.name}
          aria-roledescription="canvas"
          data-tool={tool}
          data-connecting={connecting || undefined}
          data-multiple={selected.length > 1 || undefined}
          data-exporting={exporting || undefined}
          tabIndex={-1}
          onPointerMove={(event) => {
            pointer.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerLeave={() => {
            pointer.current = null;
          }}
          onCopy={(event) => {
            if (isEditableTarget(event.target)) return;
            if (writeClip(event.clipboardData)) event.preventDefault();
          }}
          onCut={(event) => {
            if (isEditableTarget(event.target)) return;
            if (!writeClip(event.clipboardData)) return;
            event.preventDefault();
            void flow.deleteElements({
              nodes: latest.current.nodes.filter((node) => node.selected),
            });
          }}
          onPaste={(event) => {
            if (isEditableTarget(event.target)) return;
            if (!pasteFrom(event.clipboardData)) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDownCapture={(event) => {
            if (isEditableTarget(event.target)) return;
            const command = commandForKey(event);
            if (command?.type !== "nudge") return;
            /** React Flow moves focused nodes on arrow keys too, so the board takes the key first. */
            if (!nudge(command.x, command.y)) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (isEditableTarget(event.target)) return;
            const command = commandForKey(event);
            if (command && command.type !== "copy" && command.type !== "cut") {
              if (command.type === "nudge") return;
              event.preventDefault();
              run(command);
              return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === "Enter" && selected.length === 1 && only) {
              event.preventDefault();
              if (openable) openSave(openable);
              else if (hasText(only) && !isLocked(only))
                actions.startEditing(only.id);
              return;
            }
            if (
              event.key === "Tab" &&
              selected.length === 1 &&
              only?.type === "topic"
            ) {
              event.preventDefault();
              actions.branch(only.id, "child");
              return;
            }
            if (event.key === "Enter" && connectorBarId) {
              event.preventDefault();
              actions.startEditing(connectorBarId);
              return;
            }
            if (event.key === "Escape") {
              if (croppingId) {
                setCroppingId(null);
                return;
              }
              setKept(false);
              setTool("select");
              return;
            }
            const next = toolForKey(event.key, event.shiftKey);
            if (next) {
              event.preventDefault();
              setKept(false);
              setTool(next);
            }
          }}
          onDragOver={(event) => {
            const types = Array.from(event.dataTransfer.types);
            if (
              !isLibrarySaveDrag(event.dataTransfer) &&
              !types.includes("Files") &&
              !types.includes("text/uri-list")
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            const at = flow.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });
            if (isLibrarySaveDrag(event.dataTransfer)) {
              event.preventDefault();
              event.stopPropagation();
              addSaves(saveDropIds(event.dataTransfer), at);
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const plan = pasteImportOf(event.dataTransfer);
            if (plan && plan.kind !== "clipboard") void importAt(plan, at);
          }}
        >
          <ReactFlow<CanvasNode, ConnectorEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            defaultViewport={canvas.viewport}
            minZoom={0.05}
            maxZoom={8}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={40}
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode={["Meta", "Shift"]}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag={tool === "select"}
            panOnDrag={tool === "hand" ? true : tool === "select" ? [1] : false}
            panOnScroll
            elevateNodesOnSelect={false}
            elementsSelectable={tool === "select"}
            nodesDraggable={tool === "select"}
            nodesConnectable={tool === "select"}
            proOptions={{ hideAttribution: true }}
            isValidConnection={(connection) =>
              connection.source !== connection.target
            }
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            connectOnClick={false}
            onConnectStart={() => setConnecting(true)}
            onConnectEnd={onConnectEnd}
            onSelectionChange={onSelectionChange}
            onNodeDragStart={(_, __, dragged) => startDrag(dragged)}
            onSelectionDragStart={(_, dragged) => startDrag(dragged)}
            onNodeDragStop={stopDrag}
            onSelectionDragStop={stopDrag}
            onBeforeDelete={async () => {
              record();
              return true;
            }}
            onMoveEnd={(_, next) => {
              viewport.current = next;
              flush();
            }}
            onNodeDoubleClick={(_, node) => {
              if (tool !== "select") return;
              if (node.type === "save") {
                if (pool.get(node.data.saveId)) openSave(node.data.saveId);
              } else if (hasText(node) && !isLocked(node))
                actions.startEditing(node.id);
            }}
            onNodeContextMenu={(_, node) => {
              menuKind.current = "nodes";
              if (node.selected) return;
              setNodes((existing) =>
                existing.map((entry) => ({
                  ...entry,
                  selected: entry.id === node.id,
                })),
              );
              setEdges((existing) =>
                existing.map((edge) => ({ ...edge, selected: false })),
              );
            }}
            onSelectionContextMenu={() => {
              menuKind.current = "nodes";
            }}
            onEdgeContextMenu={(_, edge) => {
              menuKind.current = "edge";
              setNodes((existing) =>
                existing.map((node) => ({ ...node, selected: false })),
              );
              setEdges((existing) =>
                existing.map((entry) => ({
                  ...entry,
                  selected: entry.id === edge.id,
                })),
              );
            }}
            onPaneContextMenu={() => {
              menuKind.current = "pane";
            }}
            onEdgeDoubleClick={(_, edge) => {
              if (tool === "select") actions.startEditing(edge.id);
            }}
            onPaneClick={() => {
              if (croppingId) setCroppingId(null);
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={GRID}
              size={1.5}
              className={styles.dots}
            />
            {tool === "pen" ? (
              <DrawLayer
                color={color}
                size={
                  penMode === "highlight"
                    ? HIGHLIGHT_SIZE
                    : penMode === "erase"
                      ? 18
                      : PEN_SIZE
                }
                mode={penMode}
                onStroke={onStroke}
                onErase={onErase}
              />
            ) : null}
            {isStamp(tool) ? <PlaceLayer onPlace={placeStamp} /> : null}
            {tool === "select" &&
            !dragging &&
            !editingId &&
            !croppingId &&
            selected.length === 1 &&
            only &&
            only.type !== "section" &&
            !isLocked(only) ? (
              <Affordance
                frame={frameOf(only)}
                rotation={only.data.rotation}
                min={MIN_SIZE[only.type]}
                onStart={record}
                onRotate={(rotation) => {
                  const id = only.id;
                  setNodes((existing) =>
                    existing.map((node) =>
                      node.id === id ? withData(node, { rotation }) : node,
                    ),
                  );
                }}
                onResize={(box) => {
                  const id = only.id;
                  setNodes((existing) =>
                    existing.map((node) =>
                      node.id === id ? withBox(node, box) : node,
                    ),
                  );
                }}
              />
            ) : null}
            {tool === "select" && selected.length > 1 ? (
              <SelectionFrame
                frame={flow.getNodesBounds(selected)}
                resizable={!dragging && !selected.some(isLocked)}
                onResizeStart={startGroupResize}
                onResize={resizeGroup}
              />
            ) : null}
            <Guides guides={guides} />
            <SelectionBar
              nodes={tool === "select" ? selected : []}
              hidden={dragging}
              canOpen={openable !== null}
              canCrop={selected.length === 1 && only?.type === "save"}
              onCanvas={onCanvas}
              arrange={
                arrangeable > 1 ? () => arrangeItems(arrangeable, run) : null
              }
              lead={lead}
              style={style}
              extras={extras}
              onColor={recolor}
              onOpen={() => {
                if (openable) openSave(openable);
              }}
              onCrop={() => {
                if (only?.type === "save") setCroppingId(only.id);
              }}
              onReplace={(ids) => {
                const next = ids[0];
                if (next && only?.type === "save")
                  actions.replaceSave(only.id, next);
              }}
              onDuplicate={duplicate}
              onDelete={() => void flow.deleteElements({ nodes: selected })}
            />
          </ReactFlow>
          <Tools
            tool={tool}
            color={color}
            outline={outline}
            penMode={penMode}
            kept={kept}
            showColors={showColors}
            showOutlines={tool === "figure"}
            onCanvas={onCanvas}
            onTool={(next) => {
              setKept(false);
              setTool(next);
            }}
            onColor={setColor}
            onOutline={setOutline}
            onPenMode={setPenMode}
            onKeep={setKept}
            onAddSaves={(saveIds) => addSaves(saveIds)}
          />
          <Zoom minimap={minimapShown} onMinimap={minimap.toggle} />
          <Minimap items={minimapItems} shown={minimapShown} />
        </div>
      </SpecContextMenu>
    </BoardContext.Provider>
  );
}
