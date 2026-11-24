import { IconMagnifier } from "@pond/icons";
import { domainFromUrl } from "@pond/schema/domain";
import { Button, Empty, EmptyPreview, Input, Popover, Tooltip } from "@pond/ui";
import { type ReactElement, useEffect, useState } from "react";
import { SaveTile } from "@/features/saves";
import { ensureSaves, useSave } from "@/features/saves/pool";
import styles from "./styles.module.css";

const LIMIT = 48;

async function findSaveIds(query: string): Promise<string[]> {
  const q = query.trim();
  const ids = q
    ? (await window.pond.query("saves.searchFts", { q, limit: LIMIT })).ids
    : (await window.pond.query("saves.listPage", { limit: LIMIT })).rows.map(
        (row) => row.id,
      );
  await ensureSaves(ids);
  return ids;
}

interface PickerProps {
  onCanvas: ReadonlySet<string>;
  onAdd(saveIds: string[]): void;
}

interface AddSavesProps extends PickerProps {
  children: ReactElement;
  label?: string;
}

export function AddSaves({
  onCanvas,
  onAdd,
  children,
  label = "Add Saves",
}: AddSavesProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label={label} side="top">
        <Popover.Trigger render={children} aria-label={label} />
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="top" align="center" sideOffset={10}>
          <Popover.Popup className={styles.popup} aria-label="Add Saves">
            <Picker
              onCanvas={onCanvas}
              onAdd={(ids) => {
                onAdd(ids);
                setOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Picker({ onCanvas, onAdd }: PickerProps) {
  const [query, setQuery] = useState("");
  const [ids, setIds] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(
      () => {
        void findSaveIds(query)
          .then((next) => {
            if (live) setIds(next);
          })
          .catch(() => {
            if (live) setIds([]);
          });
      },
      query ? 150 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );

  return (
    <>
      <Input.Root size="sm" variant="secondary">
        <Input.Icon>
          <IconMagnifier size={12} />
        </Input.Icon>
        <Input.Field
          autoFocus
          aria-label="Search saves"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </Input.Root>
      {ids && ids.length === 0 ? (
        <Empty.Root size="card" className={styles.empty}>
          <Empty.Media>
            <EmptyPreview.Root kind="field" layout="single">
              <EmptyPreview.Row>
                <EmptyPreview.Icon>
                  <IconMagnifier size={12} />
                </EmptyPreview.Icon>
                <EmptyPreview.Line width={30} />
                <EmptyPreview.Line width={44} tone="mid" />
              </EmptyPreview.Row>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>
            {query.trim() ? `No Results for “${query.trim()}”` : "No Saves Yet"}
          </Empty.Title>
        </Empty.Root>
      ) : (
        <ul
          className={styles.grid}
          data-loading={ids ? undefined : true}
          data-scroll-fade="vertical"
        >
          {ids?.map((id) => (
            <Choice
              key={id}
              id={id}
              placed={onCanvas.has(id)}
              picked={picked.includes(id)}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}
      <Button
        size="sm"
        variant="secondary"
        width="full"
        disabled={!picked.length}
        onClick={() => onAdd(picked)}
      >
        {picked.length > 1 ? `Add ${picked.length} Saves` : "Add Save"}
      </Button>
    </>
  );
}

interface ChoiceProps {
  id: string;
  placed: boolean;
  picked: boolean;
  onToggle(id: string): void;
}

function Choice({ id, placed, picked, onToggle }: ChoiceProps) {
  const save = useSave(id);
  if (!save) return null;
  const title =
    save.title?.trim() ||
    (save.url ? domainFromUrl(save.url) : null) ||
    "Untitled";
  return (
    <SaveTile
      saveId={id}
      selected={picked}
      dimmed={placed}
      detail={placed ? "On this canvas" : undefined}
      width={120}
      aria-label={title}
      aria-pressed={picked}
      disabled={placed}
      onClick={() => onToggle(id)}
    />
  );
}
