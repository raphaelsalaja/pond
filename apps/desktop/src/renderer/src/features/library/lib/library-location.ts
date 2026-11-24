import { DEFAULT_LIBRARY_NAME } from "@shared/constants";
import { notify } from "@/shared/lib/toast";

function reportFailure(
  result: { ok: boolean; reason?: string; error?: string },
  id: string,
  title: string,
  fallback: string,
): void {
  if (result.ok || result.reason === "cancelled") return;
  notify({ id, title, description: result.error ?? fallback });
}

function reportError(id: string, title: string, error: Error): void {
  notify({
    id,
    title,
    description: error.message || "Try again.",
  });
}

export async function createLibrary(): Promise<void> {
  try {
    const picked = await window.pond.query("library.pickFolder", {});
    if (!picked.ok || !picked.path) {
      return;
    }
    const result = await window.pond.query("library.createAt", {
      path: picked.path,
      name: DEFAULT_LIBRARY_NAME,
    });
    reportFailure(
      result,
      "create-library",
      "Couldn't create library",
      "Try a different folder.",
    );
  } catch (error) {
    reportError(
      "create-library",
      "Couldn't create library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}

export async function openLibrary(): Promise<void> {
  try {
    const picked = await window.pond.query("library.pickExisting", {});
    if (!picked.ok || !picked.path) {
      return;
    }
    await switchLibrary(picked.path);
  } catch (error) {
    reportError(
      "open-library",
      "Couldn't open library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}

export async function switchLibrary(path: string): Promise<void> {
  try {
    const result = await window.pond.query("library.switchTo", { path });
    reportFailure(
      result,
      "open-library",
      "Couldn't open library",
      "Pick a .pond library.",
    );
  } catch (error) {
    reportError(
      "open-library",
      "Couldn't open library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}

export async function moveLibrary(): Promise<void> {
  try {
    const result = await window.pond.query("library.move", {});
    reportFailure(
      result,
      "move-library",
      "Couldn't move the library",
      "Choose a different location.",
    );
    if (result.ok && result.sourceRemoved === false) {
      notify({
        id: "move-library-cleanup",
        title: "Library moved",
        description: `Remove the old copy at ${result.cleanupPath ?? "its previous location"}.`,
      });
    }
  } catch (error) {
    reportError(
      "move-library",
      "Couldn't move the library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}

export async function mergeLibrary(): Promise<void> {
  try {
    const result = await window.pond.query("library.mergeFrom", {});
    if (!result.ok) {
      if (result.reason === "cancelled") {
        return;
      }
      throw new Error(result.error || "Choose a different library.");
    }
    notify({
      id: "merge-library",
      title: "Library merged",
      description: `Imported ${result.imported ?? 0} Saves. Skipped ${result.skipped ?? 0}.`,
    });
  } catch (error) {
    reportError(
      "merge-library",
      "Couldn't merge the library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}

export async function backupLibrary(): Promise<void> {
  try {
    const result = await window.pond.query("library.backupTo", {});
    reportFailure(
      result,
      "backup-library",
      "Couldn't back up the library",
      "Choose a different location.",
    );
    if (result.ok) {
      notify({
        id: "backup-library",
        title: "Library backed up",
        description: result.path ?? "The backup is ready.",
      });
    }
  } catch (error) {
    reportError(
      "backup-library",
      "Couldn't back up the library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}

export async function restoreLibrary(): Promise<void> {
  try {
    const result = await window.pond.query("library.restoreBackup", {});
    reportFailure(
      result,
      "restore-library",
      "Couldn't restore the library",
      "Choose a valid Pond backup.",
    );
  } catch (error) {
    reportError(
      "restore-library",
      "Couldn't restore the library",
      error instanceof Error ? error : new Error("Try again."),
    );
  }
}
