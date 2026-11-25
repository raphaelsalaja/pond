import { IconHeart } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { toggleFavorite } from "@/features/saves/lib/triage";
import type { Save } from "@/features/saves/types";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";

/** A click toggles without taking focus, so the list or grid that had it keeps its arrow keys. */
function keepFocus(event: React.MouseEvent) {
  event.preventDefault();
}

export function FavoriteButton({ saves }: { saves: ReadonlyArray<Save> }) {
  const favorited =
    saves.length > 0 && saves.every((save) => save.favorite === true);
  return (
    <Tooltip
      label={favorited ? "Unfavorite" : "Favorite"}
      shortcut={<ShortcutKeys id="save.favorite" />}
    >
      <Button
        type="button"
        icon
        size="xs"
        variant="ghost"
        aria-label="Favorite"
        aria-pressed={favorited}
        disabled={saves.length === 0}
        onMouseDown={keepFocus}
        onClick={() => void toggleFavorite(saves.map((save) => save.id))}
      >
        <IconHeart size={12} fill={favorited ? "currentColor" : "none"} />
      </Button>
    </Tooltip>
  );
}
