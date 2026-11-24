import { Button, Checkbox, Dialog } from "@pond/ui";
import { useEffect, useId, useMemo, useState } from "react";
import { folders } from "@/features/library/state/folders";
import { TagMenu } from "@/features/tags";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

function tagKeys(names: ReadonlyArray<string>) {
  return new Set(names.map((name) => name.toLowerCase()));
}

export function AutomaticTagsDialog({
  folderId,
  folderName,
  onClose,
}: {
  folderId: string;
  folderName: string;
  onClose: () => void;
}) {
  const checkboxId = useId();
  const [tagPicker] = usePrefs("tagPicker");
  const [selected, setSelected] = useState<Array<string>>([]);
  const [initial, setInitial] = useState<Array<string>>([]);
  const [inherited, setInherited] = useState<Array<string>>([]);
  const [applyExisting, setApplyExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedKeys = useMemo(() => tagKeys(selected), [selected]);
  const initialKeys = useMemo(() => tagKeys(initial), [initial]);
  const changed =
    applyExisting ||
    selectedKeys.size !== initialKeys.size ||
    [...selectedKeys].some((key) => !initialKeys.has(key));

  useEffect(() => {
    let active = true;
    void window.pond
      .query("folders.rules.get", { id: folderId })
      .then((result) => {
        if (!active) {
          return;
        }
        setSelected(result.tags);
        setInitial(result.tags);
        setInherited(result.inheritedTags);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(
            "Couldn't load automatic tags. Close this dialog and try again.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [folderId]);

  function toggle(name: string) {
    if (loading || busy) {
      return;
    }
    const key = name.toLowerCase();
    setSelected((current) =>
      current.some((item) => item.toLowerCase() === key)
        ? current.filter((item) => item.toLowerCase() !== key)
        : [...current, name],
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await window.pond.query("folders.rules.set", {
        id: folderId,
        tags: selected,
        applyExisting,
      });
      await folders.refresh();
      onClose();
    } catch {
      setError("Couldn't save automatic tags. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Automatic Tags</Dialog.Title>
          </Dialog.Header>
          <Dialog.Description>
            {`Add these tags when Saves enter ${folderName} or its subfolders. Removing a Save from a folder keeps its tags.`}
          </Dialog.Description>
          <Dialog.Content className={styles.content}>
            <div className={styles.menu}>
              <TagMenu
                appliedKeys={selectedKeys}
                onToggle={toggle}
                allowCreate
                showCounts={false}
                layout={tagPicker.layout}
                gridSize={tagPicker.gridSize}
                showStarred={tagPicker.showStarred}
                showRecently={tagPicker.showRecently}
                showRecommended={false}
              />
            </div>
            {inherited.length ? (
              <p className={styles.hint}>
                Inherited from parent folders: {inherited.join(", ")}
              </p>
            ) : null}
            <label className={styles.option} htmlFor={checkboxId}>
              <Checkbox.Root
                id={checkboxId}
                checked={applyExisting}
                onCheckedChange={setApplyExisting}
                disabled={busy || loading}
              >
                <Checkbox.Indicator />
              </Checkbox.Root>
              <span>
                Apply to Saves already in this folder and its subfolders
              </span>
            </label>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel disabled={busy} />
            <Button
              type="button"
              variant="primary"
              disabled={busy || loading || !changed}
              loading={busy}
              onClick={() => void save()}
            >
              Save
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
