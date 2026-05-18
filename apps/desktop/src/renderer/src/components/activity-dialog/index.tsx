import { Dialog } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSourceLabel } from "@/components/source-badge";
import styles from "./styles.module.css";

/* "Logging sucks" panel.
 *
 * Reads from `pipeline_events` (one row per task / sync / save
 * lifecycle, courtesy of `lib/wide-event.ts`) and lets you slice
 * recent activity by kind / source / outcome / error class without
 * ever touching `main.log`. The point isn't to be a full log viewer —
 * it's to make the canonical wide-event queries one-click so
 * "debugging" stops being grep archaeology. */

interface EventRow {
  id: number;
  ts: number;
  kind:
    | "pipeline.task.completed"
    | "sync.run.completed"
    | "save.ingest.completed";
  saveId: string | null;
  source: string | null;
  op: string | null;
  outcome: string;
  durationMs: number | null;
  attempts: number | null;
  errorName: string | null;
  errorMessage: string | null;
  trigger: string | null;
  payload: unknown;
}

interface FacetEntry {
  value: string;
  count: number;
}

interface FacetsResponse {
  kinds: FacetEntry[];
  sources: FacetEntry[];
  ops: FacetEntry[];
  outcomes: FacetEntry[];
  errorNames: FacetEntry[];
}

interface FailuresRow {
  errorName: string | null;
  source: string | null;
  op: string | null;
  count: number;
}

const TIME_RANGES = [
  { id: "1h", label: "1h", ms: 60 * 60_000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60_000 },
  { id: "7d", label: "7d", ms: 7 * 24 * 60 * 60_000 },
  { id: "all", label: "All", ms: null as number | null },
] as const;

type Mode = "recent" | "failures";

interface Filters {
  kind: string | null;
  source: string | null;
  outcome: string | null;
  errorName: string | null;
  saveId: string;
}

interface ContentProps {
  open: boolean;
}

