import { API_TOKEN_SCOPE_LABELS, API_TOKEN_SCOPES } from "@pond/schema/api";
import type { ApiTokenScope } from "@pond/schema/api";
import { Button, Checkbox, Dialog, Field, Input } from "@pond/ui";
import { useId, useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

const SCOPE_DESCRIPTIONS = {
  search: "Let connected apps search and read your saves, files, and folders.",
  export: "Let connected apps export converted copies and compress images.",
  write:
    "Let connected apps add saves, edit tags, folders, notes, and ratings, and use Trash.",
} satisfies Record<ApiTokenScope, string>;

interface CreateTokenDialogProps {
  onCreated: () => Promise<void>;
  onClose: () => void;
}

export function CreateTokenDialog({
  onCreated,
  onClose,
}: CreateTokenDialogProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Array<ApiTokenScope>>(["search"]);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState({ name: false, scopes: false });
  const nameField = useRef<HTMLInputElement>(null);
  const scopesField = useRef<HTMLFieldSetElement>(null);
  const trimmed = name.trim();

  function toggle(scope: ApiTokenScope, checked: boolean) {
    setScopes((current) =>
      API_TOKEN_SCOPES.filter((entry) =>
        entry === scope ? checked : current.includes(entry),
      ),
    );
  }

  async function create() {
    if (busy) {
      return;
    }
    const next = { name: !trimmed, scopes: scopes.length === 0 };
    setInvalid(next);
    if (next.name) {
      nameField.current?.focus();
      return;
    }
    if (next.scopes) {
      scopesField.current
        ?.querySelector<HTMLElement>("[role='checkbox']")
        ?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.pond.query("apiTokens.create", {
        name: trimmed,
        scopes,
      });
      setToken(result.token);
      await onCreated();
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't create the token. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    const result = await window.pond.query("clipboard.writeText", {
      text: value,
    });
    if (result.ok) {
      setCopied(true);
    } else {
      setError("Couldn't copy the token. Select it and copy it instead.");
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
          {token ? (
            <>
              <Dialog.Header>
                <Dialog.Title>Copy Your Token</Dialog.Title>
              </Dialog.Header>
              <Dialog.Content>
                <Dialog.Description>
                  Pond won&apos;t show it again. Treat it like a password.
                </Dialog.Description>
                <Input.Root size="md">
                  <Input.Field
                    aria-label="Token"
                    value={token}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </Input.Root>
                {error ? (
                  <Dialog.Description role="alert" data-error>
                    {error}
                  </Dialog.Description>
                ) : null}
              </Dialog.Content>
              <Dialog.Footer>
                <Button variant="secondary" onClick={() => void copy(token)}>
                  {copied ? "Copied" : "Copy Token"}
                </Button>
                <Button onClick={onClose}>Done</Button>
              </Dialog.Footer>
            </>
          ) : (
            <form
              aria-busy={busy}
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <Dialog.Header>
                <Dialog.Title>New Token</Dialog.Title>
              </Dialog.Header>
              <Dialog.Content className={styles.content}>
                <Field.Root invalid={(invalid.name && !trimmed) || undefined}>
                  <Field.Label>Name</Field.Label>
                  <Input.Root size="md">
                    <Field.Control
                      ref={nameField}
                      render={<Input.Field />}
                      value={name}
                      onValueChange={setName}
                      placeholder="Alfred workflow"
                      maxLength={80}
                      disabled={busy}
                      autoFocus
                    />
                  </Input.Root>
                  {invalid.name && !trimmed ? (
                    <Field.Error match>Name the token.</Field.Error>
                  ) : null}
                </Field.Root>
                <fieldset
                  ref={scopesField}
                  className={styles.scopes}
                  disabled={busy}
                  aria-describedby={
                    invalid.scopes && scopes.length === 0
                      ? `${id}-scopes-error`
                      : undefined
                  }
                >
                  <legend className={styles.legend}>Access</legend>
                  {API_TOKEN_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className={styles.scope}
                      htmlFor={`${id}-${scope}`}
                    >
                      <Checkbox.Root
                        id={`${id}-${scope}`}
                        checked={scopes.includes(scope)}
                        onCheckedChange={(checked) =>
                          toggle(scope, checked === true)
                        }
                      >
                        <Checkbox.Indicator />
                      </Checkbox.Root>
                      <span className={styles.text}>
                        <span className={styles.title}>
                          {API_TOKEN_SCOPE_LABELS[scope]}
                        </span>
                        <span className={styles.description}>
                          {SCOPE_DESCRIPTIONS[scope]}
                        </span>
                      </span>
                    </label>
                  ))}
                  {invalid.scopes && scopes.length === 0 ? (
                    <p
                      id={`${id}-scopes-error`}
                      role="alert"
                      className={styles.error}
                    >
                      Choose at least one access level.
                    </p>
                  ) : null}
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
                  Create
                </Dialog.Confirm>
              </Dialog.Footer>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
