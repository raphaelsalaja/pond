import type {
  Canvas,
  CanvasContent,
  CanvasSummary,
} from "@shared/canvas-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { getAppRouter } from "@/shared/lib/app-router";

interface CanvasesState {
  canvases: CanvasSummary[];
  editingId: string | null;
}

const store = new Store<CanvasesState>({
  canvases: [],
  editingId: null,
});

type Placement = "beside";

interface OpenBoard {
  id: string;
  addSaves(saveIds: readonly string[], placement?: Placement): void;
}

/** The open board places incoming Saves itself, so a pending autosave never overwrites them. */
let openBoard: OpenBoard | null = null;

const documents = new Map<string, Canvas>();

/** The open board flushes on unmount, which lands after its Canvas was deleted. */
const removed = new Set<string>();

function canvasPath(id: string): string {
  return `/canvas/${encodeURIComponent(id)}`;
}

export function canvasIdFromPath(pathname: string): string | null {
  const match = /^\/canvas\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function summaryFor(canvas: Canvas): CanvasSummary {
  return {
    id: canvas.id,
    name: canvas.name,
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
    itemCount: canvas.items.length,
    saveIds: [
      ...new Set(
        canvas.items.flatMap((item) =>
          item.kind === "save" ? [item.saveId] : [],
        ),
      ),
    ],
  };
}

function replaceSummary(canvas: Canvas): void {
  const next = summaryFor(canvas);
  store.setState((state) => ({
    ...state,
    canvases: state.canvases.some((entry) => entry.id === canvas.id)
      ? state.canvases.map((entry) => (entry.id === canvas.id ? next : entry))
      : [...state.canvases, next],
  }));
}

export const canvases = {
  snapshot(): CanvasSummary[] {
    return store.state.canvases;
  },
  async refresh(): Promise<void> {
    const list = await window.pond.query("canvases.list", {});
    store.setState((state) => ({
      ...state,
      canvases: list,
      editingId: list.some((canvas) => canvas.id === state.editingId)
        ? state.editingId
        : null,
    }));
  },
  open(id: string): void {
    getAppRouter()?.history.push(canvasPath(id));
  },
  async create(
    saveIds: readonly string[] = [],
    name?: string,
  ): Promise<Canvas> {
    const canvas = await window.pond.query("canvases.create", {
      name,
      saveIds: saveIds.length ? [...saveIds] : undefined,
    });
    documents.set(canvas.id, canvas);
    replaceSummary(canvas);
    canvases.open(canvas.id);
    canvases.startEditing(canvas.id);
    return canvas;
  },
  async rename(id: string, name: string): Promise<void> {
    await window.pond.query("canvases.rename", { id, name });
    const cached = documents.get(id);
    if (cached) documents.set(id, { ...cached, name: name.trim() });
    await canvases.refresh();
  },
  async remove(id: string): Promise<void> {
    removed.add(id);
    try {
      await window.pond.query("canvases.delete", { id });
    } catch (error) {
      removed.delete(id);
      throw error;
    }
    documents.delete(id);
    const router = getAppRouter();
    if (router && canvasIdFromPath(router.state.location.pathname) === id)
      router.history.push("/");
    await canvases.refresh();
  },
  isOpen(id: string): boolean {
    return openBoard?.id === id;
  },
  async addSaves(
    id: string,
    saveIds: readonly string[],
    placement?: Placement,
  ): Promise<void> {
    if (!saveIds.length) return;
    if (openBoard?.id === id) {
      openBoard.addSaves(saveIds, placement);
      return;
    }
    const canvas = await window.pond.query("canvases.addSaves", {
      id,
      saveIds: [...saveIds],
    });
    documents.set(id, canvas);
    replaceSummary(canvas);
  },
  async load(id: string): Promise<Canvas | null> {
    const cached = documents.get(id);
    if (cached) return cached;
    const canvas = await window.pond.query("canvases.get", { id });
    if (canvas) documents.set(id, canvas);
    return canvas;
  },
  async persist(id: string, content: CanvasContent): Promise<void> {
    if (removed.has(id)) return;
    const cached = documents.get(id);
    if (cached) documents.set(id, { ...cached, ...content });
    const { updatedAt } = await window.pond.query("canvases.update", {
      id,
      content,
    });
    const saved = documents.get(id);
    if (saved) {
      const next = { ...saved, updatedAt };
      documents.set(id, next);
      replaceSummary(next);
    }
  },
  attachBoard(board: OpenBoard): () => void {
    openBoard = board;
    return () => {
      if (openBoard === board) openBoard = null;
    };
  },
  startEditing(id: string): void {
    store.setState((state) => ({ ...state, editingId: id }));
  },
  finishEditing(): void {
    store.setState((state) => ({ ...state, editingId: null }));
  },
};

export function useCanvases(): CanvasSummary[] {
  return useSelector(store, (state) => state.canvases);
}

export function useCanvas(id: string | null): CanvasSummary | undefined {
  return useSelector(store, (state) =>
    id ? state.canvases.find((canvas) => canvas.id === id) : undefined,
  );
}

export function useCanvasEditingId(): string | null {
  return useSelector(store, (state) => state.editingId);
}

export function useHydrateCanvases(): void {
  useEffect(() => {
    void canvases.refresh();
  }, []);
}
