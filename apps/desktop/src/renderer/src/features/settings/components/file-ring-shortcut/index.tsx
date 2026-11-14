import { Button, Settings } from "@pond/ui";
import { chordGlyphs, useShortcutBindings } from "@/shared/lib/shortcuts";

/** Opens the same ring the global shortcut does, so you can try it without leaving Settings. */
export function FileRingShortcutSetting() {
  const keys = useShortcutBindings()["app.file-ring"].keys;
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Ring Over Any App</Settings.ItemTitle>
        <Settings.ItemDescription>
          {keys
            ? `Press ${chordGlyphs(keys).join("")} in any app to open the ring at your pointer.`
            : "Set a shortcut in Shortcuts to open the ring from any app."}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void window.pond.openFileRing()}
        >
          Open Ring
        </Button>
      </Settings.ItemControl>
    </>
  );
}
