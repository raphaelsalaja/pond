import { useMemo } from "react";
import { useSaves } from "../../pool/hooks";
import { Input } from "../../ui";
import {
  DATE_PRESETS,
  type DatePresetId,
  DIMENSION_BUCKETS,
  type FilterValues,
  SIZE_BUCKETS,
} from "./filters";
import styles from "./styles.module.css";

/**
 * Per-filter dropdown bodies. Each component owns the controls for a
 * single filter value and calls `onChange` with the next value (or
 * `null`/empty for "no filter"). The chrome (popover, header, footer)
 * is shared and lives in `<FilterChip>`; these components are pure
 * content.
 *
 * Conventions:
 * - All dropdowns are uncontrolled w.r.t. open state — the chip owns it.
 * - Multi-value filters expose a chip-list with click-to-toggle, plus
 *   a "Clear" affordance in the chip footer.
 * - Scaffold filters render a compact "Coming soon" body so the chip
 *   shows up but doesn't pretend to do work.
 */

export interface DropdownProps<K extends keyof FilterValues> {
  value: FilterValues[K];
  onChange: (next: FilterValues[K]) => void;
}

/* ------------------------------------------------------------------ */
/* Color — toggle a small palette of well-known anchors.               */
/* ------------------------------------------------------------------ */

const COLOR_SWATCHES: Array<{ id: string; label: string; hex: string }> = [
  { id: "red", label: "Red", hex: "e63946" },
  { id: "orange", label: "Orange", hex: "f4a261" },
  { id: "yellow", label: "Yellow", hex: "f1c453" },
  { id: "green", label: "Green", hex: "2a9d8f" },
  { id: "teal", label: "Teal", hex: "1f7a8c" },
  { id: "blue", label: "Blue", hex: "3a86ff" },
  { id: "purple", label: "Purple", hex: "9d4edd" },
  { id: "pink", label: "Pink", hex: "ff5d8f" },
  { id: "brown", label: "Brown", hex: "8a5a44" },
  { id: "black", label: "Black", hex: "111111" },
  { id: "grey", label: "Grey", hex: "8b8b8b" },
  { id: "white", label: "White", hex: "f4f4f4" },
];

