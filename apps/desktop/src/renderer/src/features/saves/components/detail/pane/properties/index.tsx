import { IconCopy, IconDots } from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { sensitiveContentBand } from "@pond/schema/content-safety";
import { Menu, Rating } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { ColorSwatch } from "@/features/saves/components/detail/color-swatch";
import { useSaveDetail } from "@/features/saves/hooks/use-save-detail";
import { groupDetailRows } from "@/features/saves/lib/detail";
import type { DetailRow } from "@/features/saves/lib/detail";
import {
  deriveTypeLabel,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import { sensitiveContentMenuItem } from "@/features/saves/lib/menu/sensitive";
import type { Save } from "@/features/saves/types";
import { PropertyList } from "@/shared/components/property-list";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { formatBytes } from "@/shared/lib/format";
import { DetailSection } from "../detail-section";
import { copyFact, factFilters, factMenu, ratingMenu } from "./fact-actions";
import { AuthorAvatar, ControlRow, FactRow, SourceMark } from "./fact-row";
import { buildRowMenu, primaryRowAction } from "./row-actions";
import styles from "./styles.module.css";

const METRIC_IDS = new Set([
  "views",
  "likes",
  "comments",
  "retweets",
  "quotes",
  "bookmarks",
  "shares",
]);

/** Facts that open Library filters; the other rows open profiles, accounts, or matching saves. */
const FACT_IDS = new Set([
  "type",
  "duration",
  "dimensions",
  "size",
  "container",
  "videoCodec",
  "audioCodec",
  "bitrate",
  "colorSpace",
  "taken",
  "published",
  "imported",
  "modified",
  "id",
]);

const DATE_IDS = new Set(["taken", "published", "imported", "modified"]);

/** Relies on the detail formatter joining time and day with " · ". */
function day(value: string): string {
  return value.split(" · ").at(-1) ?? value;
}

function totalSize(save: Save): number {
  return save.fileSize ?? save.files.reduce((sum, file) => sum + file.size, 0);
}

function propertyRows(rows: Array<DetailRow>, save: Save): Array<DetailRow> {
  const out = rows.flatMap((row): Array<DetailRow> => {
    if (row.id === "type" || row.id === "size") {
      return [];
    }
    if (METRIC_IDS.has(row.id) && row.value.trim() === "0") {
      return [];
    }
    if (row.id === "imported") {
      return [{ ...row, label: "Added" }];
    }
    return [row];
  });
  out.push({
    id: "type",
    label: "Type",
    value: deriveTypeLabel(pickPrimaryFile(save), save) ?? "File",
    kind: "text",
  });
  const size = totalSize(save);
  if (size) {
    out.push({
      id: "size",
      label: "Size",
      value: formatBytes(size),
      kind: "text",
    });
  }
  const added = out.find((row) => row.id === "imported");
  return out.filter(
    (row) =>
      row.id !== "modified" || !added || day(row.value) !== day(added.value),
  );
}

const GROUP_TITLES = new Map([
  ["Origin", "Source"],
  ["File", "Metadata"],
]);

interface MenuEntry {
  label: string;
  value: string;
  items: () => Array<MenuItemSpec>;
}

function groupMenu(
  title: string,
  entries: ReadonlyArray<MenuEntry>,
): Array<MenuItemSpec> {
  const text = entries
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join("\n");
  return [
    {
      label: `Copy ${title}`,
      icon: <IconCopy />,
      onClick: () => copyFact(title, text),
    },
    { type: "separator" },
    ...entries.flatMap((entry): Array<MenuItemSpec> => {
      const items = entry.items();
      const actions = items.filter((item) => item.type !== "separator");
      if (actions.length === 0) return [];
      if (actions.length === 1) return actions;
      return [{ type: "submenu", label: entry.label, items }];
    }),
  ];
}

function Group({
  label,
  entries,
  children,
}: {
  label: string;
  entries: ReadonlyArray<MenuEntry>;
  children: React.ReactNode;
}) {
  const title = GROUP_TITLES.get(label) ?? label;
  return (
    <DetailSection
      title={title}
      action={
        <SpecMenu buildItems={() => groupMenu(title, entries)} align="end">
          <Menu.Trigger
            icon
            size="xs"
            variant="ghost"
            aria-label={`${title} Actions`}
          >
            <IconDots size={12} />
          </Menu.Trigger>
        </SpecMenu>
      }
    >
      <div className={styles.card}>
        <PropertyList.Root>{children}</PropertyList.Root>
      </div>
    </DetailSection>
  );
}

function rowDisplay(row: DetailRow): string {
  return DATE_IDS.has(row.id) ? day(row.value) : row.value;
}

function rowMenu(row: DetailRow, save: Save): Array<MenuItemSpec> {
  if (!FACT_IDS.has(row.id)) {
    return buildRowMenu(row, save);
  }
  const filters = factFilters({ ...row, display: rowDisplay(row) }, save);
  return factMenu(row.label, row.value, filters);
}

function ratingEntry(
  rating: number | null,
  onRate: (rating: number) => void,
): Array<MenuEntry> {
  if (rating === null) {
    return [];
  }
  return [
    {
      label: "Rating",
      value: rating ? `${rating} of 5` : "Not Rated",
      items: () => ratingMenu(rating, onRate),
    },
  ];
}

/** `null` is a mixed value, such as several saves with different ratings. */
function RatingRow({
  rating,
  onRate,
}: {
  rating: number | null;
  onRate: (rating: number) => void;
}) {
  return (
    <ControlRow
      label="Rating"
      menu={rating === null ? undefined : () => ratingMenu(rating, onRate)}
    >
      <Rating size="sm" value={rating} onValueChange={onRate} />
    </ControlRow>
  );
}

function Row({
  row,
  save,
  avatarUrl,
  sourceLogo,
  SourceIcon,
}: {
  row: DetailRow;
  save: Save;
  avatarUrl: string | null;
  sourceLogo: string | null;
  SourceIcon: IconComponent | null;
}) {
  const display = rowDisplay(row);
  const icon =
    row.kind === "author" || row.kind === "account" ? (
      <AuthorAvatar
        name={row.value}
        avatarUrl={row.kind === "author" ? avatarUrl : (row.avatarUrl ?? null)}
      />
    ) : row.kind === "platform" ? (
      <SourceMark logo={sourceLogo} Icon={SourceIcon} />
    ) : undefined;

  if (FACT_IDS.has(row.id)) {
    return (
      <FactRow
        label={row.label}
        title={row.value}
        menu={() => rowMenu(row, save)}
      >
        {display}
      </FactRow>
    );
  }
  const action = primaryRowAction(row, save);
  return (
    <FactRow
      label={row.label}
      icon={icon}
      title={row.value}
      onClick={action?.run}
      menu={() => rowMenu(row, save)}
    >
      {display}
    </FactRow>
  );
}

interface RatingProps {
  /** `null` is a mixed value, such as several saves with different ratings. */
  rating: number | null;
  onRate: (rating: number) => void;
}

function SaveGroups({ save, rating, onRate }: RatingProps & { save: Save }) {
  const { rows, avatarUrl, sourceLogo, sourceIcon } = useSaveDetail(save.id);
  const sensitivity = sensitiveContentBand(save.sensitiveScore);
  const sensitive =
    sensitivity === "likely-sensitive" || sensitivity === "possible-sensitive";
  const colors = save.dominantColors?.slice(0, 8) ?? [];
  const sensitivityLabel =
    sensitivity === "likely-sensitive"
      ? "Likely Sensitive"
      : "Possibly Sensitive";
  const sensitivityMenu = (): Array<MenuItemSpec> => [
    sensitiveContentMenuItem({
      ids: [save.id],
      saves: [save],
      allTrashed: save.deletedAt !== null && save.deletedAt !== undefined,
    }),
  ];
  const entriesFor = (
    title: string,
    groupRows: Array<DetailRow>,
  ): Array<MenuEntry> => [
    ...(title === "File" ? ratingEntry(rating, onRate) : []),
    ...groupRows.map((row) => ({
      label: row.label,
      value: rowDisplay(row),
      items: () => rowMenu(row, save),
    })),
    ...(title === "File" && sensitive
      ? [
          {
            label: "Sensitivity",
            value: sensitivityLabel,
            items: sensitivityMenu,
          },
        ]
      : []),
  ];

  return groupDetailRows(propertyRows(rows, save)).map((group) => (
    <Group
      key={group.title}
      label={group.title}
      entries={entriesFor(group.title, group.rows)}
    >
      {group.title === "File" ? (
        <RatingRow rating={rating} onRate={onRate} />
      ) : null}
      {group.rows.map((row) => (
        <Row
          key={row.id}
          row={row}
          save={save}
          avatarUrl={avatarUrl}
          sourceLogo={sourceLogo}
          SourceIcon={sourceIcon}
        />
      ))}
      {group.title === "File" && sensitive ? (
        <FactRow label="Sensitivity" menu={sensitivityMenu}>
          {sensitivityLabel}
        </FactRow>
      ) : null}
      {group.title === "File" && colors.length ? (
        <ControlRow label="Colors">
          <span className={styles.colors}>
            {colors.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                primaryColor={save.primaryColor ?? null}
                saveId={save.id}
              />
            ))}
          </span>
        </ControlRow>
      ) : null}
    </Group>
  ));
}

function SelectionGroups({
  saves,
  rating,
  onRate,
}: RatingProps & { saves: ReadonlyArray<Save> }) {
  const size = formatBytes(
    saves.reduce((total, save) => total + totalSize(save), 0),
  );
  const sizeMenu = (): Array<MenuItemSpec> => [
    {
      label: "Copy Size",
      icon: <IconCopy />,
      onClick: () => copyFact("Size", size),
    },
  ];
  return (
    <Group
      label="File"
      entries={[
        ...ratingEntry(rating, onRate),
        { label: "Size", value: size, items: sizeMenu },
      ]}
    >
      <RatingRow rating={rating} onRate={onRate} />
      <FactRow label="Size" menu={sizeMenu}>
        {size}
      </FactRow>
    </Group>
  );
}

export function SaveProperties({
  saves,
  ...rating
}: RatingProps & { saves: ReadonlyArray<Save> }) {
  const single = saves.length === 1 ? saves[0] : undefined;
  return single ? (
    <SaveGroups save={single} {...rating} />
  ) : (
    <SelectionGroups saves={saves} {...rating} />
  );
}
