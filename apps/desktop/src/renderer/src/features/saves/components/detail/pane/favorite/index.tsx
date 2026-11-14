import { IconHeart, IconHeartFill } from "@pond/icons";
import { Toggle, Tooltip } from "@pond/ui";
import { toggleFavorite } from "@/features/saves/lib/triage";
import type { Save } from "@/features/saves/types";
import { PropertyList } from "@/shared/components/property-list";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";

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
            onPressedChange={() =>
              void toggleFavorite(saves.map((save) => save.id))
            }
          >
            {favorited ? <IconHeartFill /> : <IconHeart />}
          </Toggle>
        </Tooltip>
      </PropertyList.Value>
    </PropertyList.Row>
  );
}
