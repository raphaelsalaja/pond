import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CardThumb } from "../../components/card-thumb";
import { optimistic } from "../../pool/bootstrap";
import { useSaves } from "../../pool/hooks";
import { pool } from "../../pool/pool";
import type { Save } from "../../pool/types";
import { Button, Input, Tooltip, useToast } from "../../ui";
import styles from "./styles.module.css";

interface SavesViewProps {
  /**
   * - `library` — every active save (default).
   * - `recents` — active saves sorted by `savedAt` desc.
   * - `source`  — active saves whose `source` matches `:source` param.
   */
  mode?: "library" | "recents" | "source";
}

/**
 * Library / Recents / Source view. Reads the full pool and applies a
 * mode-specific filter + sort.
 *
 * Optional `?tag=<tag>` query param narrows further; the sidebar tag
 * chips drive that. `<TweetCard>` keeps its own card chrome for
 * `save.source === "twitter"`; everything else uses the Eagle-style
 * tile defined in `styles.css`.
 */
export function SavesView({ mode = "library" }: SavesViewProps) {
  const saves = useSaves();
  const params = useParams<{ source?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const tagFilter = searchParams.get("tag") ?? "";
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const sourceFilter = mode === "source" ? (params.source ?? "") : "";
  const selectedId = searchParams.get("id");

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("id", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const focus = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("id", id);
      next.set("focus", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = saves.filter((save) => {
      if (save.deletedAt) return false;
      if (sourceFilter && save.source.toLowerCase() !== sourceFilter) {
        return false;
      }
      if (tagFilter) {
        const tagSet = new Set([...save.tags, ...save.aiTags]);
        if (!tagSet.has(tagFilter)) return false;
      }
      if (!needle) return true;
      const hay = [
        save.title ?? "",
        save.description ?? "",
        save.author ?? "",
        save.url,
        ...save.tags,
        ...save.aiTags,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });

    if (mode === "recents") {
      rows = [...rows].sort((a, b) => savedAtMs(b) - savedAtMs(a));
    }
    return rows;
  }, [saves, q, sourceFilter, tagFilter, mode]);

  const heading = useMemo(() => {
    if (mode === "source") return formatSourceLabel(sourceFilter);
    if (mode === "recents") return "Recents";
    return "Library";
  }, [mode, sourceFilter]);

  async function moveToTrash(id: string) {
    const prev = pool.get(id);
    if (!prev) return;
    const nowIso = new Date().toISOString();
    setBusy(id);
    try {
      await optimistic(
        () => {
          pool.upsert({ ...prev, deletedAt: nowIso } as typeof prev);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({
            kind: "trash",
            model: "save",
            id,
          }),
      );
      toast.add({ title: "Moved to trash", type: "success" });
    } finally {
      setBusy(null);
    }
  }

  function clearTagFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("tag");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className={styles.library}>
      <div className={styles.toolbar}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{heading}</h2>
          <span className={styles.count}>{filtered.length}</span>
        </div>
        <div className={styles.filters}>
          <Input
            type="search"
            placeholder="Search titles, tags, URLs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {tagFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTagFilter}
              className={styles.tagPill}
            >
              <span>#{tagFilter}</span>
              <span aria-hidden>✕</span>
            </Button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="pond-empty">
          <p>No matches. Try a different search or clear the filter.</p>
        </div>
      ) : (
        <ul className="pond-grid">
          {filtered.map((save) => (
            <li
              key={save.id}
              className={`pond-card ${
                selectedId === save.id ? "pond-card--selected" : ""
              }`.trim()}
              onContextMenu={(e) => {
                // Suppress the built-in Chromium context menu and pop a
                // native OS menu instead (Reveal in Finder, Open with
                // Default, Move to Trash, …). Main owns path resolution.
                e.preventDefault();
                void window.pond.showSaveContextMenu(save.id);
              }}
            >
              <button
                type="button"
                className="pond-card__select"
                aria-pressed={selectedId === save.id}
                onClick={() => select(save.id)}
                onDoubleClick={() => focus(save.id)}
              >
                <CardBody save={save} />
              </button>
              <Tooltip content="Move to Trash">
                <Button
                  variant="default"
                  size="sm"
                  className="pond-card__delete"
                  disabled={busy === save.id}
                  onClick={(e) => {
                    e.preventDefault();
                    void moveToTrash(save.id);
                  }}
                  aria-label="Move to Trash"
                >
                  Delete
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Card body shared by every source. Image lives in a fixed 138px-tall
 * slot so cards keep an even rhythm in the grid; title and relative
 * timestamp sit underneath, both centred per the wireframe.
 */
function CardBody({ save }: { save: Save }) {
  return (
    <>
      <div className="pond-card__media">
        <CardThumb save={save} />
        {save.files.length > 1 ? (
          <span
            className="pond-card__count"
            role="status"
            aria-label={`${save.files.length} media files`}
          >
            {save.files.length}
          </span>
        ) : null}
      </div>
      <div className="pond-card__meta">
        <span className="pond-card__title">{save.title ?? save.url}</span>
        <span className="pond-card__time">{formatRelative(save.savedAt)}</span>
      </div>
    </>
  );
}

function savedAtMs(save: Save): number {
  const t = new Date(save.savedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatSourceLabel(source: string): string {
  if (!source) return "Source";
  const lookup: Record<string, string> = {
    twitter: "Twitter (X)",
    x: "Twitter (X)",
    cosmos: "Cosmos",
    reddit: "Reddit",
    arena: "Are.na",
    "are.na": "Are.na",
    facebook: "Facebook",
    instagram: "Instagram",
    pinterest: "Pinterest",
    dribbble: "Dribbble",
  };
  return lookup[source.toLowerCase()] ?? toTitleCase(source);
}

function toTitleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compact "time ago" formatter matching the Figma copy ("4 days ago",
 * "3 hours ago", "1 month ago"). Falls back to a long-form date once
 * we cross the year boundary so old saves still read sensibly.
 */
function formatRelative(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, (Date.now() - t) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  }
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  const days = seconds / 86_400;
  if (days < 30) {
    const d = Math.floor(days);
    return `${d} ${d === 1 ? "day" : "days"} ago`;
  }
  const months = days / 30;
  if (months < 12) {
    const m = Math.floor(months);
    return `${m} ${m === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}