export function ColorDropdown({ value, onChange }: DropdownProps<"color">) {
  function toggle(hex: string) {
    if (value.includes(hex)) onChange(value.filter((h) => h !== hex));
    else onChange([...value, hex]);
  }
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>Match dominant colour</p>
      <div className={styles.swatchGrid}>
        {COLOR_SWATCHES.map((c) => {
          const active = value.includes(c.hex);
          return (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              aria-pressed={active}
              className={[styles.swatch, active ? styles.swatchActive : ""]
                .filter(Boolean)
                .join(" ")}
              style={{ background: `#${c.hex}` }}
              onClick={() => toggle(c.hex)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tags — populated from the live pool.                                */
/* ------------------------------------------------------------------ */

export function TagsDropdown({ value, onChange }: DropdownProps<"tags">) {
  const saves = useSaves();
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      for (const t of [...s.tags, ...s.aiTags]) {
        const key = t.trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30);
  }, [saves]);

  function toggle(tag: string) {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else onChange([...value, tag]);
  }

  if (!tags.length) {
    return (
      <div className={styles.dropdown}>
        <p className={styles.dropdownEmpty}>No tags yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>Match any of</p>
      <div className={styles.tagList}>
        {tags.map(([tag, count]) => {
          const active = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={[styles.tagPill, active ? styles.tagPillActive : ""]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={active}
              onClick={() => toggle(tag)}
            >
              <span>#{tag}</span>
              <span className={styles.tagCount}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Type — media type + source.                                         */
/* ------------------------------------------------------------------ */

const TYPE_GROUPS: Array<{
  label: string;
  options: Array<{ id: string; label: string }>;
}> = [
  {
    label: "Media",
    options: [
      { id: "image", label: "Image" },
      { id: "video", label: "Video" },
      { id: "article", label: "Article" },
      { id: "link", label: "Link" },
    ],
  },
  {
    label: "Source",
    options: [
      { id: "twitter", label: "Twitter (X)" },
      { id: "instagram", label: "Instagram" },
      { id: "pinterest", label: "Pinterest" },
      { id: "arena", label: "Are.na" },
      { id: "cosmos", label: "Cosmos" },
      { id: "tiktok", label: "TikTok" },
      { id: "youtube", label: "YouTube" },
    ],
  },
];

export function TypeDropdown({ value, onChange }: DropdownProps<"type">) {
  function toggle(id: string) {
    if (value.includes(id as (typeof value)[number])) {
      onChange(value.filter((v) => v !== id) as typeof value);
    } else {
      onChange([...value, id as (typeof value)[number]]);
    }
  }
  return (
    <div className={styles.dropdown}>
      {TYPE_GROUPS.map((g) => (
        <div key={g.label} className={styles.dropdownSection}>
          <p className={styles.dropdownLabel}>{g.label}</p>
          <div className={styles.optionList}>
            {g.options.map((o) => (
              <button
                key={o.id}
                type="button"
                className={[
                  styles.optionRow,
                  value.includes(o.id as (typeof value)[number])
                    ? styles.optionRowActive
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => toggle(o.id)}
              >
                <span className={styles.optionCheck} aria-hidden>
                  {value.includes(o.id as (typeof value)[number]) ? "✓" : ""}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shape — single select.                                              */
/* ------------------------------------------------------------------ */

const SHAPES: Array<{
  id: "portrait" | "landscape" | "square";
  label: string;
}> = [
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
  { id: "square", label: "Square" },
];

export function ShapeDropdown({ value, onChange }: DropdownProps<"shape">) {
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>Aspect ratio</p>
      <div className={styles.optionList}>
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={[
              styles.optionRow,
              value === s.id ? styles.optionRowActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(value === s.id ? null : s.id)}
          >
            <span className={styles.optionCheck} aria-hidden>
              {value === s.id ? "✓" : ""}
            </span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dimensions — bucketed pixel size.                                   */
/* ------------------------------------------------------------------ */

export function DimensionsDropdown({
  value,
  onChange,
}: DropdownProps<"dimensions">) {
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>Longest edge</p>
      <div className={styles.optionList}>
        {DIMENSION_BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={[
              styles.optionRow,
              value === b.id ? styles.optionRowActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(value === b.id ? null : b.id)}
          >
            <span className={styles.optionCheck} aria-hidden>
              {value === b.id ? "✓" : ""}
            </span>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Size — file size buckets.                                           */
/* ------------------------------------------------------------------ */

export function SizeDropdown({ value, onChange }: DropdownProps<"size">) {
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>File size</p>
      <div className={styles.optionList}>
        {SIZE_BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={[
              styles.optionRow,
              value === b.id ? styles.optionRowActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(value === b.id ? null : b.id)}
          >
            <span className={styles.optionCheck} aria-hidden>
              {value === b.id ? "✓" : ""}
            </span>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Note — has note / no note.                                          */
/* ------------------------------------------------------------------ */

export function NoteDropdown({ value, onChange }: DropdownProps<"note">) {
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>Notes</p>
      <div className={styles.optionList}>
        <button
          type="button"
          className={[
            styles.optionRow,
            value === "with" ? styles.optionRowActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onChange(value === "with" ? null : "with")}
        >
          <span className={styles.optionCheck} aria-hidden>
            {value === "with" ? "✓" : ""}
          </span>
          Has a note
        </button>
        <button
          type="button"
          className={[
            styles.optionRow,
            value === "without" ? styles.optionRowActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onChange(value === "without" ? null : "without")}
        >
          <span className={styles.optionCheck} aria-hidden>
            {value === "without" ? "✓" : ""}
          </span>
          No note
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* URL — substring input.                                              */
/* ------------------------------------------------------------------ */

export function UrlDropdown({ value, onChange }: DropdownProps<"url">) {
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>URL contains</p>
      <Input
        type="search"
        value={value}
        autoFocus
        placeholder="example.com / /article-slug"
        onChange={(e) => onChange(e.target.value)}
      />
      <p className={styles.dropdownHint}>
        Matches anywhere in the saved URL (case-insensitive).
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date Imported / Modified — preset chooser.                          */
/* ------------------------------------------------------------------ */

export function DateImportedDropdown({
  value,
  onChange,
}: DropdownProps<"date_imported">) {
  return (
    <DateDropdown value={value} onChange={onChange} title="Date imported" />
  );
}

export function DateModifiedDropdown({
  value,
  onChange,
}: DropdownProps<"date_modified">) {
  return (
    <DateDropdown value={value} onChange={onChange} title="Date modified" />
  );
}

function DateDropdown({
  value,
  onChange,
  title,
}: {
  value: DatePresetId | null;
  onChange: (next: DatePresetId | null) => void;
  title: string;
}) {
  return (
    <div className={styles.dropdown}>
      <p className={styles.dropdownLabel}>{title}</p>
      <div className={styles.optionList}>
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={[
              styles.optionRow,
              value === p.id ? styles.optionRowActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(value === p.id ? null : p.id)}
          >
            <span className={styles.optionCheck} aria-hidden>
              {value === p.id ? "✓" : ""}
            </span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scaffold dropdowns — Folder / Rating / Duration.                    */
/* ------------------------------------------------------------------ */

export function FolderDropdown(_: DropdownProps<"folder">) {
  return <ScaffoldBody hint="Folders aren't available yet." />;
}

export function RatingDropdown(_: DropdownProps<"rating">) {
  return <ScaffoldBody hint="Star ratings aren't wired up yet." />;
}

export function DurationDropdown(_: DropdownProps<"duration">) {
  return <ScaffoldBody hint="Durations aren't extracted from videos yet." />;
}

function ScaffoldBody({ hint }: { hint: string }) {
  return (
    <div className={styles.dropdown}>
      <div className={styles.scaffoldBanner}>
        <span className={styles.scaffoldChip}>Coming soon</span>
        <span className={styles.scaffoldText}>{hint}</span>
      </div>
    </div>
  );
}
