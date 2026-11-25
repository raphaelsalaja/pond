interface UndoOwner {
  undo(): void;
  redo(): void;
}

let owner: UndoOwner | null = null;

/** A surface with its own edit history claims Edit > Undo while it is open; Library history resumes on release. */
export function claimUndo(next: UndoOwner): () => void {
  owner = next;
  return () => {
    if (owner === next) owner = null;
  };
}

export function currentUndoOwner(): UndoOwner | null {
  return owner;
}
