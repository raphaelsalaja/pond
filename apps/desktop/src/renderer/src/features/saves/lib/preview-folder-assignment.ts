import {
  type SaveFolderReference,
  saveLibraryBridge,
} from "@/features/saves/lib/library-bridge";
import {
  notify,
  TOAST_TIMEOUT_MS,
  toastManager,
  updateNotification,
} from "@/shared/lib/toast";

interface FolderAssignment {
  saveIds: readonly string[];
  addIds: readonly string[];
  removeIds: readonly string[];
}

interface PreviewFolderAssignment extends FolderAssignment {
  title: string;
}

interface UndoablePreviewFolderAssignment extends PreviewFolderAssignment {
  memberships: ReadonlyMap<string, ReadonlySet<string>>;
}

let activeToastId: string | null = null;

function snapshotMemberships(
  saveIds: readonly string[],
  memberships: readonly { saveId: string; folderId: string }[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const selected = new Set(saveIds);
  const result = new Map<string, Set<string>>(
    saveIds.map((saveId) => [saveId, new Set<string>()]),
  );
  for (const membership of memberships) {
    if (!selected.has(membership.saveId)) continue;
    result.get(membership.saveId)?.add(membership.folderId);
  }
  return result;
}

async function applyAssignment(input: FolderAssignment): Promise<void> {
  if (input.saveIds.length === 0) return;
  await window.pond.query("folders.assign", {
    saveIds: [...input.saveIds],
    addIds: [...input.addIds],
    removeIds: [...input.removeIds],
  });
  if (input.addIds.length)
    saveLibraryBridge.rememberFolderDestinations([...input.addIds]);
  await saveLibraryBridge.refreshFolders();
}

function inverseAssignments(
  input: UndoablePreviewFolderAssignment,
): FolderAssignment[] {
  const grouped = new Map<string, FolderAssignment>();
  for (const saveId of input.saveIds) {
    const before = input.memberships.get(saveId) ?? new Set<string>();
    const addIds = input.removeIds.filter((folderId) => before.has(folderId));
    const removeIds = input.addIds.filter((folderId) => !before.has(folderId));
    if (!addIds.length && !removeIds.length) continue;
    const key = JSON.stringify({ addIds, removeIds });
    const group = grouped.get(key);
    if (group) group.saveIds = [...group.saveIds, saveId];
    else grouped.set(key, { saveIds: [saveId], addIds, removeIds });
  }
  return [...grouped.values()];
}

function updateAction(input: {
  id: string;
  title: string;
  label: string;
  disabled?: boolean;
  onClick(): void;
}): void {
  updateNotification({
    id: input.id,
    title: input.title,
    timeout: TOAST_TIMEOUT_MS,
    action: {
      label: input.label,
      disabled: input.disabled,
      onClick: input.onClick,
    },
  });
}

function notifyUndoableAssignment(
  input: UndoablePreviewFolderAssignment,
): void {
  if (activeToastId) toastManager.close(activeToastId);
  let busy = false;
  const toastId = notify({
    id: "preview-folder-assignment",
    title: input.title,
    timeout: TOAST_TIMEOUT_MS,
    action: { label: "Undo", onClick: undo },
  });
  activeToastId = toastId;

  function isActive() {
    return activeToastId === toastId;
  }

  async function undoAssignment() {
    const changes = inverseAssignments(input);
    for (const change of changes) await applyAssignment(change);
  }

  async function redoAssignment() {
    await applyAssignment(input);
  }

  function undo() {
    if (busy || !isActive()) return;
    busy = true;
    updateAction({
      id: toastId,
      title: input.title,
      label: "Undo",
      disabled: true,
      onClick: undo,
    });
    void undoAssignment().then(
      () => {
        busy = false;
        if (!isActive()) return;
        updateAction({
          id: toastId,
          title: "Assignment undone",
          label: "Redo",
          onClick: redo,
        });
      },
      () => {
        busy = false;
        if (!isActive()) return;
        updateAction({
          id: toastId,
          title: "Couldn't undo folder assignment",
          label: "Undo",
          onClick: undo,
        });
      },
    );
  }

  function redo() {
    if (busy || !isActive()) return;
    busy = true;
    updateAction({
      id: toastId,
      title: "Assignment undone",
      label: "Redo",
      disabled: true,
      onClick: redo,
    });
    void redoAssignment().then(
      () => {
        busy = false;
        if (!isActive()) return;
        updateAction({
          id: toastId,
          title: input.title,
          label: "Undo",
          onClick: undo,
        });
      },
      () => {
        busy = false;
        if (!isActive()) return;
        updateAction({
          id: toastId,
          title: "Couldn't redo folder assignment",
          label: "Redo",
          onClick: redo,
        });
      },
    );
  }
}

export async function assignPreviewFolders(
  input: PreviewFolderAssignment,
): Promise<void> {
  const memberships = await window.pond.query("folders.memberships", {});
  const assignment: UndoablePreviewFolderAssignment = {
    ...input,
    memberships: snapshotMemberships(input.saveIds, memberships ?? []),
  };
  await applyAssignment(assignment);
  notifyUndoableAssignment(assignment);
}

export function folderAssignmentTitle(input: {
  addIds: readonly string[];
  removeIds: readonly string[];
  folders: readonly SaveFolderReference[];
}): string {
  const folderNames = new Map(
    input.folders.map((folder) => [folder.id, folder.name]),
  );
  const ids = input.addIds.length ? input.addIds : input.removeIds;
  const preposition = input.addIds.length ? "to" : "from";
  if (ids.length === 1)
    return `${input.addIds.length ? "Added" : "Removed"} ${preposition} ${folderNames.get(ids[0] ?? "") ?? "folder"}`;
  return `${input.addIds.length ? "Added" : "Removed"} ${preposition} ${ids.length} folders`;
}
