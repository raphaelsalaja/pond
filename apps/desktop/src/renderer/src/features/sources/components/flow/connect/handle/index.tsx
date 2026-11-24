import { Button, Field, Input } from "@pond/ui";
import { useRef, useState } from "react";
import { connectFlow } from "@/features/sources/state/connect-flow";
import styles from "./styles.module.css";

interface HandleFormProps {
  label: string;
  notFound: boolean;
}

export function HandleForm({ label, notFound }: HandleFormProps) {
  const [handle, setHandle] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (!handle.trim()) {
      setMissing(true);
      field.current?.focus();
      return;
    }
    setBusy(true);
    await connectFlow.submitHandle(handle);
    setBusy(false);
  };
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field.Root invalid={missing || notFound || undefined}>
        <Field.Label>Your {label} Handle</Field.Label>
        <Input.Root>
          <Input.Prefix>@</Input.Prefix>
          <Input.Field
            ref={field}
            autoFocus
            value={handle}
            placeholder="you.bsky.social"
            spellCheck={false}
            autoCapitalize="none"
            onChange={(event) => {
              setHandle(event.target.value);
              if (event.target.value.trim()) {
                setMissing(false);
              }
            }}
          />
        </Input.Root>
        {missing ? (
          <Field.Error match>Enter your {label} handle.</Field.Error>
        ) : notFound ? (
          <Field.Error match>
            Pond couldn&apos;t find that handle. Check the spelling and try
            again.
          </Field.Error>
        ) : (
          <Field.Description>
            Pond reads your public likes. You don&apos;t sign in.
          </Field.Description>
        )}
      </Field.Root>
      <Button type="submit" loading={busy}>
        Connect
      </Button>
    </form>
  );
}
