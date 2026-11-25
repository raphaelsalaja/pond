import { IconArrowDown, IconArrowUp } from "@pond/icons";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { stepSave } from "@/features/saves/lib/save-nav";
import {
  useResultIndex,
  useResultTotal,
} from "@/features/saves/state/result-navigation";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";

export function ViewerSaveNav({ saveId }: { saveId: string }) {
  const index = useResultIndex(saveId);
  const total = useResultTotal();

  if (index < 0 || total <= 0) return null;

  return (
    <>
      <ViewerHud.Tool
        label="Previous Save"
        shortcut={<ShortcutKeys id="viewer.prev-save" />}
        disabled={index <= 0}
        onClick={() => stepSave(saveId, -1)}
      >
        <IconArrowUp />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Next Save"
        shortcut={<ShortcutKeys id="viewer.next-save" />}
        disabled={index >= total - 1}
        onClick={() => stepSave(saveId, 1)}
      >
        <IconArrowDown />
      </ViewerHud.Tool>
    </>
  );
}
