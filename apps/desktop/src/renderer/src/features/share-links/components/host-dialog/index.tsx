import { Dialog, Field, Input, Select } from "@pond/ui";
import { SHARE_HOST_PROVIDER_LABELS } from "@shared/share-link-contracts";
import type {
  ShareHostProvider,
  ShareHostSummary,
} from "@shared/share-link-contracts";
import { useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

interface ProviderPreset {
  region: string;
  endpoint: string;
  hint: string;
}

/** What each provider calls these fields, so the form can say where to find them. */
const PRESETS = {
  r2: {
    region: "auto",
    endpoint: "https://<account id>.r2.cloudflarestorage.com",
    hint: "In Cloudflare, make an R2 bucket, turn on its public r2.dev address or connect a domain, and make an R2 API token with Object Read & Write for that bucket. R2 doesn't charge when people view a link.",
  },
  s3: {
    region: "us-east-1",
    endpoint: "https://s3.us-east-1.amazonaws.com",
    hint: "Allow public reads of objects but not listing, and give the key s3:PutObject, s3:DeleteObject, and s3:ListBucket. AWS charges for every download, so a link that spreads can cost money.",
  },
  b2: {
    region: "us-west-004",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    hint: "Make a public bucket and an application key for it. The endpoint and region are on the bucket's page.",
  },
  other: {
    region: "us-east-1",
    endpoint: "https://s3.example.com",
    hint: "Any S3-compatible storage with public reads, no public listing, and https.",
  },
} as const satisfies Record<ShareHostProvider, ProviderPreset>;

const PROVIDER_ORDER = [
  "r2",
  "s3",
  "b2",
  "other",
] as const satisfies ReadonlyArray<ShareHostProvider>;

const PROVIDERS = PROVIDER_ORDER.map((value) => ({
  value,
  label: SHARE_HOST_PROVIDER_LABELS[value],
}));

const EXPIRY = [
  { value: "never", label: "Never" },
  { value: "1", label: "After 1 Day" },
  { value: "7", label: "After 7 Days" },
  { value: "30", label: "After 30 Days" },
  { value: "90", label: "After 90 Days" },
] as const;
type Expiry = (typeof EXPIRY)[number]["value"];

function expiryValue(days: number | null): Expiry {
  return (
    EXPIRY.find((option) => option.value === String(days))?.value ?? "never"
  );
}

interface ShareHostDialogProps {
  host: ShareHostSummary | null;
  onSaved: () => Promise<void>;
  onClose: () => void;
}

export function ShareHostDialog({
  host,
  onSaved,
  onClose,
}: ShareHostDialogProps) {
  const [provider, setProvider] = useState<ShareHostProvider>(
    host?.provider ?? "r2",
  );
  const [endpoint, setEndpoint] = useState(host?.endpoint ?? "");
  const [region, setRegion] = useState(host?.region ?? PRESETS.r2.region);
  const [bucket, setBucket] = useState(host?.bucket ?? "");
  const [publicUrl, setPublicUrl] = useState(host?.publicUrl ?? "");
  const [accessKeyId, setAccessKeyId] = useState(host?.accessKeyId ?? "");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [expiry, setExpiry] = useState<Expiry>(
    expiryValue(host?.expireAfterDays ?? null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preset = PRESETS[provider];

  function chooseProvider(next: ShareHostProvider) {
    /** A region left at the old provider's default follows the new one; one you typed stays. */
    if (region === PRESETS[provider].region) setRegion(PRESETS[next].region);
    setProvider(next);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.pond.query("shareHost.save", {
        provider,
        endpoint,
        region,
        bucket,
        publicUrl,
        accessKeyId,
        secretAccessKey,
        expireAfterDays: expiry === "never" ? null : Number(expiry),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onSaved();
      onClose();
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't save the Share Host. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (busy) details.cancel();
        else if (!open) onClose();
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
                {host ? "Edit Share Host" : "Set Up Share Host"}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Content className={styles.content}>
              <Dialog.Description>{preset.hint}</Dialog.Description>
              <Field.Root>
                <Field.Label>Provider</Field.Label>
                <Select.Root
                  value={provider}
                  items={PROVIDERS}
                  disabled={busy}
                  onValueChange={(next) => {
                    if (next !== null) chooseProvider(next);
                  }}
                >
                  <Select.Trigger size="md" aria-label="Provider">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner>
                      <Select.Popup>
                        <Select.Items items={PROVIDERS} />
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              </Field.Root>
              <TextField
                label="Endpoint"
                value={endpoint}
                onChange={setEndpoint}
                placeholder={preset.endpoint}
                disabled={busy}
                type="url"
              />
              <div className={styles.row}>
                <TextField
                  label="Bucket"
                  value={bucket}
                  onChange={setBucket}
                  placeholder="pond-links"
                  disabled={busy}
                />
                <TextField
                  label="Region"
                  value={region}
                  onChange={setRegion}
                  placeholder={preset.region}
                  disabled={busy}
                />
              </div>
              <TextField
                label="Public URL"
                description="Where visitors read the bucket's files, such as its r2.dev address or your domain."
                value={publicUrl}
                onChange={setPublicUrl}
                placeholder="https://links.example.com"
                disabled={busy}
                type="url"
              />
              <TextField
                label="Access Key ID"
                value={accessKeyId}
                onChange={setAccessKeyId}
                disabled={busy}
              />
              <TextField
                label="Secret Access Key"
                description={
                  host ? "Leave empty to keep the saved secret." : undefined
                }
                value={secretAccessKey}
                onChange={setSecretAccessKey}
                placeholder={host ? "Saved" : undefined}
                disabled={busy}
                type="password"
              />
              <Field.Root>
                <Field.Label>New Links Expire</Field.Label>
                <Select.Root
                  value={expiry}
                  items={EXPIRY}
                  disabled={busy}
                  onValueChange={(next) => {
                    if (next !== null) setExpiry(next);
                  }}
                >
                  <Select.Trigger size="md" aria-label="New Links Expire">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner>
                      <Select.Popup>
                        <Select.Items items={EXPIRY} />
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
                <Field.Description>
                  Pond removes an expired link the next time it&apos;s open.
                </Field.Description>
              </Field.Root>
              {error ? (
                <Dialog.Description role="alert" data-error>
                  {error}
                </Dialog.Description>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Dialog.Confirm type="submit" loading={busy}>
                Check and Save
              </Dialog.Confirm>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TextField({
  label,
  description,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled: boolean;
  type?: "text" | "url" | "password";
}) {
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Input.Root size="md">
        <Field.Control
          render={<Input.Field />}
          type={type}
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </Input.Root>
      {description ? (
        <Field.Description>{description}</Field.Description>
      ) : null}
    </Field.Root>
  );
}
