import { Button, Tooltip } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "@/components/empty-state";
import { addHighlight, removeHighlight } from "@/pool/annotations";
import { useSave } from "@/pool/hooks";
import type { Save, TextHighlight } from "@/pool/types";
import styles from "./styles.module.css";

type FontStack = "serif" | "sans" | "mono";
type Theme = "system" | "sepia" | "dark" | "high-contrast";
type Width = "narrow" | "medium" | "wide";

interface Prefs {
  size: number;
  font: FontStack;
  theme: Theme;
  width: Width;
}

const DEFAULT_PREFS: Prefs = {
  size: 18,
  font: "serif",
  theme: "system",
  width: "medium",
};

const PREFS_KEY = "pond.reader.prefs.v1";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      size: clamp(Number(parsed.size) || DEFAULT_PREFS.size, 14, 28),
      font: (parsed.font as FontStack) ?? DEFAULT_PREFS.font,
      theme: (parsed.theme as Theme) ?? DEFAULT_PREFS.theme,
      width: (parsed.width as Width) ?? DEFAULT_PREFS.width,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Reader-mode route. Surfaces the cached `articleHtml` produced by the
 * enrichment worker with typography controls (font stack, size, width,
 * theme). Falls back to a "Run extraction" CTA when no extraction has
 * happened yet — clicking it queues an `enrich.start` for this save.
 *
 * Prefs persist in localStorage, scoped to a single key so adjusting on
 * one article carries across the whole library.
 */