function Content({ open }: ContentProps) {
  const [rangeId, setRangeId] =
    useState<(typeof TIME_RANGES)[number]["id"]>("24h");
  const [mode, setMode] = useState<Mode>("recent");
  const [filters, setFilters] = useState<Filters>({
    kind: null,
    source: null,
    outcome: null,
    errorName: null,
    saveId: "",
  });
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [failures, setFailures] = useState<FailuresRow[] | null>(null);
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const sinceMs = useMemo(() => {
    const ms = TIME_RANGES.find((r) => r.id === rangeId)?.ms ?? null;
    return ms === null ? null : Date.now() - ms;
  }, [rangeId]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const facetReq = window.pond.query("pipeline.events.facets", {
        sinceMs: sinceMs ?? undefined,
      }) as Promise<FacetsResponse>;

      if (mode === "recent") {
        const params: Record<string, unknown> = { limit: 500 };
        if (sinceMs !== null) params.sinceMs = sinceMs;
        if (filters.kind) params.kind = filters.kind;
        if (filters.source) params.source = filters.source;
        if (filters.outcome) params.outcome = filters.outcome;
        if (filters.errorName) params.errorName = filters.errorName;
        const trimmedId = filters.saveId.trim();
        if (trimmedId) params.saveId = trimmedId;
        const [r, f] = await Promise.all([
          window.pond.query("pipeline.events.list", params) as Promise<{
            rows: EventRow[];
          }>,
          facetReq,
        ]);
        setRows(r.rows);
        setFacets(f);
      } else {
        const [r, f] = await Promise.all([
          window.pond.query("pipeline.events.failuresByError", {
            sinceMs: sinceMs ?? undefined,
          }) as Promise<{ rows: FailuresRow[] }>,
          facetReq,
        ]);
        setFailures(r.rows);
        setFacets(f);
      }
    } finally {
      setBusy(false);
    }
  }, [mode, sinceMs, filters]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const clearFilters = useCallback(() => {
    setFilters({
      kind: null,
      source: null,
      outcome: null,
      errorName: null,
      saveId: "",
    });
  }, []);

  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <Dialog.Content className={styles.dialog}>
      <header className={styles.header}>
        <Dialog.Title>Activity</Dialog.Title>
        <Dialog.Description>
          One wide event per task, sync, and save lifecycle — straight from{" "}
          <code>pipeline_events</code>. Filter by source, outcome, or error
          class; click a row for the full payload.
        </Dialog.Description>
        <div className={styles["header-actions"]}>
          <div className={styles["mode-toggle"]} role="tablist">
            <button
              type="button"
              role="tab"
              className={styles["mode-button"]}
              data-active={mode === "recent" ? "true" : undefined}
              onClick={() => setMode("recent")}
            >
              Recent
            </button>
            <button
              type="button"
              role="tab"
              className={styles["mode-button"]}
              data-active={mode === "failures" ? "true" : undefined}
              onClick={() => setMode("failures")}
            >
              Failures by error
            </button>
          </div>
          <div className={styles["range-toggle"]} role="tablist">
            {TIME_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={styles["range-button"]}
                data-active={rangeId === r.id ? "true" : undefined}
                onClick={() => setRangeId(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles["refresh-button"]}
            onClick={() => void refresh()}
            disabled={busy}
            title="Re-run the query"
          >
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {mode === "recent" ? (
        <>
          <div className={styles["filter-row"]}>
            <FacetSelect
              label="Kind"
              value={filters.kind}
              options={facets?.kinds ?? []}
              onChange={(v) => setFilter("kind", v)}
            />
            <FacetSelect
              label="Source"
              value={filters.source}
              options={facets?.sources ?? []}
              labelFor={(v) => getSourceLabel(v)}
              onChange={(v) => setFilter("source", v)}
            />
            <FacetSelect
              label="Outcome"
              value={filters.outcome}
              options={facets?.outcomes ?? []}
              onChange={(v) => setFilter("outcome", v)}
            />
            <FacetSelect
              label="Error"
              value={filters.errorName}
              options={facets?.errorNames ?? []}
              onChange={(v) => setFilter("errorName", v)}
            />
            <label className={styles["save-input"]}>
              <span>Save id</span>
              <input
                type="text"
                value={filters.saveId}
                onChange={(e) => setFilter("saveId", e.target.value)}
                placeholder="abc12345"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className={styles["clear-button"]}
              onClick={clearFilters}
              disabled={
                !filters.kind &&
                !filters.source &&
                !filters.outcome &&
                !filters.errorName &&
                !filters.saveId
              }
            >
              Clear filters
            </button>
          </div>

          <div className={styles.scroll}>
            {rows && rows.length === 0 ? (
              <p className={styles.empty}>No events match these filters.</p>
            ) : null}
            {rows && rows.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Source / Op</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th>Save</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <EventRowItem key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </>
      ) : (
        <div className={styles.scroll}>
          {failures && failures.length === 0 ? (
            <p className={styles.empty}>No failures in this window. Good.</p>
          ) : null}
          {failures && failures.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Error</th>
                  <th>Source</th>
                  <th>Op</th>
                  <th className={styles["num-col"]}>Count</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr
                    key={`${f.errorName ?? "_"}|${f.source ?? "_"}|${f.op ?? "_"}`}
                  >
                    <td className={styles["mono-cell"]}>
                      {f.errorName ?? "—"}
                    </td>
                    <td>{f.source ? getSourceLabel(f.source) : "—"}</td>
                    <td className={styles["mono-cell"]}>{f.op ?? "—"}</td>
                    <td
                      className={styles["num-col"]}
                      title="Click to view matching events"
                    >
                      <button
                        type="button"
                        className={styles["count-button"]}
                        onClick={() => {
                          setMode("recent");
                          setFilters({
                            kind: null,
                            source: f.source,
                            outcome: "failed",
                            errorName: f.errorName,
                            saveId: "",
                          });
                          if (f.op)
                            setFilter("kind", "pipeline.task.completed");
                        }}
                      >
                        {f.count}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      )}
    </Dialog.Content>
  );
}

function EventRowItem({ row }: { row: EventRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className={styles.row}
        data-outcome={row.outcome}
        onClick={() => setExpanded((p) => !p)}
      >
        <td className={styles["time-cell"]}>{formatTime(row.ts)}</td>
        <td className={styles["mono-cell"]}>{shortKind(row.kind)}</td>
        <td>
          {row.source ? getSourceLabel(row.source) : "—"}
          {row.op ? <span className={styles.op}>{` · ${row.op}`}</span> : null}
        </td>
        <td>
          <span className={styles["outcome-pill"]} data-outcome={row.outcome}>
            {row.outcome}
          </span>
        </td>
        <td className={styles["num-col"]}>
          {row.durationMs != null ? formatDuration(row.durationMs) : "—"}
        </td>
        <td className={styles["mono-cell"]}>
          {row.saveId ? row.saveId.slice(0, 8) : "—"}
        </td>
        <td
          className={styles["error-cell"]}
          title={row.errorMessage ?? undefined}
        >
          {row.errorName ?? ""}
        </td>
      </tr>
      {expanded ? (
        <tr className={styles["payload-row"]}>
          <td colSpan={7}>
            <pre className={styles.payload}>
              {JSON.stringify(row.payload, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

interface FacetSelectProps {
  label: string;
  value: string | null;
  options: FacetEntry[];
  onChange: (v: string | null) => void;
  labelFor?: (v: string) => string;
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
  labelFor,
}: FacetSelectProps) {
  return (
    <label className={styles["facet-select"]}>
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {`${labelFor ? labelFor(o.value) : o.value} (${o.count})`}
          </option>
        ))}
      </select>
    </label>
  );
}

function shortKind(kind: EventRow["kind"]): string {
  switch (kind) {
    case "pipeline.task.completed":
      return "task";
    case "sync.run.completed":
      return "sync";
    case "save.ingest.completed":
      return "ingest";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60 * 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / (60 * 60_000)).toFixed(1)}h`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return sameDay
    ? time
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export const ActivityDialog = { Content };
