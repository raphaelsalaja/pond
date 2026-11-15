import { Button, Settings } from "@pond/ui";
import { openSettings } from "@/shared/lib/open-settings";
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
            : "No shortcut yet. Set one to open the ring from any app."}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        {keys ? null : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              openSettings("shortcuts", "setting-shortcuts-app.file-ring")
            }
          >
            Set Shortcut
          </Button>
        )}
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
