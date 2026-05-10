import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./styles.module.css";

export interface ActivityRow {
  id: number;
  batch_id: string | null;
  model_name: string;
  model_id: string;
  action: "I" | "U" | "D" | "A";
  data: unknown;
  prev_data: unknown;
  actor: "user" | "ai" | "system";
  actor_reason: string | null;
  created_at: string | number;
}

interface RootProps extends React.ComponentPropsWithoutRef<"ul"> {
  saveId: string | null;
  limit?: number;
}

function Root({ saveId, limit = 50, className, ...props }: RootProps) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.pond
      .query("saves.activity", { saveId, limit })
      .then((res) => {
        if (cancelled) return;
        setRows((res as ActivityRow[]) ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saveId, limit]);

  if (loading) return <p className={styles.empty}>Loading activity…</p>;
  if (rows.length === 0) {
    return <p className={styles.empty}>No activity yet.</p>;
  }

  return (
    <ul
      className={[styles.list, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    >
      {rows.map((row) => (
        <li key={row.id} className={styles.item}>
          <span className={styles.dot} data-actor={row.actor} aria-hidden />
          <div className={styles.body}>
            <span className={styles.summary}>
              {summary(row)}
              {!saveId ? (
                <Link to={`/save/${row.model_id}`} className={styles.link}>
                  {" "}
                  · open
                </Link>
              ) : null}
            </span>
            <span className={styles.time}>{formatRel(row.created_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const ActivityList = {
  Root,
};

function summary(row: ActivityRow): string {
  const actor = actorLabel(row.actor);
  if (row.actor_reason)
    return `${actor} ${row.actor_reason.replace(/-/g, " ")}`;
  switch (row.action) {
    case "I":
      return `${actor} created`;
    case "U":
      return `${actor} updated`;
    case "D":
      return `${actor} deleted`;
    case "A":
      return `${actor} archived/restored`;
  }
}

function actorLabel(actor: string): string {
  if (actor === "ai") return "AI";
  if (actor === "system") return "System";
  return "You";
}

function formatRel(t: string | number): string {
  const date = new Date(typeof t === "number" ? t : Date.parse(t));
  if (!Number.isFinite(date.getTime())) return "";
  const diff = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86_400 * 30) return `${Math.floor(diff / 86_400)}d ago`;
  return date.toLocaleDateString();
}
