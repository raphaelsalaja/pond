import {
  IconArrowDiagonalIn,
  IconArrowsExpand,
  IconAscendingSorting,
  IconBulletList,
  IconCircleInfo,
  IconDescendingSorting,
  IconFile,
  IconFolderTree,
  IconGlobe,
  IconGrid,
  IconGridLayoutCols,
  IconGridLayoutRows,
  IconSidebarLeft,
  IconText,
} from "@pond/icons";
import { Input, Select, Toggle, ToggleGroup, Tooltip } from "@pond/ui";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  setLibrarySaveGap,
  useLibrarySaveGap,
} from "@/features/library/components/layouts/save-gap";
import type { SortDir } from "@/features/library/hooks/use-filtered-saves";
import { useView } from "@/features/library/hooks/use-view";
import type { LayoutValue } from "@/features/library/lib/view-prefs";
import {
  libraryChrome,
  useSidebarOpen,
} from "@/features/library/state/library-chrome";
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
import { SORT_OPTIONS } from "../sort";
import styles from "./styles.module.css";

interface IconOption<Value extends string> {
  value: Value;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}

const LAYOUT_OPTIONS: Array<IconOption<LayoutValue>> = [
  {
    value: "waterfall",
    label: "Waterfall",
    icon: <IconGridLayoutCols size={14} />,
  },
  { value: "grid", label: "Grid", icon: <IconGrid size={14} /> },
  {
    value: "justified",
    label: "Justified",
    icon: <IconGridLayoutRows size={14} />,
  },
  { value: "list", label: "List", icon: <IconBulletList size={14} /> },
];

type CardDetail = "name" | "info" | "extension" | "source";

type Panel = "subfolders" | "sidebar";

const CARD_DETAIL_OPTIONS: Array<IconOption<CardDetail>> = [
  { value: "name", label: "Show Name", icon: <IconText size={14} /> },
  {
    value: "info",
    label: "Show Item Info",
    icon: <IconCircleInfo size={14} />,
  },
  { value: "extension", label: "Show Extension", icon: <IconFile size={14} /> },
  { value: "source", label: "Show Source Tag", icon: <IconGlobe size={14} /> },
];

const QUALITY_OPTIONS: Array<{
  value: "fast" | "balanced" | "quality";
  label: string;
}> = [
  { value: "fast", label: "Speed" },
  { value: "balanced", label: "Balanced" },
  { value: "quality", label: "Quality" },
];

const INFO_OPTIONS: Array<{ value: ItemInfoField; label: string }> = [
  { value: "dimensions", label: "Dimensions" },
  { value: "fileSize", label: "File Size" },
  { value: "tags", label: "Tags" },
  { value: "rating", label: "Rating" },
  { value: "modified", label: "Date Modified" },
  { value: "created", label: "Date Created" },
  { value: "published", label: "Date Published" },
];

const DIRECTION_OPTIONS: Array<IconOption<SortDir>> = [
  {
    value: "asc",
    label: "Ascending",
    icon: <IconAscendingSorting size={14} />,
  },
  {
    value: "desc",
    label: "Descending",
    icon: <IconDescendingSorting size={14} />,
  },
];

const FIT_OPTIONS: Array<IconOption<"fit" | "fill">> = [
  { value: "fit", label: "Fit", icon: <IconArrowDiagonalIn size={14} /> },
  { value: "fill", label: "Fill", icon: <IconArrowsExpand size={14} /> },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 className={styles.title} id={titleId}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function SegmentedProperty<Value extends string>({
  label,
  options,
  value,
  multiple,
  onValueChange,
}: {
  label: string;
  options: ReadonlyArray<IconOption<Value>>;
  value: ReadonlyArray<Value>;
  multiple?: boolean;
  onValueChange: (value: Value[]) => void;
}) {
  const labelId = useId();

  return (
    <div className={styles.property}>
      <span className={styles.label} id={labelId}>
        {label}
      </span>
      <ToggleGroup
        variant="outline"
        className={styles.segmented}
        aria-labelledby={labelId}
        multiple={multiple}
        value={[...value]}
        onValueChange={(next) =>
          onValueChange(
            options
              .map((option) => option.value)
              .filter((option) => next.includes(option)),
          )
        }
      >
        {options.map((option) => (
          <Tooltip key={option.value} label={option.label} side="bottom">
            <Toggle
              type="button"
              value={option.value}
              disabled={option.disabled}
              aria-label={option.label}
            >
              {option.icon}
            </Toggle>
          </Tooltip>
        ))}
      </ToggleGroup>
    </div>
  );
}

function NumericProperty({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  function commitDraft() {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(0, parsed);
    setDraft(String(next));
    onValueChange(next);
  }

  return (
    <div className={styles.property}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <Input.Root size="sm" variant="primary" className={styles.field}>
        <Input.Field
          id={fieldId}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={draft}
          aria-label={`${label} value`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing)
              event.currentTarget.blur();
            if (event.key === "Escape" && draft !== String(value)) {
              event.stopPropagation();
              setDraft(String(value));
            }
          }}
        />
        <Input.Suffix>px</Input.Suffix>
      </Input.Root>
    </div>
  );
}