export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const save = useSave(id);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [content, setContent] = useState<{
    html: string | null;
    text: string | null;
    minutes: number | null;
    summary: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Quota / private mode — nothing we can do, just don't crash.
      }
      return next;
    });
  }, []);

  // Pool drops `articleHtml` for size reasons; we re-fetch the full row
  // here so the body is available when the user lands on `/read/:id`.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void window.pond
      .query("saves.get", { id })
      .then((row) => {
        if (cancelled) return;
        const r = row as {
          articleHtml?: string | null;
          articleText?: string | null;
          articleReadingMinutes?: number | null;
          aiSummary?: string | null;
        } | null;
        setContent({
          html: r?.articleHtml ?? null,
          text: r?.articleText ?? null,
          minutes: r?.articleReadingMinutes ?? null,
          summary: r?.aiSummary ?? null,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const runExtraction = useCallback(async () => {
    if (!id) return;
    setExtracting(true);
    try {
      await window.pond.query("enrich.start", { saveId: id });
    } finally {
      setExtracting(false);
    }
  }, [id]);

  const themeClass = useMemo(() => {
    switch (prefs.theme) {
      case "sepia":
        return styles["theme-sepia"];
      case "dark":
        return styles["theme-dark"];
      case "high-contrast":
        return styles["theme-hc"];
      default:
        return "";
    }
  }, [prefs.theme]);

  const widthVar = useMemo(() => {
    switch (prefs.width) {
      case "narrow":
        return "640px";
      case "wide":
        return "920px";
      default:
        return "760px";
    }
  }, [prefs.width]);

  const fontFamily = useMemo(() => {
    switch (prefs.font) {
      case "sans":
        return "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      case "mono":
        return "ui-monospace, 'SF Mono', Menlo, monospace";
      default:
        return "Georgia, 'Iowan Old Style', 'Palatino', serif";
    }
  }, [prefs.font]);

  if (!save) {
    return (
      <EmptyState.Root data-tone="page">
        <EmptyState.Title>Save not found</EmptyState.Title>
        <EmptyState.Actions>
          <Link to="/">← back to library</Link>
        </EmptyState.Actions>
      </EmptyState.Root>
    );
  }

  const hasArticle = Boolean(content?.html);
  const wordCount = content?.text
    ? content.text.split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className={`${styles.reader} ${themeClass}`.trim()}>
      <header className={styles.toolbar}>
        <div className={styles["toolbar-left"]}>
          <Link to={`/save/${save.id}`} className={styles.back}>
            ← Back
          </Link>
        </div>
        <div className={styles["toolbar-center"]}>
          <Tooltip.Root content="Decrease text size">
            <Button
              size="sm"
              variant="ghost"
              icon
              aria-label="Smaller text"
              onClick={() => update({ size: clamp(prefs.size - 1, 14, 28) })}
            >
              A−
            </Button>
          </Tooltip.Root>
          <span className={styles["size-readout"]}>{prefs.size}px</span>
          <Tooltip.Root content="Increase text size">
            <Button
              size="sm"
              variant="ghost"
              icon
              aria-label="Bigger text"
              onClick={() => update({ size: clamp(prefs.size + 1, 14, 28) })}
            >
              A+
            </Button>
          </Tooltip.Root>
          <span className={styles.divider} />
          <select
            className={styles.select}
            value={prefs.font}
            onChange={(e) => update({ font: e.target.value as FontStack })}
            aria-label="Font family"
          >
            <option value="serif">Serif</option>
            <option value="sans">Sans-serif</option>
            <option value="mono">Mono</option>
          </select>
          <select
            className={styles.select}
            value={prefs.width}
            onChange={(e) => update({ width: e.target.value as Width })}
            aria-label="Column width"
          >
            <option value="narrow">Narrow</option>
            <option value="medium">Medium</option>
            <option value="wide">Wide</option>
          </select>
          <select
            className={styles.select}
            value={prefs.theme}
            onChange={(e) => update({ theme: e.target.value as Theme })}
            aria-label="Theme"
          >
            <option value="system">System</option>
            <option value="sepia">Sepia</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </div>
        <div className={styles["toolbar-right"]}>
          <Tooltip.Root content="Open original page in browser">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                save.url && void window.pond.openExternal(save.url)
              }
              disabled={!save.url}
            >
              Original
            </Button>
          </Tooltip.Root>
        </div>
      </header>

      <article
        className={styles.article}
        style={{
          maxWidth: widthVar,
          fontFamily,
          fontSize: `${prefs.size}px`,
          lineHeight: 1.65,
        }}
      >
        <h1 className={styles.title}>{save.title ?? save.url}</h1>
        <p className={styles.byline}>
          {save.author ? <span>{save.author}</span> : null}
          {save.author ? <span aria-hidden> · </span> : null}
          <a href={save.url} target="_blank" rel="noreferrer">
            {hostname(save.url)}
          </a>
          {content?.minutes ? (
            <>
              <span aria-hidden> · </span>
              <span>{content.minutes} min read</span>
            </>
          ) : wordCount > 0 ? (
            <>
              <span aria-hidden> · </span>
              <span>{Math.max(1, Math.round(wordCount / 220))} min read</span>
            </>
          ) : null}
        </p>

        {content?.summary ? (
          <aside className={styles.summary}>
            <span className={styles["summary-label"]}>AI summary</span>
            <p>{content.summary}</p>
          </aside>
        ) : null}

        {loading ? (
          <p className={styles.loading}>Loading article…</p>
        ) : hasArticle && content?.html ? (
          <ReaderBody save={save} html={content.html} />
        ) : (
          <EmptyState.Root data-tone="inline">
            <EmptyState.Description>
              No reader copy cached for this save yet.
            </EmptyState.Description>
            <EmptyState.Actions>
              <Button
                onClick={runExtraction}
                disabled={extracting || !save.url}
              >
                {extracting ? "Queuing…" : "Run extraction"}
              </Button>
            </EmptyState.Actions>
            <EmptyState.Description>
              The AI worker will fetch the page, strip the chrome, and cache a
              clean copy locally. Reload this view once it finishes.
            </EmptyState.Description>
          </EmptyState.Root>
        )}
      </article>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const HIGHLIGHT_PALETTE = ["#ffe066", "#a0e7e5", "#ffaebc", "#b4f8c8"] as const;

interface ReaderBodyProps {
  save: Save;
  html: string;
}

/**
 * Article body that supports text-selection highlights. When the user
 * releases the mouse over a non-empty selection, we float a chip near
 * the cursor offering "Highlight" — clicking it persists the selection
 * as a `TextHighlight`. Existing highlights paint as soft yellow spans.
 *
 * We avoid wrapping the dangerous HTML in a Range walker (DOM positions
 * are unstable across renders) and instead match by quote string. That
 * mirrors how Instapaper / Reader View work — a re-extraction with
 * minor markup drift won't lose the highlight as long as the literal
 * quote still appears in the body.
 */
function ReaderBody({ save, html }: ReaderBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<{
    x: number;
    y: number;
    quote: string;
  } | null>(null);

  const highlights = useMemo<TextHighlight[]>(
    () => save.annotations?.highlights ?? [],
    [save.annotations?.highlights],
  );

  // Apply existing highlights by wrapping each quote in <mark>. We
  // sort by length (longest first) so substring overlaps don't double-
  // wrap ("data" inside "data structures").
  const decorated = useMemo(() => {
    if (highlights.length === 0) return html;
    const sorted = [...highlights].sort(
      (a, b) => b.quote.length - a.quote.length,
    );
    let out = html;
    for (const h of sorted) {
      const escaped = h.quote
        .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
        .replace(/\s+/g, "\\s+");
      const re = new RegExp(`(?<!data-pond-hl=")(${escaped})`, "g");
      out = out.replace(
        re,
        `<mark data-pond-hl="${h.id}" style="background:${h.color ?? HIGHLIGHT_PALETTE[0]}; padding:0 2px; border-radius:2px;">$1</mark>`,
      );
    }
    return out;
  }, [highlights, html]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setChip(null);
      return;
    }
    const quote = sel.toString().trim();
    if (quote.length < 4) {
      setChip(null);
      return;
    }
    setChip({ x: e.clientX, y: e.clientY - 8, quote });
  }, []);

  const onCommitHighlight = useCallback(async () => {
    if (!chip) return;
    setChip(null);
    await addHighlight(save, {
      quote: chip.quote,
      color: HIGHLIGHT_PALETTE[0],
    });
    window.getSelection()?.removeAllRanges();
  }, [chip, save]);

  const onClickBody = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const mark = target.closest("mark[data-pond-hl]") as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute("data-pond-hl");
      if (!id) return;
      e.preventDefault();
      if (!confirm("Remove this highlight?")) return;
      await removeHighlight(save, id);
    },
    [save],
  );

  return (
    <div style={{ position: "relative" }}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: highlights are
          opt-in mouse selection affordances; keyboard removal is via the
          rail buttons below. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same as above. */}
      <div
        ref={ref}
        className={styles.body}
        onMouseUp={onMouseUp}
        onClick={onClickBody}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitised
        dangerouslySetInnerHTML={{ __html: decorated }}
      />
      {chip ? (
        <button
          type="button"
          onClick={() => void onCommitHighlight()}
          style={{
            position: "fixed",
            top: chip.y - 36,
            left: chip.x - 40,
            zIndex: 9999,
            padding: "6px 10px",
            font: "inherit",
            fontSize: 11,
            color: "#fff",
            background: "#141414",
            border: 0,
            borderRadius: 6,
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
            cursor: "pointer",
          }}
        >
          Highlight
        </button>
      ) : null}
      {highlights.length > 0 ? (
        <aside className={styles["highlights-rail"]}>
          <h3 className={styles["highlights-title"]}>
            {highlights.length} highlight{highlights.length === 1 ? "" : "s"}
          </h3>
          <ul className={styles["highlights-list"]}>
            {highlights.map((h) => (
              <li key={h.id} className={styles["highlights-item"]}>
                <span
                  className={styles["highlight-swatch"]}
                  style={{ background: h.color ?? HIGHLIGHT_PALETTE[0] }}
                  aria-hidden
                />
                <span className={styles["highlight-quote"]}>"{h.quote}"</span>
                <Tooltip.Root content="Remove">
                  <button
                    type="button"
                    className={styles["highlight-remove"]}
                    onClick={() => void removeHighlight(save, h.id)}
                    aria-label="Remove highlight"
                  >
                    ×
                  </button>
                </Tooltip.Root>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
