import { Input } from "@pond/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function TagEditor({ save }: { save: Save }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.pond
      .query("tags.allFromSaves", {})
      .then((rows) => {
        if (cancelled) return;
        const names = (rows as Array<{ name: string }>).map((r) => r.name);
        setAllTags(names);
      })
      .catch(() => {
        if (!cancelled) setAllTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    if (!needle) return [] as string[];
    const have = new Set(save.tags.map((t) => t.toLowerCase()));
    return allTags
      .filter(
        (t) => !have.has(t.toLowerCase()) && t.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [draft, allTags, save.tags]);

  async function commit(name: string) {
    const cleaned = name
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase();
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
      {save.tags.map((tag) => (
        <span key={tag} className={styles["tag-wrap"]}>
          <Link
            to={`/?tag=${encodeURIComponent(tag)}`}
            className={styles.tag}
            title="Filter library by this tag"
          >
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
      ))}
      {save.aiTags
        .filter(
          (t) => !save.tags.some((s) => s.toLowerCase() === t.toLowerCase()),
        )
        .map((tag) => (
          <button
            key={`ai-${tag}`}
            type="button"
            className={`${styles.tag} ${styles["tag-ai"]}`}
            onClick={() => void commit(tag)}
            title="AI suggestion — click to accept"
          >
            #{tag}
          </button>
        ))}
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
            void commit(suggestions[0]);
          }
        }}
        disabled={busy}
      />
      {suggestions.length > 0 ? (
        <div className={styles["tag-suggestions"]}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.tag}
              onClick={() => void commit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
