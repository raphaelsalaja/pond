import {
  IconCircleCheckFill as Connected,
  IconInputPasswordEdit as Edit,
  IconExternalLink as ExternalLink,
  IconEye as Eye,
  IconEye2 as EyeOff,
  IconTrash as Trash,
} from "@pond/icons";
import { Button, Input, Settings, Switch } from "@pond/ui";
import { type AssistantProvider, providerGroup } from "@shared/assistant";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AnimateHeight } from "@/shared/components/animate-height";
import { IS_MAC } from "@/shared/lib/platform";
import { ProviderLogo } from "../icons";
import type { AgentPrefs, KeyRow } from "../types";
import styles from "./styles.module.css";

type Catalog = {
  id: AssistantProvider;
  provider: string;
  needsKey: boolean;
  setupUrl?: string;
};

function endpointPatch(
  id: AssistantProvider,
  value: string,
): Partial<AgentPrefs> {
  if (id === "ollama") return { ollamaBaseUrl: value };
  if (id === "lmstudio") return { lmstudioBaseUrl: value };
  if (id === "azure") return { azureResourceName: value };
  return {};
}

function failMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function ProviderConnection({
  catalog,
  row,
  agent,
  onPatchAgent,
  onRefresh,
  onRemoved,
}: {
  catalog: Catalog;
  row: KeyRow | undefined;
  agent: AgentPrefs;
  onPatchAgent: (patch: Partial<AgentPrefs>) => void | Promise<void>;
  onRefresh: () => Promise<void>;
  onRemoved?: () => void;
}) {
  const connected = Boolean(row?.hasKey);
  const subscription = providerGroup(catalog.id) === "subscription";
  const setupUrl = catalog.setupUrl;
  const endpointLabel =
    catalog.id === "azure" ? "Resource Name" : "API Base URL";
  const endpoint =
    catalog.id === "ollama"
      ? agent.ollamaBaseUrl
      : catalog.id === "lmstudio"
        ? agent.lmstudioBaseUrl
        : catalog.id === "azure"
          ? agent.azureResourceName
          : undefined;
  const [editing, setEditing] = useState(!connected);
  const [keyDraft, setKeyDraft] = useState("");
  const [endpointDraft, setEndpointDraft] = useState(endpoint ?? "");
  const [syncedEndpoint, setSyncedEndpoint] = useState(endpoint);
  if (endpoint !== syncedEndpoint) {
    setSyncedEndpoint(endpoint);
    setEndpointDraft(endpoint ?? "");
  }
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const appeared = useRef(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    appeared.current = true;
  }, []);
  const hasEndpoint = endpoint === undefined || Boolean(endpointDraft.trim());
  const canSave =
    !saving &&
    hasEndpoint &&
    (!catalog.needsKey || connected || Boolean(keyDraft.trim()));
  const refresh = async () => {
    await onRefresh();
    await queryClient.invalidateQueries({
      queryKey: ["agent-provider-connections"],
    });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["provider-models", catalog.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["all-provider-models"] }),
      queryClient.invalidateQueries({ queryKey: ["assistant-models"] }),
    ]);
  };
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    let endpointSaved = false;
    let verified = false;
    try {
      if (endpoint !== undefined && endpointDraft.trim() !== endpoint) {
        await onPatchAgent(endpointPatch(catalog.id, endpointDraft.trim()));
        endpointSaved = true;
      }
      if (connected && !keyDraft.trim()) {
        const result = await window.pond.query("agent.listModels", {
          provider: catalog.id,
        });
        if (!result.ok) throw new Error(result.error);
        if (result.warning) throw new Error(result.warning);
      } else {
        const result = await window.pond.query("agent.saveKey", {
          provider: catalog.id,
          key: keyDraft.trim(),
        });
        if (!result.ok) throw new Error(result.error);
      }
      verified = true;
      if (!agent.languageModel)
        await onPatchAgent({ languageModel: catalog.id });
      setKeyDraft("");
      setRevealed(false);
      setEditing(false);
      await refresh();
    } catch (cause) {
      if (endpointSaved && !verified && endpoint !== undefined) {
        try {
          await onPatchAgent(endpointPatch(catalog.id, endpoint));
        } catch {
          setError(
            "Could not restore the previous endpoint. Check the settings and try again.",
          );
          return;
        }
      }
      setError(failMessage(cause, "Could not save provider. Try again."));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await window.pond.query("agent.removeKey", {
        provider: catalog.id,
      });
      if (!result.ok) throw new Error("Could not remove provider. Try again.");
      await onPatchAgent({
        addedProviders: (agent.addedProviders ?? []).filter(
          (id) => id !== catalog.id,
        ),
      });
      await refresh();
      onRemoved?.();
    } catch {
      setError("Could not remove provider. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    setKeyDraft("");
    setEndpointDraft(endpoint ?? "");
    setRevealed(false);
    setError("");
    if (connected) {
      setEditing(false);
      return;
    }
    void remove();
  };
  const toggleEnabled = async (enabled: boolean) => {
    const result = await window.pond.query("agent.setKeyEnabled", {
      provider: catalog.id,
      enabled,
    });
    if (!result.ok) {
      setError("Could not update provider. Try again.");
      return;
    }
    await refresh();
  };
  return (
    <Settings.Card aria-label={catalog.provider}>
      <ProviderLogo provider={catalog.id} size={20} />
      <Settings.CardTitle>{catalog.provider}</Settings.CardTitle>
      {connected ? (
        <span className={styles.status} role="img" aria-label="Connected">
          <Connected size={12} aria-hidden="true" />
        </span>
      ) : null}
      <Settings.CardAction>
        {editing ? null : (
          <Button
            type="button"
            icon
            size="xs"
            variant="ghost"
            disabled={saving}
            aria-label={`Edit ${catalog.provider}`}
            onClick={() => setEditing(true)}
          >
            <Edit size={12} />
          </Button>
        )}
        <Button
          type="button"
          icon
          size="xs"
          variant="ghost"
          disabled={saving}
          aria-label={`Remove ${catalog.provider}`}
          onClick={() => void remove()}
        >
          <Trash size={12} />
        </Button>
        {setupUrl ? (
          <Button
            type="button"
            icon
            size="xs"
            variant="ghost"
            aria-label={`Open ${catalog.provider}`}
            onClick={() => {
              void window.pond.openExternal(setupUrl);
            }}
          >
            <ExternalLink size={12} />
          </Button>
        ) : null}
        <Switch.Root
          aria-label={`Enable ${catalog.provider}`}
          checked={row?.enabled !== false}
          disabled={saving}
          onCheckedChange={(enabled) => {
            void toggleEnabled(enabled);
          }}
        />
      </Settings.CardAction>
      <AnimatePresence initial={false}>
        {editing ? (
          <AnimateHeight
            key="setup"
            className={styles.setup}
            initial={appeared.current ? undefined : false}
            presence
          >
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Settings.CardContent className={styles.content}>
                {subscription ? (
                  <p className={styles.instructions}>
                    {catalog.id === "codex" ? (
                      <>
                        Sign in with ChatGPT in{" "}
                        {IS_MAC ? "Terminal" : "a terminal"} using{" "}
                        <code>codex login</code>, then connect here.
                      </>
                    ) : (
                      <>
                        Sign in with your Claude plan in{" "}
                        {IS_MAC ? "Terminal" : "a terminal"} using{" "}
                        <code>claude auth login</code>, then connect here.
                      </>
                    )}{" "}
                    Uses your subscription limits. Text and Library tools are
                    supported.
                  </p>
                ) : (
                  <Input.Root className={styles.input}>
                    <Input.Field
                      type={revealed ? "text" : "password"}
                      autoComplete="off"
                      aria-label="API Key"
                      disabled={saving}
                      placeholder={`Enter your ${catalog.provider} API Key`}
                      value={keyDraft}
                      onValueChange={setKeyDraft}
                    />
                    <Input.Action>
                      <Button
                        type="button"
                        icon
                        size="xs"
                        variant="ghost"
                        aria-label={revealed ? "Hide API Key" : "Show API Key"}
                        aria-pressed={revealed || undefined}
                        onClick={() => setRevealed((open) => !open)}
                      >
                        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
                      </Button>
                    </Input.Action>
                  </Input.Root>
                )}
                {endpoint !== undefined ? (
                  <Input.Root className={styles.input}>
                    <Input.Field
                      type={catalog.id === "azure" ? "text" : "url"}
                      aria-label={endpointLabel}
                      placeholder={endpointLabel}
                      disabled={saving}
                      value={endpointDraft}
                      onValueChange={setEndpointDraft}
                    />
                  </Input.Root>
                ) : null}
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
              </Settings.CardContent>
              <Settings.CardFooter className={styles.footer}>
                <Button
                  type="button"
                  variant="text"
                  disabled={saving}
                  onClick={cancel}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" disabled={!canSave}>
                  {subscription
                    ? "Connect"
                    : catalog.needsKey
                      ? "Save API Key"
                      : "Save"}
                </Button>
              </Settings.CardFooter>
            </form>
          </AnimateHeight>
        ) : null}
      </AnimatePresence>
    </Settings.Card>
  );
}
