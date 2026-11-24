import { IconPlus, IconXmark } from "@pond/icons";
import { Button, Dialog, Field, Input, Toggle, ToggleGroup } from "@pond/ui";
import {
  FishMcpSecretName,
  FishMcpServerDraft,
  FishMcpServerName,
} from "@shared/fish-mcp-contracts";
import type {
  FishMcpServerConfig,
  FishMcpServerStatus,
} from "@shared/fish-mcp-contracts";
import { useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

type Transport = FishMcpServerConfig["transport"];

interface SecretRow {
  key: number;
  name: string;
  value: string;
}

interface ServerDialogProps {
  initial?: FishMcpServerConfig;
  onClose: () => void;
  onSaved: (status: FishMcpServerStatus) => void;
}

function secretProblem(rows: Array<SecretRow>): string | null {
  const names = rows.flatMap((row) => {
    const trimmed = row.name.trim();
    return trimmed ? [trimmed] : [];
  });
  if (names.some((name) => !FishMcpSecretName.safeParse(name).success)) {
    return "Secret names use letters, numbers, dashes, and underscores.";
  }
  if (new Set(names).size !== names.length) {
    return "Give each secret a different name.";
  }
  return null;
}

export function ServerDialog({ initial, onClose, onSaved }: ServerDialogProps) {
  const stdio = initial?.transport === "stdio" ? initial : undefined;
  const saved = new Set(initial?.secretNames ?? []);
  const [name, setName] = useState(initial?.name ?? "");
  const [transport, setTransport] = useState<Transport>(
    initial?.transport ?? "stdio",
  );
  const [command, setCommand] = useState(stdio?.command ?? "");
  const [args, setArgs] = useState(stdio?.args.join("\n") ?? "");
  const [cwd, setCwd] = useState(stdio?.cwd ?? "");
  const [url, setUrl] = useState(
    initial?.transport === "http" ? initial.url : "",
  );
  const [secrets, setSecrets] = useState<Array<SecretRow>>(() =>
    (initial?.secretNames ?? []).map((secret, key) => ({
      key,
      name: secret,
      value: "",
    })),
  );
  const nextKey = useRef(secrets.length);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameCheck = FishMcpServerName.safeParse(name);
  const nameError =
    submitted && !nameCheck.success
      ? (nameCheck.error.issues[0]?.message ?? null)
      : null;

  function editSecret(key: number, patch: Partial<SecretRow>) {
    setSecrets((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function draft() {
    const base = {
      id: initial?.id,
      name: name.trim(),
      enabled: initial?.enabled ?? true,
      secretNames: secrets.map((row) => row.name.trim()).filter(Boolean),
      toolAccess: initial?.toolAccess ?? {},
    };
    return FishMcpServerDraft.safeParse(
      transport === "stdio"
        ? {
            ...base,
            transport,
            command: command.trim(),
            args: args
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            cwd: cwd.trim() || undefined,
          }
        : { ...base, transport, url: url.trim() },
    );
  }

  async function save() {
    setSubmitted(true);
    setError(null);
    if (!nameCheck.success) {
      return;
    }
    const problem = secretProblem(secrets);
    if (problem) {
      setError(problem);
      return;
    }
    const parsed = draft();
    if (!parsed.success) {
      setError(
        transport === "stdio"
          ? "Enter the command that starts the server."
          : "Enter an http or https URL.",
      );
      return;
    }
    setBusy(true);
    try {
      const status = await window.pond.query("fishMcp.save", {
        server: parsed.data,
        secrets: Object.fromEntries(
          secrets
            .filter((row) => row.name.trim() && row.value)
            .map((row) => [row.name.trim(), row.value]),
        ),
      });
      onSaved(status);
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't save the server. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (busy) {
          details.cancel();
        } else if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <form
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>
                {initial ? "Edit Server" : "Add Server"}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Content className={styles.content}>
              <Field.Root invalid={nameError !== null}>
                <Field.Label>Name</Field.Label>
                <Input.Root size="md">
                  <Field.Control
                    render={<Input.Field />}
                    value={name}
                    onValueChange={setName}
                    placeholder="github"
                    maxLength={32}
                    disabled={busy}
                    autoFocus
                  />
                </Input.Root>
                <Field.Error match={nameError !== null}>
                  {nameError}
                </Field.Error>
              </Field.Root>
              <ToggleGroup
                aria-label="Type"
                value={[transport]}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next === "stdio" || next === "http") {
                    setTransport(next);
                  }
                }}
              >
                <Toggle type="button" size="sm" value="stdio">
                  Command
                </Toggle>
                <Toggle type="button" size="sm" value="http">
                  URL
                </Toggle>
              </ToggleGroup>
              {transport === "stdio" ? (
                <>
                  <Field.Root>
                    <Field.Label>Command</Field.Label>
                    <Input.Root size="md">
                      <Field.Control
                        render={<Input.Field />}
                        value={command}
                        onValueChange={setCommand}
                        placeholder="npx"
                        disabled={busy}
                      />
                    </Input.Root>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Arguments</Field.Label>
                    <Input.Root size="md">
                      <Field.Control
                        render={<Input.Textarea rows={3} />}
                        value={args}
                        onValueChange={setArgs}
                        placeholder="One per line"
                        disabled={busy}
                      />
                    </Input.Root>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Working Folder</Field.Label>
                    <Input.Root size="md">
                      <Field.Control
                        render={<Input.Field />}
                        value={cwd}
                        onValueChange={setCwd}
                        placeholder="Optional"
                        disabled={busy}
                      />
                    </Input.Root>
                  </Field.Root>
                </>
              ) : (
                <Field.Root>
                  <Field.Label>URL</Field.Label>
                  <Input.Root size="md">
                    <Field.Control
                      render={<Input.Field />}
                      value={url}
                      onValueChange={setUrl}
                      placeholder="https://"
                      inputMode="url"
                      disabled={busy}
                    />
                  </Input.Root>
                </Field.Root>
              )}
              <fieldset className={styles.secrets} disabled={busy}>
                <legend className={styles.legend}>Secrets</legend>
                {secrets.map((row) => (
                  <div key={row.key} className={styles.secret}>
                    <Input.Root size="md">
                      <Input.Field
                        aria-label="Secret name"
                        value={row.name}
                        onValueChange={(value) =>
                          editSecret(row.key, { name: value })
                        }
                        placeholder="GITHUB_TOKEN"
                      />
                    </Input.Root>
                    <Input.Root size="md">
                      <Input.Field
                        aria-label={`${row.name || "Secret"} value`}
                        type="password"
                        autoComplete="off"
                        value={row.value}
                        onValueChange={(value) =>
                          editSecret(row.key, { value })
                        }
                        placeholder={saved.has(row.name.trim()) ? "Saved" : ""}
                      />
                    </Input.Root>
                    <Button
                      icon
                      size="sm"
                      variant="ghost"
                      type="button"
                      aria-label={`Remove ${row.name || "secret"}`}
                      onClick={() =>
                        setSecrets((current) =>
                          current.filter((entry) => entry.key !== row.key),
                        )
                      }
                    >
                      <IconXmark size={12} />
                    </Button>
                  </div>
                ))}
                <span className={styles.add}>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      setSecrets((current) => [
                        ...current,
                        { key: nextKey.current++, name: "", value: "" },
                      ])
                    }
                  >
                    <IconPlus size={12} />
                    Add Secret
                  </Button>
                </span>
                <Dialog.Description>
                  Pond keeps these in your keychain. Commands get them as
                  environment variables, URLs as headers.
                </Dialog.Description>
              </fieldset>
              {error ? (
                <Dialog.Description role="alert" data-error>
                  {error}
                </Dialog.Description>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Dialog.Confirm type="submit" loading={busy}>
                Save
              </Dialog.Confirm>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
