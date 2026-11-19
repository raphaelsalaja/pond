import { IconHeart } from "@pond/icons";
import { Toggle, Tooltip } from "@pond/ui";
import { toggleFavorite } from "@/features/saves/lib/triage";
import type { Save } from "@/features/saves/types";
import { PropertyList } from "@/shared/components/property-list";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";

/** A click toggles without taking focus, so the list or grid that had it keeps its arrow keys. */
function keepFocus(event: React.MouseEvent) {
  event.preventDefault();
}

export function FavoriteRow({ saves }: { saves: readonly Save[] }) {
  const favorited =
    saves.length > 0 && saves.every((save) => save.favorite === true);
  const label = favorited ? "Unfavorite" : "Favorite";
  return (
    <PropertyList.Row>
      <PropertyList.Label>Favorite</PropertyList.Label>
      <PropertyList.Value>
        <Tooltip label={label} shortcut={<ShortcutKeys id="save.favorite" />}>
          <Toggle
            size="sm"
            aria-label={label}
            pressed={favorited}
            onMouseDown={keepFocus}
            onPressedChange={() =>
              void toggleFavorite(saves.map((save) => save.id))
            }
          >
            <IconHeart fill={favorited ? "currentColor" : "none"} />
          </Toggle>
        </Tooltip>
      </PropertyList.Value>
    </PropertyList.Row>
  );
}
