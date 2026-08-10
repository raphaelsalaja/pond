import { useMemo } from "react";
import { GridView } from "@/components/library/layouts/grid-view";
import { JustifiedView } from "@/components/library/layouts/justified";
import { WaterfallView } from "@/components/library/layouts/waterfall";
import { LibraryGridProvider } from "@/components/shared/grid-context";
import type { Save, ViewMode } from "@/lib/types";

interface LayoutSwitcherProps {
  viewMode: ViewMode;
  saves: ReadonlyArray<Save>;
  multiSelectActive: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onAuxClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onEndReached?: () => void;
}

export function LayoutSwitcher(props: LayoutSwitcherProps) {
  const {
    viewMode,
    saves,
    multiSelectActive,
    onClick,
    onAuxClick,
    onDoubleClick,
    onEndReached,
  } = props;

  const callbacks = useMemo(
    () => ({ onClick, onAuxClick, onDoubleClick }),
    [onClick, onAuxClick, onDoubleClick],
  );

  return (
    <LibraryGridProvider
      callbacks={callbacks}
      multiSelectActive={multiSelectActive}
    >
      {viewMode === "justified" ? (
        <JustifiedView saves={saves} onEndReached={onEndReached} />
      ) : viewMode === "waterfall" ? (
        <WaterfallView saves={saves} onEndReached={onEndReached} />
      ) : (
        <GridView saves={saves} onEndReached={onEndReached} />
      )}
    </LibraryGridProvider>
  );
}
