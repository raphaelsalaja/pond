import { useRef, useState } from "react";
import { tagOperations } from "@/features/tags/operations/tag-client";
import type { TagEntity } from "@/features/tags/operations/tag-operations";

interface TagCreationOperations {
  create: (kind: TagEntity, raw: string) => Promise<void>;
}

export function useTagCreation(
  operations: TagCreationOperations = tagOperations,
) {
  const [creating, setCreating] = useState<TagEntity | null>(null);
  const committed = useRef(false);

  function cancelCreate() {
    committed.current = true;
    setCreating(null);
  }

  function startCreate(kind: TagEntity) {
    committed.current = false;
    setCreating(kind);
  }

  async function saveCreate(name: string) {
    if (!creating || committed.current) return;
    committed.current = true;
    try {
      await operations.create(creating, name);
      setCreating(null);
    } catch (error) {
      committed.current = false;
      throw error;
    }
  }

  return { creating, startCreate, cancelCreate, saveCreate };
}
