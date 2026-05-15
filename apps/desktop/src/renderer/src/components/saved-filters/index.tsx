import {
  IconCheckOutline18,
  IconDotsOutline18,
  IconFiltersOutline18,
  IconPenOutline18,
  IconPlusOutline18,
  IconTrashXmarkOutline18,
} from "@pond/icons/outline/18";
import type { SavedFilterView } from "@pond/schema/db";
import { Input, Menu, Tooltip } from "@pond/ui";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePrefs } from "@/pool/prefs";
import {
  applyFilterParams,
  extractFilterParams,
  filterParamsEqual,
} from "./helpers";
import styles from "./styles.module.css";

function Root() {
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [views, setViews] = usePrefs("views");
  const saved = views.saved ?? [];

  const currentParams = useMemo(() => extractFilterParams(params), [params]);
  const hasActive = Object.keys(currentParams).length > 0;
  const alreadySaved = saved.some((v) =>
    filterParamsEqual(v.params, currentParams),
  );

  function applyView(view: SavedFilterView) {
    const next = applyFilterParams(params, view.params);
    navigate({ pathname: "/", search: `?${next.toString()}` });
    setOpen(false);
  }

  function addView(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !hasActive) return;
    const entry: SavedFilterView = {
      id: crypto.randomUUID(),
      name: trimmed,
      params: currentParams,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setViews({ saved: [...saved, entry] });
  }

  function renameView(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews({
      saved: saved.map((v) =>
        v.id === id ? { ...v, name: trimmed, updatedAt: Date.now() } : v,
      ),
    });
  }

  function deleteView(id: string) {
    setViews({ saved: saved.filter((v) => v.id !== id) });
  }

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Root content="Saved filters" side="bottom">
        <Menu.Trigger
          render={
            <button
              type="button"
              aria-label="Saved filters"
              className={styles.trigger}
              data-active={saved.length > 0 ? "true" : undefined}
            >
              <IconFiltersOutline18 width="0.95em" height="0.95em" />
            </button>
          }
        />
      </Tooltip.Root>
      <Menu.Portal>
        <Menu.Positioner align="end" side="bottom" sideOffset={6}>
          <Menu.Popup className={styles.popover}>
            <SavedList
              saved={saved}
              activeParams={currentParams}
              hasActive={hasActive}
              alreadySaved={alreadySaved}
              onApply={applyView}
              onSave={addView}
              onRename={renameView}
              onDelete={deleteView}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface SavedListProps {
  saved: SavedFilterView[];
  activeParams: Record<string, string>;
  hasActive: boolean;
  alreadySaved: boolean;
  onApply: (view: SavedFilterView) => void;
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function SavedList({
  saved,
  activeParams,
  hasActive,
  alreadySaved,
  onApply,
  onSave,
  onRename,
  onDelete,
}: SavedListProps) {
  const [query, setQuery] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((v) => v.name.toLowerCase().includes(q));
  }, [saved, query]);

  function commitNew() {
    if (savingName === null) return;
    onSave(savingName);
    setSavingName(null);
  }

  function isApplied(view: SavedFilterView): boolean {
    return filterParamsEqual(view.params, activeParams);
  }

  return (
    <div className={styles.body}>
      <div className={styles["search-wrap"]}>
        <Input
          type="search"
          placeholder="Search…"
          value={query}
          autoFocus
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.search}
        />
      </div>

      <div className={styles.list}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>
            {saved.length === 0 ? "No saved filters yet." : "No matches."}
          </p>
        ) : (
          filtered.map((view) => (
            <Row
              key={view.id}
              view={view}
              applied={isApplied(view)}
              onApply={() => onApply(view)}
              onRename={(name) => onRename(view.id, name)}
              onDelete={() => onDelete(view.id)}
            />
          ))
        )}
      </div>

      {hasActive && !alreadySaved ? (
        <div className={styles.footer}>
          {savingName === null ? (
            <button
              type="button"
              className={styles["footer-action"]}
              onClick={() => setSavingName("")}
            >
              <span className={styles["footer-icon"]} aria-hidden>
                <IconPlusOutline18 width="0.85em" height="0.85em" />
              </span>
              Save this filter
            </button>
          ) : (
            <Input
              autoFocus
              type="text"
              placeholder="Filter name"
              value={savingName}
              spellCheck={false}
              className={styles["footer-input"]}
              onChange={(e) => setSavingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNew();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setSavingName(null);
                }
              }}
              onBlur={commitNew}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

interface RowProps {
  view: SavedFilterView;
  applied: boolean;
  onApply: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function Row({ view, applied, onApply, onRename, onDelete }: RowProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(view.name);
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename() {
    setDraftName(view.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    if (draftName.trim() && draftName.trim() !== view.name) {
      onRename(draftName);
    }
    setRenaming(false);
  }

  function cancelRename() {
    setDraftName(view.name);
    setRenaming(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  return (
    <div className={styles.row} data-applied={applied || undefined}>
      {renaming ? (
        <div className={styles["row-input-wrap"]}>
          <span className={styles["row-icon"]} aria-hidden>
            <IconFiltersOutline18 width="0.9em" height="0.9em" />
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles["row-input"]}
            value={draftName}
            spellCheck={false}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
          />
        </div>
      ) : (
        <button
          type="button"
          className={styles["row-main"]}
          onClick={onApply}
          aria-pressed={applied}
        >
          <span className={styles["row-icon"]} aria-hidden>
            <IconFiltersOutline18 width="0.9em" height="0.9em" />
          </span>
          <span className={styles["row-label"]}>{view.name}</span>
          {applied ? (
            <span className={styles["row-check"]} aria-hidden>
              <IconCheckOutline18 width="0.85em" height="0.85em" />
            </span>
          ) : null}
        </button>
      )}

      {!renaming ? (
        <RowMenu onRename={startRename} onDelete={onDelete} />
      ) : null}
    </div>
  );
}

interface RowMenuProps {
  onRename: () => void;
  onDelete: () => void;
}

function RowMenu({ onRename, onDelete }: RowMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            aria-label="More actions"
            className={styles["row-menu-trigger"]}
          >
            <IconDotsOutline18 width="0.9em" height="0.9em" />
          </button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end" side="bottom" sideOffset={4}>
          <Menu.Popup className={styles.menu}>
            <Menu.Item onClick={onRename}>
              <Menu.ItemIcon>
                <IconPenOutline18 width="0.9em" height="0.9em" />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Rename</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item
              data-variant="danger"
              className={styles["menu-item-danger"]}
              onClick={onDelete}
            >
              <Menu.ItemIcon>
                <IconTrashXmarkOutline18 width="0.9em" height="0.9em" />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Delete</Menu.ItemLabel>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export const SavedFilters = {
  Root,
};