function SelectProperty<Value extends string>({
  label,
  items,
  value,
  onValueChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onValueChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next);
        if (match) onValueChange(match.value);
      }}
    >
      <div className={styles.property}>
        <Select.Label className={styles.label}>{label}</Select.Label>
        <Select.Trigger size="sm" width="full" className={styles.select}>
          <Select.Value />
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Positioner align="end" sideOffset={6}>
          <Select.Popup>
            <Select.Items items={[...items]} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function LayoutSection() {
  const { state, actions } = useView();
  const gap = useLibrarySaveGap();

  return (
    <Section title="Layout">
      <SegmentedProperty
        label="View"
        options={LAYOUT_OPTIONS}
        value={[state.layout]}
        onValueChange={([next]) => {
          if (next) actions.setLayout(next);
        }}
      />
      <NumericProperty
        label="Size"
        value={state.zoom}
        onValueChange={actions.setZoom}
      />
      <NumericProperty
        label="Gap"
        value={gap}
        onValueChange={setLibrarySaveGap}
      />
    </Section>
  );
}

function DisplaySection() {
  const { state, actions } = useView();
  const [viewer, patchViewer] = usePrefs("viewer");
  const listColumns = useListColumns();
  const itemInfo = useItemInfo();
  const list = state.layout === "list";
  const shown = {
    name: list ? listColumns.name : state.displayPrefs.name,
    info: itemInfo.visible,
    extension: state.displayPrefs.type,
    source: state.displayPrefs.source,
  } satisfies Record<CardDetail, boolean>;

  function setShown(detail: CardDetail, on: boolean) {
    if (detail === "name") {
      if (list) setListColumn("name", on);
      else actions.setDisplayPref("name", on);
    } else if (detail === "info") setItemInfoVisible(on);
    else if (detail === "extension") actions.setDisplayPref("type", on);
    else actions.setDisplayPref("source", on);
  }

  return (
    <Section title="Display">
      <SegmentedProperty
        label="Show"
        multiple
        options={CARD_DETAIL_OPTIONS}
        value={CARD_DETAIL_OPTIONS.filter((option) => shown[option.value]).map(
          (option) => option.value,
        )}
        onValueChange={(next) => {
          for (const option of CARD_DETAIL_OPTIONS) {
            const on = next.includes(option.value);
            if (on !== shown[option.value]) setShown(option.value, on);
          }
        }}
      />
      <SelectProperty
        label="Quality"
        items={QUALITY_OPTIONS}
        value={viewer.thumbnailQuality}
        onValueChange={(value) => {
          void patchViewer({ thumbnailQuality: value });
        }}
      />
      <SelectProperty
        label="Item Info"
        items={INFO_OPTIONS}
        value={itemInfo.field}
        onValueChange={setItemInfoField}
      />
    </Section>
  );
}

function SortingSection() {
  const { state, actions } = useView();

  return (
    <Section title="Sorting">
      <SegmentedProperty
        label="Direction"
        options={DIRECTION_OPTIONS}
        value={[state.sort.dir]}
        onValueChange={([dir]) => {
          if (dir) actions.setSort({ key: state.sort.key, dir });
        }}
      />
      <SelectProperty
        label="Sort"
        items={SORT_OPTIONS}
        value={state.sort.key}
        onValueChange={(key) => actions.setSort({ key, dir: state.sort.dir })}
      />
    </Section>
  );
}

function ThumbnailSection() {
  const [viewer, patchViewer] = usePrefs("viewer");
  const includeSubfolders = useIncludeSubfolders();
  const sidebarOpen = useSidebarOpen();
  const panels = {
    subfolders: includeSubfolders,
    sidebar: sidebarOpen,
  } satisfies Record<Panel, boolean>;
  const panelOptions: Array<IconOption<Panel>> = [
    {
      value: "subfolders",
      label: "Show Subfolder Contents",
      icon: <IconFolderTree size={14} />,
    },
    {
      value: "sidebar",
      label: "Show Sidebar",
      icon: <IconSidebarLeft size={14} />,
    },
  ];

  function setPanel(panel: Panel, on: boolean) {
    if (panel === "subfolders") setIncludeSubfolders(on);
    else libraryChrome.toggleSidebar();
  }

  return (
    <Section title="Thumbnail">
      <SegmentedProperty
        label="Fit"
        options={FIT_OPTIONS}
        value={[viewer.galleryFit]}
        onValueChange={([galleryFit]) => {
          if (galleryFit) void patchViewer({ galleryFit });
        }}
      />
      <SegmentedProperty
        label="Show"
        multiple
        options={panelOptions}
        value={panelOptions
          .filter((option) => panels[option.value])
          .map((option) => option.value)}
        onValueChange={(next) => {
          for (const option of panelOptions) {
            const on = next.includes(option.value);
            if (on !== panels[option.value]) setPanel(option.value, on);
          }
        }}
      />
    </Section>
  );
}

export function ViewOptions() {
  return (
    <div className={styles.panel}>
      <LayoutSection />
      <DisplaySection />
      <SortingSection />
      <ThumbnailSection />
    </div>
  );
}
