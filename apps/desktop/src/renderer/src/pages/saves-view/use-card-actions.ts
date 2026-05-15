import { useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { optimistic } from "@/pool/bootstrap";
import { pool } from "@/pool/pool";
import { selection, useSelectionSize } from "@/pool/selection";
import type { SavesMode } from "./use-saves-data";

export interface CardActions {
  busy: string | null;
  selectionSize: number;
  multiSelectActive: boolean;
  handleCardClick: (id: string, e: React.MouseEvent) => void;
  focus: (id: string) => void;
  moveToTrash: (id: string) => Promise<void>;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
}

export function useCardActions(
  filteredIds: string[],
  mode: SavesMode,
  sourceFilter: string,
): CardActions {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const selectionSize = useSelectionSize();
  const multiSelectActive = selectionSize > 0;

  const listBase = location.pathname.replace(/\/save\/[^/]+\/?$/, "") || "/";
  const buildSavePath = useCallback(
    (id: string) =>
      listBase === "/" ? `/save/${id}` : `${listBase}/save/${id}`,
    [listBase],
  );
  const buildDetailPath = useCallback(
    (id: string) =>
      listBase === "/" ? `/detail/${id}` : `${listBase}/detail/${id}`,
    [listBase],
  );

  const select = useCallback(
    (id: string) => {
      navigate({
        pathname: buildSavePath(id),
        search: searchParams.toString(),
      });
    },
    [buildSavePath, navigate, searchParams],
  );

  const focus = useCallback(
    (id: string) => {
      navigate({
        pathname: buildDetailPath(id),
        search: searchParams.toString(),
      });
    },
    [buildDetailPath, navigate, searchParams],
  );

  const handleCardClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      if (meta) {
        e.preventDefault();
        selection.toggle(id);
        if (selection.has(id)) selection.setAnchor(id);
        return;
      }
      if (shift) {
        e.preventDefault();
        const anchor = selection.getAnchor() ?? id;
        selection.setRange(filteredIds, anchor, id);
        return;
      }
      if (multiSelectActive) selection.clear();
      selection.setAnchor(id);
      select(id);
    },
    [filteredIds, multiSelectActive, select],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !isInput) {
        if (filteredIds.length === 0) return;
        e.preventDefault();
        selection.set(filteredIds);
        return;
      }
      if (e.key === "Escape" && selectionSize > 0) {
        selection.clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredIds, selectionSize]);

  useEffect(() => {
    void mode;
    void sourceFilter;
    selection.clear();
  }, [mode, sourceFilter]);

  const moveToTrash = useCallback(
    async (id: string) => {
      const prev = pool.get(id);
      if (!prev) return;
      const now = Date.now();
      setBusy(id);
      try {
        await optimistic(
          () => {
            pool.upsert({ ...prev, deletedAt: now } as typeof prev);
          },
          () => {
            pool.upsert(prev);
          },
          async () =>
            window.pond.tx({
              kind: "trash",
              model: "save",
              id,
            }),
        );
        toast.add({ title: "Moved to trash", type: "success" });
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types ?? []);
    if (
      types.includes("text/uri-list") ||
      types.includes("text/plain") ||
      types.includes("Files")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      if (!dt) return;

      const files = Array.from(dt.files ?? []) as Array<
        File & { path?: string }
      >;
      const items = files
        .map((f) => ({
          path: f.path ?? "",
          name: f.name,
          type: f.type,
        }))
        .filter((it) => it.path);
      if (items.length > 0) {
        const result = (await window.pond.query("saves.dropFiles", {
          items,
        })) as { ok: boolean; ids?: string[] };
        if (result.ok && (result.ids?.length ?? 0) > 0) {
          toast.add({
            title: `Imported ${result.ids?.length} file${result.ids?.length === 1 ? "" : "s"}`,
            type: "success",
          });
        }
        return;
      }

      const uri = dt.getData("text/uri-list") || dt.getData("text/plain");
      if (uri) {
        const lines = uri
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        for (const line of lines) {
          await window.pond.query("saves.quickAdd", { url: line });
        }
        if (lines.length > 0) {
          toast.add({
            title: `Saved ${lines.length} link${lines.length === 1 ? "" : "s"}`,
            type: "success",
          });
        }
      }
    },
    [toast],
  );

  return {
    busy,
    selectionSize,
    multiSelectActive,
    handleCardClick,
    focus,
    moveToTrash,
    onDragOver,
    onDrop,
  };
}
