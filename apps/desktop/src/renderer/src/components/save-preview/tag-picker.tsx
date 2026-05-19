import {
  IconClockOutline18,
  IconMagnifierOutline18,
  IconSparkle2Outline18,
} from "@pond/icons/outline/18";
import { normalizeLabelName } from "@pond/schema/label-name";
import { Input, Kbd, Popover } from "@pond/ui";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getRecentTags, pushRecentTag } from "@/lib/recent-tags";
import { useSaves } from "@/pool/hooks";
import type { Save } from "@/pool/types";
import styles from "./tag-picker.module.css";

interface CanonTag {
  name: string;
  color: string | null;
}

interface TagItem {
  name: string;
  count: number;
  color: string | null;
}

interface TagPickerProps {
  save: Save;
  trigger: ReactElement;
}

const RECOMMENDED_CAP = 12;

export function TagPicker({ save, trigger }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [canonical, setCanonical] = useState<CanonTag[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const saves = useSaves();

  useEffect(() => {
    if (!open) return;
    setQ("");
    setRecentNames(getRecentTags());
    let cancelled = false;
    void window.pond
      .query("tags.list", {})
      .then((rows) => {
        if (!cancelled) setCanonical(rows as CanonTag[]);
      })
      .catch(() => {
        if (!cancelled) setCanonical([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const colorByLower = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of canonical) map.set(t.name.toLowerCase(), t.color ?? null);
    return map;
  }, [canonical]);

  const countsByLower = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      for (const t of s.tags) {
        const k = t.toLowerCase();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return counts;
  }, [saves]);

  const applied = useMemo(
    () => new Set(save.tags.map((t) => t.toLowerCase())),
    [save.tags],
  );

  const { recently, recommended, others } = useMemo(() => {
    const seen = new Set<string>(applied);

    const recentlyOut: TagItem[] = [];
    for (const name of recentNames) {
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      recentlyOut.push({
        name,
        count: countsByLower.get(k) ?? 0,
        color: colorByLower.get(k) ?? null,
      });
    }

    const recommendedCounts = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      if (s.id === save.id) continue;
      const sameSource = s.source === save.source;
      const sameAuthor =
        Boolean(save.author) && Boolean(s.author) && s.author === save.author;
      if (!sameSource && !sameAuthor) continue;
      for (const t of s.tags) {
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        recommendedCounts.set(k, (recommendedCounts.get(k) ?? 0) + 1);
      }
    }
    const recommendedOut: TagItem[] = [...recommendedCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, RECOMMENDED_CAP)
      .map(([name]) => {
        seen.add(name);
        return {
          name,
          count: countsByLower.get(name) ?? 0,
          color: colorByLower.get(name) ?? null,
        };
      });

    const candidates = new Map<string, TagItem>();
    for (const t of canonical) {
      const k = t.name.toLowerCase();
      if (seen.has(k)) continue;
      candidates.set(k, {
        name: t.name,
        count: countsByLower.get(k) ?? 0,
        color: t.color ?? null,
      });
    }
    for (const [k, count] of countsByLower) {
      if (seen.has(k) || candidates.has(k)) continue;
      candidates.set(k, { name: k, count, color: null });
    }
    const othersOut = [...candidates.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return {
      recently: recentlyOut,
      recommended: recommendedOut,
      others: othersOut,
    };
  }, [
    applied,
    recentNames,
    saves,
    save.id,
    save.source,
    save.author,
    countsByLower,
    colorByLower,
    canonical,
  ]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return { recently, recommended, others };
    const test = (t: TagItem): boolean => t.name.toLowerCase().includes(needle);
    return {
      recently: recently.filter(test),
      recommended: recommended.filter(test),
      others: others.filter(test),
    };
  }, [q, recently, recommended, others]);

  const hasAny =
    filtered.recently.length > 0 ||
    filtered.recommended.length > 0 ||
    filtered.others.length > 0;

  async function apply(rawName: string) {
    const cleaned = normalizeLabelName(rawName);
    if (!cleaned) return;
    if (applied.has(cleaned.toLowerCase())) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await window.pond.query("tags.setForSave", {
        saveId: save.id,
        tags: [...save.tags, cleaned],
      });
      pushRecentTag(cleaned);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  // Arrow-key navigation across the two-column grid is intentionally out of
  // scope for v1 — the footer hint is shown for visual parity with the
  // reference design. Only Enter and Esc are wired here; Esc is handled by
  // Popover.Root via base-ui.
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const needle = q.trim().toLowerCase();
    if (!needle) return;
    const exact =
      filtered.recently.find((t) => t.name.toLowerCase() === needle) ??
      filtered.recommended.find((t) => t.name.toLowerCase() === needle) ??
      filtered.others.find((t) => t.name.toLowerCase() === needle);
    if (exact) {
      void apply(exact.name);
      return;
    }
    const onlyMatch =
      filtered.recently.length +
        filtered.recommended.length +
        filtered.others.length ===
      1
        ? (filtered.recently[0] ??
          filtered.recommended[0] ??
          filtered.others[0])
        : null;
    if (onlyMatch) {
      void apply(onlyMatch.name);
      return;
    }
    void apply(q);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger} />
      <Popover.Content className={styles.popup} sideOffset={6} align="start">
        <div className={styles.header}>
          <span className={styles["header-icon"]} aria-hidden>
            <IconMagnifierOutline18 width={14} height={14} />
          </span>
          <Input
            data-size="sm"
            className={styles.search}
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            autoFocus
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <div className={styles.body}>
          {filtered.recently.length > 0 ? (
            <Section
              title="Recently"
              count={filtered.recently.length}
              items={filtered.recently}
              renderIcon={() => <IconClockOutline18 width={12} height={12} />}
              onPick={apply}
            />
          ) : null}
          {filtered.recommended.length > 0 ? (
            <Section
              title="Recommended"
              count={filtered.recommended.length}
              items={filtered.recommended}
              renderIcon={() => (
                <IconSparkle2Outline18 width={12} height={12} />
              )}
              onPick={apply}
            />
          ) : null}
          {filtered.others.length > 0 ? (
            <Section
              title="Others"
              count={filtered.others.length}
              items={filtered.others}
              renderIcon={(color) => (
                <span
                  className={styles["item-dot"]}
                  style={{ background: color ?? "var(--ds-gray-a6)" }}
                />
              )}
              onPick={apply}
            />
          ) : null}
          {!hasAny ? (
            <div className={styles.empty}>
              {q.trim() ? `Press ↵ to create "${q.trim()}"` : "No tags yet."}
            </div>
          ) : null}
        </div>
        <div className={styles.footer}>
          <span className={styles["footer-cell"]}>
            <Kbd.Cluster keys={["↑", "↓", "←", "→"]} />
            <span className={styles["footer-label"]}>Move</span>
          </span>
          <span className={styles["footer-cell"]}>
            <Kbd.Key>↵</Kbd.Key>
            <span className={styles["footer-label"]}>Select</span>
          </span>
          <span className={styles["footer-cell"]}>
            <Kbd.Key>esc</Kbd.Key>
            <span className={styles["footer-label"]}>Close</span>
          </span>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function Section({
  title,
  count,
  items,
  renderIcon,
  onPick,
}: {
  title: string;
  count: number;
  items: TagItem[];
  renderIcon: (color: string | null) => ReactNode;
  onPick: (name: string) => void;
}) {
  return (
    <section className={styles.section}>
      <h4 className={styles["section-title"]}>
        {title} <span className={styles["section-count"]}>({count})</span>
      </h4>
      <div className={styles.grid}>
        {items.map((item) => (
          <button
            key={item.name}
            type="button"
            className={styles.item}
            onClick={() => onPick(item.name)}
            title={item.name}
          >
            <span className={styles["item-icon"]} aria-hidden>
              {renderIcon(item.color)}
            </span>
            <span className={styles["item-name"]}>{item.name}</span>
            {item.count > 0 ? (
              <span className={styles["item-count"]}>({item.count})</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
