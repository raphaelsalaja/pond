import { type ReactNode, useMemo } from "react";
import { GridView } from "@/features/library/components/layouts/grid-view";
import { JustifiedView } from "@/features/library/components/layouts/justified";
import { ListView } from "@/features/library/components/layouts/list-view";
import { WaterfallView } from "@/features/library/components/layouts/waterfall";
import type { ViewMode } from "@/features/library/types";
import { LibraryGridProvider } from "@/features/saves";
import type { Save } from "@/features/saves/types";

interface LayoutSwitcherProps {
  viewMode: ViewMode;
  saves: ReadonlyArray<Save>;
  /** Packed as their own block above `saves`, in the same collection, with `divider` between the two. */
  lead?: ReadonlyArray<Save>;
  divider?: ReactNode;
  multiSelectActive: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onPick: (id: string, e: React.MouseEvent) => void;
  onAuxClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onEndReached?: () => void;
}

export function LayoutSwitcher(props: LayoutSwitcherProps) {
  const {
    viewMode,
    saves,
    lead,
    divider,
    multiSelectActive,
    onClick,
    onPick,
    onAuxClick,
    onDoubleClick,
    onEndReached,
  } = props;

  const callbacks = useMemo(
    () => ({ onClick, onPick, onAuxClick, onDoubleClick }),
    [onClick, onPick, onAuxClick, onDoubleClick],
  );
  const sections = { saves, lead, divider, onEndReached };

  return (
    <LibraryGridProvider
      callbacks={callbacks}
      multiSelectActive={multiSelectActive}
    >
      {viewMode === "justified" ? (
        <JustifiedView {...sections} />
      ) : viewMode === "waterfall" ? (
        <WaterfallView {...sections} />
      ) : viewMode === "list" ? (
        <ListView {...sections} />
      ) : (
        <GridView {...sections} />
      )}
    </LibraryGridProvider>
  );
}
