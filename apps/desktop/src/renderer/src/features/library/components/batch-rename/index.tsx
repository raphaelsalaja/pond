import {
  Button,
  Dialog,
  Field,
  Input,
  Table,
  Toggle,
  ToggleGroup,
} from "@pond/ui";
import {
  applyRenameTemplate,
  literalReplacement,
} from "@shared/rename-template";
import type { RenameOptions, RenameTextCase } from "@shared/rename-template";
import { useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import styles from "./styles.module.css";

export interface BatchRenameItem {
  id: string;
  name: string;
  original?: string;
  date?: Date | number | string | null;
  tags?: ReadonlyArray<string>;
  preview?: ReactNode;
}

export interface BatchRenameToken {
  token: string;
  label: string;
}

export interface BatchRenameRequest extends RenameOptions {
  ids: Array<string>;
  pattern: string;
}

type Mode = "format" | "replace";
type CaseChoice = RenameTextCase | "keep";
type RowStatus = "changed" | "unchanged" | "empty" | "repeated";

const NUMBER_TOKEN = /\{n(?::\d{1,2})?\}/;

const CASES: ReadonlyArray<{ value: CaseChoice; text: string; label: string }> =
  [
    { value: "keep", text: "Keep", label: "Keep Case" },
    { value: "upper", text: "AG", label: "Uppercase" },
    { value: "lower", text: "ag", label: "Lowercase" },
    { value: "title", text: "Ag", label: "Title Case" },
  ];

function marked(text: string, needle: string, tone: "find" | "replace") {
  if (!needle || !text.includes(needle)) {
    return text;
  }
  const parts: Array<ReactNode> = [];
  let offset = 0;
  for (const [index, part] of text.split(needle).entries()) {
    if (index > 0) {
      parts.push(
        <mark key={offset} className={styles.mark} data-tone={tone}>
          {needle}
        </mark>,
      );
      offset += needle.length;
    }
    parts.push(part);
    offset += part.length;
  }
  return parts;
}

export function BatchRenameDialog({
  open,
  noun,
  items,
  tokens,
  defaultPattern,
  onRename,
  onClose,
}: {
  open: boolean;
  noun: { one: string; other: string };
  items: ReadonlyArray<BatchRenameItem>;
  tokens: ReadonlyArray<BatchRenameToken>;
  defaultPattern: string;
  onRename: (request: BatchRenameRequest) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const patternRef = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("format");
  const [pattern, setPattern] = useState(defaultPattern);
  const [start, setStart] = useState("1");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [textCase, setTextCase] = useState<CaseChoice>("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [triedUnchanged, setTriedUnchanged] = useState(false);

  const numbered = mode === "format" && NUMBER_TOKEN.test(pattern);
  const startAt = Math.max(0, Number.parseInt(start, 10) || 0);
  const request = useMemo<Omit<BatchRenameRequest, "ids">>(
    () => ({
      pattern: mode === "format" ? pattern.trim() : "{title}",
      start: numbered ? startAt : undefined,
      replacement:
        mode === "replace" && find ? literalReplacement(find, replace) : null,
      textCase: textCase === "keep" ? null : textCase,
    }),
    [find, mode, numbered, pattern, replace, startAt, textCase],
  );

  const rows = useMemo(() => {
    const names = items.map((item, index) =>
      applyRenameTemplate(request.pattern, {
        ...request,
        index,
        id: item.id,
        title: item.name,
        original: item.original ?? item.name,
        date: item.date,
        tags: item.tags,
      }),
    );
    const counts = new Map<string, number>();
    for (const name of names) {
      const key = name.toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return items.map((item, index) => {
      const name = names[index] ?? "";
      const status: RowStatus = !name
        ? "empty"
        : name === item.name
          ? "unchanged"
          : (counts.get(name.toLocaleLowerCase()) ?? 0) > 1
            ? "repeated"
            : "changed";
      return { item, name, status };
    });
  }, [items, request]);

  const changed = rows.filter(
    (row) => row.status === "changed" || row.status === "repeated",
  ).length;
  const previews = items.some((item) => Boolean(item.preview));
  const filled =
    mode === "replace" ? find.length > 0 : request.pattern.length > 0;

  function insertToken(token: string) {
    const input = patternRef.current;
    const from = input?.selectionStart ?? pattern.length;
    const to = input?.selectionEnd ?? pattern.length;
    const before = pattern.slice(0, from);
    const gap = before && !/\s$/.test(before) ? " " : "";
    const caret = before.length + gap.length + token.length;
    setPattern(`${before}${gap}${token}${pattern.slice(to)}`);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  }

  async function submit() {
    if (busy) return;
    if (!filled) {
      setMissing(true);
      (mode === "replace" ? findRef : patternRef).current?.focus();
      return;
    }
    if (changed === 0) {
      setTriedUnchanged(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename({
        ...request,
        ids: items.map((item) => item.id),
      });
    } catch (error_) {
      setError(
        errorCopy(
          error_,
          `Couldn't rename these ${noun.other.toLowerCase()}. Try again.`,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>{`Rename ${formatPlural(items.length, noun)}`}</Dialog.Title>
            </Dialog.Header>
            <div className={styles.body}>
              <fieldset className={styles.options} disabled={busy}>
                <legend className={styles.hidden}>Options</legend>
                <ToggleGroup
                  className={styles.segment}
                  aria-label="Rename mode"
                  value={[mode]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (next === "format" || next === "replace") setMode(next);
                  }}
                >
                  <Toggle type="button" size="sm" value="format">
                    Format
                  </Toggle>
                  <Toggle type="button" size="sm" value="replace">
                    Replace Text
                  </Toggle>
                </ToggleGroup>
                {mode === "format" ? (
                  <>
                    <Field.Root
                      className={styles.field}
                      invalid={(missing && !filled) || undefined}
                    >
                      <Field.Label>Name</Field.Label>
                      <Input.Root size="sm">
                        <Field.Control
                          render={
                            <Input.Field
                              ref={patternRef}
                              autoFocus
                              spellCheck={false}
                            />
                          }
                          value={pattern}
                          onValueChange={setPattern}
                        />
                      </Input.Root>
                      {missing && !filled ? (
                        <Field.Error match>Enter a name format.</Field.Error>
                      ) : null}
                      <fieldset className={styles.tokens}>
                        <legend className={styles.hidden}>
                          Insert into Name
                        </legend>
                        {tokens.map(({ token, label }) => (
                          <Button
                            key={token}
                            type="button"
                            size="xs"
                            variant="secondary"
                            disabled={
                              token === "{n}"
                                ? NUMBER_TOKEN.test(pattern)
                                : pattern.includes(token)
                            }
                            onClick={() => insertToken(token)}
                          >
                            {label}
                          </Button>
                        ))}
                      </fieldset>
                    </Field.Root>
                    {numbered ? (
                      <Field.Root className={styles.field}>
                        <Field.Label>Start Numbering At</Field.Label>
                        <Input.Root size="sm">
                          <Field.Control
                            render={
                              <Input.Field
                                type="number"
                                min={0}
                                inputMode="numeric"
                              />
                            }
                            value={start}
                            onValueChange={setStart}
                          />
                        </Input.Root>
                      </Field.Root>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Field.Root
                      className={styles.field}
                      invalid={(missing && !filled) || undefined}
                    >
                      <Field.Label>Find</Field.Label>
                      <Input.Root size="sm">
                        <Field.Control
                          render={
                            <Input.Field
                              ref={findRef}
                              autoFocus
                              maxLength={200}
                              spellCheck={false}
                            />
                          }
                          value={find}
                          onValueChange={setFind}
                        />
                      </Input.Root>
                      {missing && !filled ? (
                        <Field.Error match>Enter the text to find.</Field.Error>
                      ) : null}
                    </Field.Root>
                    <Field.Root className={styles.field}>
                      <Field.Label>Replace With</Field.Label>
                      <Input.Root size="sm">
                        <Field.Control
                          render={
                            <Input.Field maxLength={200} spellCheck={false} />
                          }
                          value={replace}
                          onValueChange={setReplace}
                        />
                      </Input.Root>
                    </Field.Root>
                  </>
                )}
                <div className={styles.field}>
                  <span id={`${id}-case`} className={styles.label}>
                    Text Case
                  </span>
                  <ToggleGroup
                    className={styles.segment}
                    aria-labelledby={`${id}-case`}
                    value={[textCase]}
                    onValueChange={(value) => {
                      const next = CASES.find(
                        (entry) => entry.value === value[0],
                      );
                      if (next) setTextCase(next.value);
                    }}
                  >
                    {CASES.map((entry) => (
                      <Toggle
                        key={entry.value}
                        type="button"
                        size="sm"
                        value={entry.value}
                        aria-label={entry.label}
                        title={entry.label}
                      >
                        {entry.text}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                </div>
              </fieldset>
              <div className={styles.preview} data-scroll-fade="vertical">
                <Table.Root
                  className={styles.table}
                  containerClassName={styles.container}
                >
                  <Table.Header>
                    <Table.Row className={styles.head}>
                      {previews ? (
                        <Table.Head className={styles.thumb}>
                          <span className={styles.hidden}>Preview</span>
                        </Table.Head>
                      ) : null}
                      <Table.Head>Current Name</Table.Head>
                      <Table.Head>New Name</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {rows.map(({ item, name, status }) => (
                      <Table.Row
                        key={item.id}
                        className={styles.row}
                        data-status={status}
                      >
                        {previews ? (
                          <Table.Cell className={styles.thumb}>
                            {item.preview}
                          </Table.Cell>
                        ) : null}
                        <Table.Cell className={styles.name}>
                          {mode === "replace"
                            ? marked(item.name, find, "find")
                            : item.name}
                        </Table.Cell>
                        <Table.Cell className={styles.next}>
                          {status === "empty"
                            ? "Skipped, the new name is empty"
                            : mode === "replace" && textCase === "keep"
                              ? marked(name, replace, "replace")
                              : name}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </div>
            <Dialog.Footer
              leading={
                error || (triedUnchanged && changed === 0) ? (
                  <p className={styles.error} role="alert">
                    {error ?? "No names change with these settings."}
                  </p>
                ) : undefined
              }
            >
              <Dialog.Cancel disabled={busy} />
              <Button type="submit" loading={busy}>
                Rename
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
