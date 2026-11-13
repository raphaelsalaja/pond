import { IconChevronDown } from "@pond/icons";
import { Accordion, Button, Input, Settings } from "@pond/ui";
import { DataTable } from "@pond/ui/data-table";
import type { AssistantProvider } from "@shared/assistant";
import { useState } from "react";
import { openSettings } from "@/shared/lib/open-settings";
import { ProviderLogo } from "../../icons";
import type { CatalogModel, VisibleModelIds } from "../types";
import { modelColumns } from "./columns";
import { selectedIds } from "./format";
import styles from "./styles.module.css";

export function ModelCatalogTable({
  models,
  visibleByProvider,
  onSave,
  onOpenProviders = () => openSettings("models"),
}: {
  models: CatalogModel[];
  visibleByProvider: VisibleModelIds;
  onSave: (visibleModelIds: VisibleModelIds) => Promise<void>;
  onOpenProviders?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(new Set<AssistantProvider>());
  const needle = search.trim().toLowerCase();
  const filtered = models.filter((model) =>
    `${model.name} ${model.id} ${model.providerName}`
      .toLowerCase()
      .includes(needle),
  );
  const groups = new Map<
    AssistantProvider,
    { name: string; models: CatalogModel[] }
  >();
  for (const model of filtered) {
    const group = groups.get(model.provider);
    if (group) group.models.push(model);
    else {
      groups.set(model.provider, {
        name: model.providerName,
        models: [model],
      });
    }
  }
  const selectable = models.filter((model) => model.available !== false);
  const shownCount = selectable.filter((model) =>
    selectedIds(
      models.filter((item) => item.provider === model.provider),
      visibleByProvider[model.provider],
    ).has(model.id),
  ).length;

  async function save(next: VisibleModelIds) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onSave(next);
    } catch {
      setError("Could not save model visibility. Try again.");
    } finally {
      setPending(false);
    }
  }

  function providerVisible(provider: AssistantProvider) {
    return selectedIds(
      models.filter((model) => model.provider === provider),
      visibleByProvider[provider],
    );
  }

  function allVisible() {
    const next = { ...visibleByProvider };
    const byProvider = new Map<AssistantProvider, string[]>();
    for (const model of selectable) {
      const ids = byProvider.get(model.provider) ?? [];
      ids.push(model.id);
      byProvider.set(model.provider, ids);
    }
    for (const [provider, ids] of byProvider) next[provider] = ids;
    return next;
  }

  function noneVisible() {
    const next = { ...visibleByProvider };
    for (const model of models) next[model.provider] = [];
    return next;
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Input.Root size="sm">
          <Input.Field
            aria-label="Search models"
            placeholder="Search models…"
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              if (value.trim()) setCollapsed(new Set());
            }}
          />
        </Input.Root>
        <Button
          size="xs"
          variant="ghost"
          disabled={
            pending || !selectable.length || shownCount === selectable.length
          }
          onClick={() => void save(allVisible())}
        >
          Show All
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={pending || !shownCount}
          onClick={() => void save(noneVisible())}
        >
          Hide All
        </Button>
      </div>
      <Accordion.Root
        multiple
        className={styles.groups}
        value={[...groups.keys()].filter(
          (provider) => !collapsed.has(provider),
        )}
        onValueChange={(expanded) => {
          setCollapsed((current) => {
            const next = new Set(current);
            for (const provider of groups.keys()) {
              if (expanded.includes(provider)) next.delete(provider);
              else next.add(provider);
            }
            return next;
          });
        }}
      >
        {[...groups].map(([provider, group]) => (
          <Accordion.Item key={provider} value={provider}>
            <Accordion.Header
              className={styles.header}
              render={<h2 aria-label={group.name} />}
            >
              <Accordion.Trigger aria-label={group.name}>
                <span className={styles.provider}>
                  <ProviderLogo provider={provider} size={20} />
                  {group.name}
                </span>
                <span className={styles.count} aria-hidden="true">
                  {group.models.length}
                </span>
                <IconChevronDown size={12} />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel className={styles.panel}>
              {group.models.some((model) => model.available === false) ? (
                <div
                  className={styles.connection}
                  id={`connection-${provider}`}
                >
                  <p>Check the provider connection to select models.</p>
                  <Button size="xs" variant="ghost" onClick={onOpenProviders}>
                    Open Providers
                  </Button>
                </div>
              ) : null}
              <Settings.List>
                <DataTable.Provider
                  data={group.models}
                  columns={modelColumns({
                    provider,
                    visible: providerVisible(provider),
                    disabled: pending,
                    onCheckedChange: (model, checked) => {
                      const next = new Set(providerVisible(model.provider));
                      if (checked) next.add(model.id);
                      else next.delete(model.id);
                      void save({
                        ...visibleByProvider,
                        [model.provider]: [...next],
                      });
                    },
                  })}
                  getRowId={(model) => `${model.provider}:${model.id}`}
                >
                  <DataTable.Root aria-label={`${group.name} Models`} />
                </DataTable.Provider>
              </Settings.List>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion.Root>
      {!filtered.length ? (
        <p className={styles.empty}>
          {models.length
            ? "No models found. Try another name."
            : "No models found. Connect a provider first."}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
