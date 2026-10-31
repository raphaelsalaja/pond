import type { IconComponent } from "@pond/icons/types";
import { type ReactNode, useState } from "react";
import { ColorSwatch } from "@/features/saves/components/detail/color-swatch";
import { useSaveDetail } from "@/features/saves/hooks/use-save-detail";
import {
  type DetailGroup,
  type DetailRow,
  groupDetailRows,
} from "@/features/saves/lib/detail";
import { pickAuthorColor } from "@/features/saves/lib/presentation";
import type { Save } from "@/features/saves/types";
import { Section } from "@/shared/components/inspector-section";
import { PropertyList } from "@/shared/components/property-list";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { initials } from "@/shared/lib/initials";
import { buildRowMenu, primaryRowAction } from "./row-actions";
import styles from "./styles.module.css";

const SKELETON_ROWS = ["first", "second", "third", "fourth"] as const;

const MERGED_INTO_PROPERTIES = new Set(["Properties", "File", "Dates"]);

function layoutFor(title: string): "list" | "tiles" | "grid" {
  if (title === "Properties" || title === "Activity") return "grid";
  return title === "Source" ? "list" : "tiles";
}

interface SaveInfoSectionsProps {
  save: Save;
  pending?: boolean;
  hideActivity?: boolean;
  hideCoreProperties?: boolean;
  /** The caller passes its own file and date rows in `propertiesLead`, and Properties also takes the source rows. */
  omitFileAndDates?: boolean;
  propertiesLead?: ReactNode;
  sourceLead?: ReactNode;
}

export function SaveInfoSections({
  save,
  pending,
  hideActivity,
  hideCoreProperties,
  omitFileAndDates,
  propertiesLead,
  sourceLead,
}: SaveInfoSectionsProps) {
  const {
    rows,
    colors,
    avatarUrl,
    sourceLogo,
    sourceIcon: SourceIcon,
  } = useSaveDetail(save.id);
  const coreIds = new Set(["type", "dimensions", "size"]);
  const grouped = groupDetailRows(
    hideCoreProperties ? rows.filter((row) => !coreIds.has(row.id)) : rows,
  ).filter((group) => !hideActivity || group.title !== "Activity");
  const groups = omitFileAndDates
    ? [
        {
          title: "Properties",
          rows:
            grouped.find((group) => group.title === "Properties")?.rows ?? [],
        },
        ...grouped.filter((group) => !MERGED_INTO_PROPERTIES.has(group.title)),
      ]
    : grouped.map((group) =>
        hideCoreProperties && group.title === "Properties"
          ? { ...group, title: "Source" }
          : group,
      );
  const renderedTitles = new Set(groups.map((group) => group.title));

  return (
    <>
      {pending ? (
        <span className={styles["sr-only"]} role="status">
          Loading save details
        </span>
      ) : null}
      {groups.map((group) => (
        <InfoSection
          key={group.title}
          group={group}
          save={save}
          colors={hideCoreProperties ? [] : colors}
          primaryColor={save.primaryColor ?? null}
          saveId={save.id}
          avatarUrl={avatarUrl}
          sourceLogo={sourceLogo}
          SourceIcon={SourceIcon}
          placeholders={pending ? placeholderCount(group) : 0}
          lead={
            group.title === "Properties"
              ? propertiesLead
              : group.title === "Source"
                ? sourceLead
                : undefined
          }
        />
      ))}
      {pending && !renderedTitles.has("Properties") ? (
        <SkeletonSection title="Properties" rows={4} />
      ) : null}
      {pending && !renderedTitles.has("File") ? (
        <SkeletonSection title="File" rows={3} defaultOpen={false} />
      ) : null}
      {pending && !renderedTitles.has("Dates") ? (
        <SkeletonSection title="Dates" rows={2} defaultOpen={false} />
      ) : null}
      {!hideCoreProperties &&
      !renderedTitles.has("Properties") &&
      colors.length > 0 ? (
        <Section title="Properties">
          <PropertyList.Root layout="grid">
            <PropertyColors
              colors={hideCoreProperties ? [] : colors}
              primaryColor={save.primaryColor ?? null}
              saveId={save.id}
            />
          </PropertyList.Root>
        </Section>
      ) : null}
    </>
  );
}

function placeholderCount(group: DetailGroup): number {
  if (group.title === "Properties") return Math.max(0, 4 - group.rows.length);
  if (group.title === "File") return Math.max(0, 3 - group.rows.length);
  return 0;
}

