import { IconCanvas, IconPencil, IconPlus, IconTrash } from "@pond/icons";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import type { CanvasSummary } from "@shared/canvas-contracts";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { canvases } from "../state/canvases";
import { folderSavesNotice, planFolderSaves } from "./from-folder";

export async function runCanvasAction(
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    notify({
      id: "canvas-action",
      title: "Couldn't update the canvas",
      description: errorCopy(error, "Try again."),
    });
  }
}

export function createCanvas(saveIds: readonly string[] = []): void {
  void runCanvasAction(async () => {
    await canvases.create(saveIds);
  });
}

export function addSavesToCanvas(
  canvasId: string,
  saveIds: readonly string[],
): void {
  void runCanvasAction(async () => {
    await canvases.addSaves(canvasId, saveIds);
    if (canvases.isOpen(canvasId)) return;
    const canvas = canvases.snapshot().find((entry) => entry.id === canvasId);
    notify({
      id: "canvas-add-saves",
      title: canvas ? `Added to "${canvas.name}"` : "Added to canvas",
      action: { label: "Open", onClick: () => canvases.open(canvasId) },
    });
  });
}

export function createCanvasFromFolder(
  name: string,
  saveIds: readonly string[],
): Promise<void> {
  const plan = planFolderSaves(saveIds);
  return runCanvasAction(async () => {
    const canvas = await canvases.create(plan.saveIds, name.slice(0, 200));
    if (plan.overflow)
      notify({
        id: "canvas-from-folder",
        ...folderSavesNotice(canvas.name, plan),
      });
  });
}

export function addFolderSavesToCanvas(
  canvasId: string,
  saveIds: readonly string[],
): Promise<void> {
  const canvas = canvases.snapshot().find((entry) => entry.id === canvasId);
  if (!canvas) return Promise.resolve();
  const plan = planFolderSaves(saveIds, canvas);
  return runCanvasAction(async () => {
    await canvases.addSaves(canvasId, plan.saveIds, "beside");
    notify({
      id: "canvas-add-saves",
      ...folderSavesNotice(canvas.name, plan),
      action: canvases.isOpen(canvasId)
        ? undefined
        : { label: "Open", onClick: () => canvases.open(canvasId) },
    });
  });
}

function confirmDeleteCanvas(canvas: CanvasSummary): void {
  Dialog.confirm({
    title: `Delete "${canvas.name}"`,
    description:
      "The canvas, its notes, and its drawings are deleted. The Saves on it stay in your Library.",
    confirmLabel: "Delete",
    confirmVariant: "destructive",
    onConfirm: () => runCanvasAction(() => canvases.remove(canvas.id)),
  });
}

export function sectionItems(): MenuItemSpec[] {
  return [
    {
      label: "New Canvas",
      icon: <IconPlus />,
      onClick: () => createCanvas(),
    },
  ];
}

export function canvasItems(canvas: CanvasSummary): MenuItemSpec[] {
  return [
    {
      label: "Open",
      icon: <IconCanvas />,
      onClick: () => canvases.open(canvas.id),
    },
    {
      label: "Rename",
      icon: <IconPencil />,
      onClick: () => canvases.startEditing(canvas.id),
    },
    { type: "separator" },
    {
      label: "New Canvas",
      icon: <IconPlus />,
      onClick: () => createCanvas(),
    },
    { type: "separator" },
    {
      label: "Delete Canvas",
      icon: <IconTrash />,
      variant: "destructive",
      onClick: () => confirmDeleteCanvas(canvas),
    },
  ];
}
