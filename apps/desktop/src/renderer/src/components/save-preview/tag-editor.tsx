import { normalizeLabelName } from "@pond/schema/label-name";
import { Input } from "@pond/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

interface CanonTag {
  name: string;
  color: string | null;
  description: string | null;
}

export function TagEditor({ save }: { save: Save }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [canonical, setCanonical] = useState<CanonTag[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.pond
      .query("tags.list", {})
      .then((rows) => {
        if (cancelled) return;
        const list = (rows as CanonTag[]).map((r) => ({
          name: r.name,
          color: r.color ?? null,
          description: r.description ?? null,
        }));
        setCanonical(list);
      })
      .catch(() => {
        if (!cancelled) setCanonical([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canonicalByLower = useMemo(() => {
    const map = new Map<string, CanonTag>();
    for (const t of canonical) map.set(t.name.toLowerCase(), t);
    return map;
  }, [canonical]);

  const suggestions = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    if (!needle) return [] as CanonTag[];
    const have = new Set(save.tags.map((t) => t.toLowerCase()));
    return canonical
      .filter(
        (t) =>
          !have.has(t.name.toLowerCase()) &&
          t.name.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [draft, canonical, save.tags]);

  async function commit(name: string) {
    const cleaned = normalizeLabelName(name);
    if (!cleaned) return;
    if (save.tags.some((t) => t.toLowerCase() === cleaned)) {
      setDraft("");
      return;
    }
    setBusy(true);
    try {
      await window.pond.query("tags.setForSave", {
        saveId: save.id,
        tags: [...save.tags, cleaned],
      });
      setDraft("");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function remove(name: string) {
    setBusy(true);
    try {
      await window.pond.query("tags.setForSave", {
        saveId: save.id,
        tags: save.tags.filter((t) => t.toLowerCase() !== name.toLowerCase()),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.tags}>
      {save.tags.map((tag) => {
        const meta = canonicalByLower.get(tag.toLowerCase());
        const color = meta?.color ?? null;
        return (
          <span key={tag} className={styles["tag-wrap"]}>
            <Link
              to={`/?tag=${encodeURIComponent(tag)}`}
              className={styles.tag}
              title={meta?.description ?? "Filter library by this tag"}
            >
              {color ? (
                <span
                  className={styles["tag-dot"]}
                  style={{ background: color }}
                  aria-hidden
                />
              ) : null}
              #{tag}
            </Link>
            <button
              type="button"
              className={styles["tag-remove"]}
              onClick={() => void remove(tag)}
              aria-label={`Remove tag ${tag}`}
              title="Remove tag"
            >
              ×
            </button>
          </span>
        );
      })}
      <Input
        ref={inputRef}
        data-size="sm"
        placeholder="Add tag…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={styles["tag-input"]}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            void commit(draft);
          } else if (
            e.key === "Backspace" &&
            draft === "" &&
            save.tags.length > 0
          ) {
            const last = save.tags[save.tags.length - 1];
            if (last) void remove(last);
          } else if (e.key === "Tab" && suggestions[0]) {
            e.preventDefault();
            void commit(suggestions[0].name);
          }
        }}
        disabled={busy}
      />
      {suggestions.length > 0 ? (
        <div className={styles["tag-suggestions"]}>
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              className={styles.tag}
              onClick={() => void commit(s.name)}
              title={s.description ?? undefined}
            >
              {s.color ? (
                <span
                  className={styles["tag-dot"]}
                  style={{ background: s.color }}
                  aria-hidden
                />
              ) : null}
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
