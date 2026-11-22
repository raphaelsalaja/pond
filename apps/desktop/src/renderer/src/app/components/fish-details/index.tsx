import { useEffect, useState } from "react";
import { draftInChat, openFishChat } from "@/features/agent";
import {
  fishIdFromPath,
  useFishEditingId,
  useOpenRoutineId,
} from "@/features/fish";
import { FishProfile } from "@/features/fish/profile";
import { useFolders } from "@/features/library/state/folders";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { useTags } from "@/features/tags";
import { useRouteLocation } from "@/shared/hooks/use-route-location";

/** Keeps the last fish mounted so the column can animate closed after leaving its page. */
export function FishDetails() {
  const openId = useRouteLocation((location) =>
    fishIdFromPath(location.pathname),
  );
  const [fishId, setFishId] = useState(openId);
  if (openId && openId !== fishId) setFishId(openId);
  const editingId = useFishEditingId();
  const routineId = useOpenRoutineId(fishId);
  const folders = useFolders();
  const tags = useTags();

  useEffect(() => {
    if (editingId || routineId) libraryChrome.setDetailsOpen(true);
  }, [editingId, routineId]);

  if (!fishId) return null;
  return (
    <FishProfile
      fishId={fishId}
      folders={folders}
      tagNames={tags.map((tag) => tag.name)}
      onClose={() => libraryChrome.setDetailsOpen(false)}
      onEditRoutine={(routine) =>
        draftInChat(`Edit your routine: ${routine.name}. `)
      }
      onOpenChat={(chatId) => openFishChat(fishId, chatId)}
    />
  );
}
