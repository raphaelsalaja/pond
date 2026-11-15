import { IconMagnifier } from "@pond/icons";
import { Button, Empty, Input, Settings } from "@pond/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import {
  chordGlyphs,
  isRecordable,
  isShortcutId,
  isValidShortcut,
  resolveShortcuts,
  type ShortcutId,
  shortcutConflict,
} from "@/shared/lib/shortcuts";
import { savePrefsSection, usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function ShortcutSettings({
  only,
  disabled = false,
  renderList,
}: {
  only?: readonly ShortcutId[];
  disabled?: boolean;
  renderList?: (rows: ReactNode) => ReactNode;
} = {}) {
  const [preferences, , loaded] = usePrefs("shortcuts");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [error, setError] = useState("");
  const [nativeErrors, setNativeErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void window.pond
      .query("settings.globalShortcutStatus", {})
      .then((status) => {
        if (active) setNativeErrors(status.errors);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const patch = async (delta: Partial<typeof preferences>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await savePrefsSection("shortcuts", delta);
      setRecording(null);
      await window.pond
        .query("settings.globalShortcutStatus", {})
        .then((status) => setNativeErrors(status.errors))
        .catch(() => {
          setNativeErrors([
            "Couldn't check global shortcut availability. Reopen Hotkeys to retry.",
          ]);
        });
    } catch (reason) {
      setError(
        errorCopy(
          reason,
          "Couldn't change this shortcut. Your previous shortcut is unchanged.",
        ),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const current = loaded
    ? preferences
    : { profile: "pond" as const, overrides: {} };
  const bindings = resolveShortcuts(current);
  const defaults = resolveShortcuts({ ...current, overrides: {} });
  const matching = Object.keys(bindings)
    .filter(isShortcutId)
    .filter(
      (id) =>
        (only ? only.includes(id) : isRecordable(bindings[id])) &&
        `${bindings[id].group} ${bindings[id].label}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const groups = new Map<string, ShortcutId[]>();
  for (const id of matching) {
    const group = bindings[id].group;
    const ids = groups.get(group) ?? [];
    ids.push(id);
    groups.set(group, ids);
  }

  const renderRows = (ids: ShortcutId[]) =>
    ids.map((id) => (
      <Settings.Item
        className={styles.row}
        key={id}
        id={`setting-shortcuts-${id}`}
      >
        <Settings.ItemDetails>
          <Settings.ItemTitle>{bindings[id].label}</Settings.ItemTitle>
        </Settings.ItemDetails>
        <Settings.ItemControl className={styles.controls}>
          <Input.Root className={styles.recorder} variant="secondary">
            <Input.Field
              readOnly
              placeholder="Record Shortcut"
              disabled={!loaded || pending || disabled}
              aria-label={`Change ${bindings[id].label} shortcut`}
              value={
                recording === id
                  ? "Press keys"
                  : chordGlyphs(bindings[id].keys ?? "").join(" ")
              }
              onFocus={() => {
                setRecording(id);
                setError("");
              }}
              onClick={() => {
                setRecording(id);
                setError("");
              }}
              onKeyDown={(event) => {
                if (recording !== id || pendingRef.current) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Escape") {
                  setRecording(null);
                  return;
                }
                if (["Meta", "Control", "Alt", "Shift"].includes(event.key))
                  return;
                const key = event.code.startsWith("Digit")
                  ? event.code.slice(5)
                  : event.code.startsWith("Key")
                    ? event.code.slice(3)
                    : event.code === "Space"
                      ? "Space"
                      : event.key;
                const keys = [
                  event.metaKey ? "Meta" : null,
                  event.ctrlKey ? "Control" : null,
                  event.altKey ? "Alt" : null,
                  event.shiftKey ? "Shift" : null,
                  key,
                ]
                  .filter(Boolean)
                  .join("+");
                if (!isValidShortcut(keys)) {
                  setError("Choose a supported key combination.");
                  return;
                }
                const conflict = shortcutConflict(id, keys, current);
                if (conflict) {
                  setError(
                    `Already used by ${conflict}. Choose another shortcut.`,
                  );
                  return;
                }
                void patch({
                  overrides: {
                    ...current.overrides,
                    [id]: keys,
                  },
                });
              }}
            />
          </Input.Root>
          {current.overrides[id] ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${defaults[id].keys ? "Reset" : "Clear"} ${bindings[id].label} shortcut`}
              disabled={pending || disabled}
              onClick={() => {
                const overrides = { ...current.overrides };
                delete overrides[id];
                void patch({ overrides });
              }}
            >
              {defaults[id].keys ? "Reset" : "Clear"}
            </Button>
          ) : null}
        </Settings.ItemControl>
      </Settings.Item>
    ));

  return (
    <div className={styles.root}>
      {!only && (
        <Input.Root size="md">
          <Input.Icon>
            <IconMagnifier size={12} />
          </Input.Icon>
          <Input.Field
            aria-label="Search shortcuts"
            placeholder="Search…"
            value={search}
            onValueChange={setSearch}
          />
        </Input.Root>
      )}
      {nativeErrors.map((message) => (
        <p className={styles.error} role="alert" key={message}>
          {message}
        </p>
      ))}
      {groups.size > 0 ? (
        <div className={styles.groups}>
          {[...groups].map(([group, ids]) => (
            <Settings.Section key={group}>
              {!only && (
                <Settings.SectionTitle>
                  {group} ({ids.length})
                </Settings.SectionTitle>
              )}
              {renderList ? (
                renderList(renderRows(ids))
              ) : (
                <Settings.List>{renderRows(ids)}</Settings.List>
              )}
            </Settings.Section>
          ))}
        </div>
      ) : (
        <Empty.Root>
          <Empty.Title>No shortcuts found</Empty.Title>
        </Empty.Root>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
