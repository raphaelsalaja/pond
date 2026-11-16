import { IconCheck } from "@pond/icons";
import { Input } from "@pond/ui/input";
import { Sidebar as Panel } from "@pond/ui/sidebar";
import type { ReactNode } from "react";
import { Targets } from "@/components/targets";
import type { LibraryTargets } from "@/utils/messaging";
import {
  type FacetCount,
  type ImageFilters,
  SIZE_BUCKETS,
  type SizeBucket,
} from "../discover";
import styles from "./styles.module.css";

const MAX_DOMAINS = 8;

interface SidebarProps {
  filters: ImageFilters;
  onFiltersChange: (filters: ImageFilters) => void;
  sizes: FacetCount[];
  formats: FacetCount[];
  domains: FacetCount[];
  library: LibraryTargets;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  folderIds: string[];
  onFolderIdsChange: (folderIds: string[]) => void;
  container: HTMLElement;
}

function toggled<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(value);
  else next.delete(value);
  return next;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel.Group role="group" aria-label={title}>
      <Panel.GroupLabel>{title}</Panel.GroupLabel>
      {children}
    </Panel.Group>
  );
}

interface FacetProps {
  label: string;
  count: FacetCount | undefined;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function Facet({ label, count, checked, onCheckedChange }: FacetProps) {
  return (
    <Panel.Item
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <Panel.Icon>{checked ? <IconCheck size={12} /> : null}</Panel.Icon>
      <Panel.ItemLabel>{label}</Panel.ItemLabel>
      <Panel.Count>
        {count ? `${count.selected}/${count.total}` : "0"}
      </Panel.Count>
    </Panel.Item>
  );
}

function MinimumField({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <Input.Root size="sm" className={styles.minimum}>
      <Input.Prefix>{label.slice(0, 1)}</Input.Prefix>
      <Input.Field
        aria-label={`Minimum ${label.toLowerCase()}`}
        inputMode="numeric"
        placeholder="0"
        value={value ? String(value) : ""}
        onChange={(event) => {
          const next = Number.parseInt(
            event.target.value.replace(/\D/g, ""),
            10,
          );
          onValueChange(Number.isFinite(next) ? Math.min(next, 100_000) : 0);
        }}
      />
    </Input.Root>
  );
}

export function Sidebar({
  filters,
  onFiltersChange,
  sizes,
  formats,
  domains,
  library,
  tags,
  onTagsChange,
  folderIds,
  onFolderIdsChange,
  container,
}: SidebarProps) {
  const set = (change: Partial<ImageFilters>) =>
    onFiltersChange({ ...filters, ...change });
  const sizeCounts = new Map(sizes.map((size) => [size.id, size]));

  return (
    <Panel.Root width="full" className={styles.sidebar}>
      <Panel.Scroll className={styles.scroll}>
        <Panel.Search
          aria-label="Search Images"
          placeholder="Search…"
          value={filters.query}
          onChange={(event) => set({ query: event.target.value })}
        />

        <Group title="Size">
          {SIZE_BUCKETS.map((bucket) => (
            <Facet
              key={bucket.id}
              label={bucket.label}
              count={sizeCounts.get(bucket.id)}
              checked={filters.sizes.has(bucket.id)}
              onCheckedChange={(on) =>
                set({
                  sizes: toggled<SizeBucket>(filters.sizes, bucket.id, on),
                })
              }
            />
          ))}
          <div className={styles.minimums}>
            <MinimumField
              label="Width"
              value={filters.minWidth}
              onValueChange={(minWidth) => set({ minWidth })}
            />
            <MinimumField
              label="Height"
              value={filters.minHeight}
              onValueChange={(minHeight) => set({ minHeight })}
            />
          </div>
        </Group>

        {formats.length > 1 ? (
          <Group title="Format">
            {formats.map((format) => (
              <Facet
                key={format.id}
                label={format.id}
                count={format}
                checked={!filters.hiddenFormats.has(format.id)}
                onCheckedChange={(on) =>
                  set({
                    hiddenFormats: toggled(
                      filters.hiddenFormats,
                      format.id,
                      !on,
                    ),
                  })
                }
              />
            ))}
          </Group>
        ) : null}

        {domains.length > 1 ? (
          <Group title="Domain">
            {domains.slice(0, MAX_DOMAINS).map((domain) => (
              <Facet
                key={domain.id}
                label={domain.id}
                count={domain}
                checked={!filters.hiddenDomains.has(domain.id)}
                onCheckedChange={(on) =>
                  set({
                    hiddenDomains: toggled(
                      filters.hiddenDomains,
                      domain.id,
                      !on,
                    ),
                  })
                }
              />
            ))}
          </Group>
        ) : null}

        <Group title="Tags">
          <Targets.Tags
            tags={library.tags}
            recent={library.recentTags}
            value={tags}
            onValueChange={onTagsChange}
            container={container}
          />
        </Group>

        {library.folders.length > 0 ? (
          <Group title="Folders">
            <Targets.Folders
              className={styles.folders}
              folders={library.folders}
              recentIds={library.recentFolderIds}
              value={folderIds}
              onValueChange={onFolderIdsChange}
            />
          </Group>
        ) : null}
      </Panel.Scroll>
    </Panel.Root>
  );
}