function InfoSection({
  group,
  save,
  colors,
  primaryColor,
  saveId,
  avatarUrl,
  sourceLogo,
  SourceIcon,
  placeholders,
  lead,
}: {
  group: DetailGroup;
  save: Save;
  colors: string[];
  primaryColor: string | null;
  saveId: string;
  avatarUrl: string | null;
  sourceLogo: string | null;
  SourceIcon: IconComponent | null;
  placeholders: number;
  lead?: ReactNode;
}) {
  return (
    <Section
      title={group.title}
      defaultOpen={
        group.title !== "File" &&
        group.title !== "Dates" &&
        group.title !== "Source"
      }
      empty={
        !lead &&
        group.rows.length === 0 &&
        colors.length === 0 &&
        placeholders === 0
      }
    >
      <PropertyList.Root layout={layoutFor(group.title)}>
        {lead}
        {group.rows.map((row) => (
          <PropertyRow
            key={row.id}
            row={row}
            save={save}
            avatarUrl={avatarUrl}
            sourceLogo={sourceLogo}
            SourceIcon={SourceIcon}
          />
        ))}
        {group.title === "Properties" ? (
          <PropertyColors
            colors={colors}
            primaryColor={primaryColor}
            saveId={saveId}
          />
        ) : null}
        {SKELETON_ROWS.slice(0, placeholders).map((row, index) => (
          <SkeletonRow key={row} index={index} />
        ))}
      </PropertyList.Root>
    </Section>
  );
}

function SkeletonSection({
  title,
  rows,
  defaultOpen = true,
}: {
  title: string;
  rows: number;
  defaultOpen?: boolean;
}) {
  return (
    <Section title={title} defaultOpen={defaultOpen}>
      <PropertyList.Root layout={layoutFor(title)} aria-hidden="true">
        {SKELETON_ROWS.slice(0, rows).map((row, index) => (
          <SkeletonRow key={row} index={index} />
        ))}
      </PropertyList.Root>
    </Section>
  );
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <PropertyList.Row aria-hidden="true">
      <span className={styles["skeleton-label"]} />
      <span className={styles["skeleton-value"]} data-width={(index % 3) + 1} />
    </PropertyList.Row>
  );
}

function PropertyColors({
  colors,
  primaryColor,
  saveId,
}: {
  colors: string[];
  primaryColor: string | null;
  saveId: string;
}) {
  if (colors.length === 0) return null;
  return (
    <PropertyList.Row span="full">
      <PropertyList.Label>Colors</PropertyList.Label>
      <div className={styles.colors}>
        {colors.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            primaryColor={primaryColor}
            saveId={saveId}
          />
        ))}
      </div>
    </PropertyList.Row>
  );
}

function AuthorAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <span
      className={styles["row-avatar"]}
      style={{ background: pickAuthorColor(name) }}
      aria-hidden
    >
      {avatarUrl && avatarUrl !== failedUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function PropertyRow({
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
  const action = primaryRowAction(row, save);
  return (
    <SpecContextMenu buildItems={() => buildRowMenu(row, save)}>
      <PropertyList.Row
        span={
          row.kind === "author" || row.kind === "account" ? "full" : undefined
        }
        data-interactive={action ? "" : undefined}
        role={action ? "button" : undefined}
        tabIndex={action ? 0 : undefined}
        title={action?.label}
        onClick={action?.run}
        onKeyDown={(event) => {
          if (!action || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          action.run();
        }}
      >
        <PropertyList.Label>{row.label}</PropertyList.Label>
        {row.kind === "author" || row.kind === "account" ? (
          <span className={styles["row-inline"]}>
            <AuthorAvatar
              name={row.value}
              avatarUrl={
                row.kind === "author" ? avatarUrl : (row.avatarUrl ?? null)
              }
            />
            <PropertyList.Value>{row.value}</PropertyList.Value>
          </span>
        ) : row.kind === "platform" ? (
          <span className={styles["row-inline"]}>
            {sourceLogo ? (
              <span className={styles["row-source-icon"]} aria-hidden>
                <img src={sourceLogo} alt="" width={16} height={16} />
              </span>
            ) : SourceIcon ? (
              <span className={styles["row-source-icon"]} aria-hidden>
                <SourceIcon width={16} height={16} />
              </span>
            ) : null}
            <PropertyList.Value>{row.value}</PropertyList.Value>
          </span>
        ) : (
          <PropertyList.Value title={row.value}>{row.value}</PropertyList.Value>
        )}
      </PropertyList.Row>
    </SpecContextMenu>
  );
}
