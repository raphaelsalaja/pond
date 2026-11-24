import {
  setLibrarySaveGap,
  useLibrarySaveGap,
} from "@/features/library/components/layouts/save-gap";
import {
  setLibrarySaveRadius,
  useLibrarySaveRadius,
} from "@/features/library/components/layouts/save-radius";
import type { SortDir } from "@/features/library/hooks/use-filtered-saves";
import { type SortKey, useView } from "@/features/library/hooks/use-view";
import {
  setIncludeSubfolders,
  useIncludeSubfolders,
} from "@/features/library/state/view-store";
import {
  type ItemInfoField,
  setItemInfoField,
  setItemInfoVisible,
  setListColumn,
  useItemInfo,
  useListColumns,
} from "@/features/saves";
import { usePrefs } from "@/shared/state/prefs";
import {
  type CardDetail,
  type Fit,
  PRESETS,
  type Preset,
  type Quality,
} from "./options";

export function useViewOptions() {
  const { state, actions } = useView();
  const gap = useLibrarySaveGap();
  const rounding = useLibrarySaveRadius();
  const [viewer, patchViewer] = usePrefs("viewer");
  const listColumns = useListColumns();
  const itemInfo = useItemInfo();
  const subfolders = useIncludeSubfolders();
  const list = state.layout === "list";

  const details: Record<CardDetail, boolean> = {
    name: list ? listColumns.name : state.displayPrefs.name,
    info: itemInfo.visible,
    extension: state.displayPrefs.type,
    source: state.displayPrefs.source,
    count: state.displayPrefs.fileCount,
  };

  function writeDetail(detail: CardDetail, on: boolean, inList: boolean) {
    if (detail === "name") {
      if (inList) setListColumn("name", on);
      else actions.setDisplayPref("name", on);
    } else if (detail === "info") setItemInfoVisible(on);
    else if (detail === "extension") actions.setDisplayPref("type", on);
    else if (detail === "count") actions.setDisplayPref("fileCount", on);
    else actions.setDisplayPref("source", on);
  }

  function setDetail(detail: CardDetail, on: boolean) {
    writeDetail(detail, on, list);
  }

  function applyPreset(preset: Preset) {
    actions.setLayout(preset.layout);
    if (preset.size !== undefined) actions.setZoom(preset.size);
    if (preset.gap !== undefined) setLibrarySaveGap(preset.gap);
    setLibrarySaveRadius(preset.rounding);
    if (preset.fit !== viewer.galleryFit) {
      void patchViewer({ galleryFit: preset.fit });
    }
    const inList = preset.layout === "list";
    for (const [detail, on] of Object.entries(preset.details)) {
      writeDetail(detail as CardDetail, on, inList);
    }
    if (preset.infoField) setItemInfoField(preset.infoField);
  }

  const active = PRESETS.find(
    (preset) =>
      preset.layout === state.layout &&
      (preset.size === undefined || preset.size === state.zoom) &&
      (preset.gap === undefined || preset.gap === gap) &&
      preset.rounding === rounding &&
      preset.fit === viewer.galleryFit &&
      (Object.keys(preset.details) as CardDetail[]).every(
        (detail) => preset.details[detail] === details[detail],
      ) &&
      (!preset.infoField || preset.infoField === itemInfo.field),
  )?.value;

  return {
    layout: state.layout,
    setLayout: actions.setLayout,
    size: state.zoom,
    setSize: actions.setZoom,
    gap,
    setGap: setLibrarySaveGap,
    rounding,
    setRounding: setLibrarySaveRadius,
    details,
    setDetail,
    infoField: itemInfo.field,
    setInfoField: (field: ItemInfoField) => setItemInfoField(field),
    quality: viewer.thumbnailQuality,
    setQuality: (thumbnailQuality: Quality) => {
      void patchViewer({ thumbnailQuality });
    },
    fit: viewer.galleryFit,
    setFit: (galleryFit: Fit) => {
      void patchViewer({ galleryFit });
    },
    sortKey: state.sort.key,
    sortDir: state.sort.dir,
    setSortKey: (key: SortKey) => actions.setSort({ key, dir: state.sort.dir }),
    setSortDir: (dir: SortDir) => actions.setSort({ key: state.sort.key, dir }),
    subfolders,
    setSubfolders: setIncludeSubfolders,
    preset: active,
    applyPreset,
  };
}
