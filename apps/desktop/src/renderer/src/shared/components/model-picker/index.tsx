import {
  IconCheckFill,
  IconChevronDown,
  IconChevronExpandY,
} from "@pond/icons";
import type {
  AgentContextChoice,
  AgentModelOptions,
  AgentReasoning,
} from "@pond/schema";
import { Menu } from "@pond/ui";
import {
  compactTokens,
  contextChoiceLabel,
  contextChoicesFor,
  reasoningChoicesFor,
  reasoningLabel,
  supportsNativeFast,
} from "@shared/agent-model-options";
import {
  ASSISTANT_MODELS,
  type AssistantProvider,
  gatewayCreator,
} from "@shared/assistant";
import { displayName, type ProviderModel } from "@shared/provider-models";
import type { QueryResult } from "@shared/query-contracts";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { openSettings } from "@/shared/lib/open-settings";
import styles from "./styles.module.css";

const { contains } = Menu.getFilter();

type PickerModel = ProviderModel & {
  key: string;
  provider: AssistantProvider;
  providerName: string;
  search: string;
};

function liveItems(
  providers: QueryResult<"agent.listAvailableModels">["providers"],
): PickerModel[] {
  const items: PickerModel[] = [];
  for (const row of providers) {
    const catalog = ASSISTANT_MODELS.find((model) => model.id === row.provider);
    if (!catalog || !row.ok || !row.models.length) continue;
    /** Only gateway-cataloged providers get descriptions, so a missing one marks a legacy model there. */
    const hideUndescribed = Boolean(gatewayCreator(row.provider));
    for (const model of [...row.models].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (hideUndescribed && !model.description?.trim()) continue;
      items.push({
        ...model,
        key: `${row.provider}:${model.id}`,
        provider: row.provider,
        providerName: catalog.provider,
        search: `${model.name} ${model.id} ${catalog.provider}`,
      });
    }
  }
  return items;
}

function Choice({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Menu.Item onClick={onClick}>
      <Menu.ItemLabel>{children}</Menu.ItemLabel>
      {selected ? (
        <Menu.SecondaryLabel className={styles.check} aria-label="Selected">
          <IconCheckFill size={12} />
        </Menu.SecondaryLabel>
      ) : null}
    </Menu.Item>
  );
}

const NO_OPTIONS: AgentModelOptions = {
  fast: false,
  context: "auto",
  reasoning: "provider-default",
};

export function ModelPicker({
  provider,
  modelId,
  options = NO_OPTIONS,
  layout = "inline",
  onChange,
  onOptionsChange,
  onUseDefault,
  onManageModels = openSettings,
  disabled,
}: {
  disabled?: boolean;
  provider?: AssistantProvider | "";
  modelId?: string;
  options?: AgentModelOptions;
  layout?: "inline" | "field";
  onChange: (next: { provider: AssistantProvider; modelId: string }) => void;
  onOptionsChange?: (next: AgentModelOptions) => void;
  onUseDefault?: () => void;
  onManageModels?: (section: "agent-models" | "models") => void;
}) {
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeTop, setActiveTop] = useState(0);
  const catalog = useQuery({
    queryKey: ["assistant-models"],
    queryFn: () => window.pond.query("agent.listAvailableModels", {}),
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });
  const items = liveItems(catalog.data?.providers ?? []);
  const selected = items.find(
    (item) => item.provider === provider && item.id === modelId,
  );
  const selectedProvider = ASSISTANT_MODELS.find(
    (entry) => entry.id === provider,
  );
  const providerChoices = [
    ...items
      .reduce((choices, item) => {
        if (!choices.has(item.provider)) {
          choices.set(item.provider, {
            id: item.provider,
            name: item.providerName,
          });
        }
        return choices;
      }, new Map<AssistantProvider, { id: AssistantProvider; name: string }>())
      .values(),
  ];
  const label =
    selected?.name ??
    (modelId && modelId === selectedProvider?.model
      ? selectedProvider.name
      : modelId
        ? displayName(modelId)
        : onUseDefault
          ? "Default Model"
          : "Choose a model");
  const providerLabel = selectedProvider?.provider ?? "Choose a provider";
  const trimmedQuery = query.trim();
  const providerItems = items.filter((item) => item.provider === provider);
  const visibleItems = trimmedQuery
    ? providerItems.filter((item) => contains(item.search, trimmedQuery))
    : providerItems;
  const activeModel = visibleItems.find((item) => item.key === activeKey);
  const contextChoices = contextChoicesFor(selected?.contextWindow);
  const reasoningChoices = reasoningChoicesFor(selected);
  const fastSupported = supportsNativeFast(provider ?? "", selected);
  const visibleOptions: AgentModelOptions = {
    fast: fastSupported && options.fast,
    context: contextChoices.includes(options.context)
      ? options.context
      : "auto",
    reasoning: reasoningChoices.includes(options.reasoning)
      ? options.reasoning
      : "provider-default",
  };
  const modelError =
    catalog.isError || catalog.data?.providers.some((row) => !row.ok);
  const emptyMessage = providerItems.length
    ? "No models found. Try another name."
    : catalog.data?.providers.length
      ? "No models shown. Choose models in Settings."
      : "Connect a provider to see its models.";

  const updateOptions = (patch: Partial<AgentModelOptions>) =>
    onOptionsChange?.({ ...visibleOptions, ...patch });
  const activateModel = (model: PickerModel, target: HTMLElement) => {
    const popup = target.closest<HTMLElement>(`.${styles.models}`);
    setActiveKey(model.key);
    if (popup)
      setActiveTop(
        Math.max(
          0,
          target.getBoundingClientRect().top -
            popup.getBoundingClientRect().top,
        ),
      );
  };

  const contextSubmenu = (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger
        className={styles["option-submenu"]}
        disabled={contextChoices.length < 2}
      >
        <Menu.ItemLabel>Context</Menu.ItemLabel>
        <Menu.SecondaryLabel>
          {contextChoiceLabel(visibleOptions.context, selected?.contextWindow)}
        </Menu.SecondaryLabel>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          side="inline-end"
          align="start"
          sideOffset={-2}
          alignOffset={-4}
        >
          <Menu.Popup className={styles.submenu}>
            {contextChoices.map((choice: AgentContextChoice) => (
              <Choice
                key={String(choice)}
                selected={visibleOptions.context === choice}
                onClick={() => updateOptions({ context: choice })}
              >
                {contextChoiceLabel(choice, selected?.contextWindow)}
              </Choice>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );

  const reasoningSubmenu = (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger
        className={styles["option-submenu"]}
        disabled={reasoningChoices.length < 2}
      >
        <Menu.ItemLabel>Reasoning</Menu.ItemLabel>
        <Menu.SecondaryLabel>
          {reasoningLabel(visibleOptions.reasoning)}
        </Menu.SecondaryLabel>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          side="inline-end"
          align="start"
          sideOffset={-2}
          alignOffset={-4}
        >
          <Menu.Popup className={styles.submenu}>
            {reasoningChoices.map((reasoning: AgentReasoning) => (
              <Choice
                key={reasoning}
                selected={visibleOptions.reasoning === reasoning}
                onClick={() => updateOptions({ reasoning })}
              >
                {reasoningLabel(reasoning)}
              </Choice>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );

  const providerSubmenu = (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className={styles["option-submenu"]}>
        <Menu.ItemLabel>Provider</Menu.ItemLabel>
        <Menu.SecondaryLabel>{providerLabel}</Menu.SecondaryLabel>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          side="inline-end"
          align="start"
          sideOffset={-2}
          alignOffset={-4}
        >
          <Menu.Popup className={styles.submenu}>
            {catalog.isPending ? (
              <Menu.Item disabled>
                <Menu.ItemLabel>Loading providers</Menu.ItemLabel>
              </Menu.Item>
            ) : providerChoices.length ? (
              providerChoices.map((choice) => {
                const providerCatalog = ASSISTANT_MODELS.find(
                  (entry) => entry.id === choice.id,
                );
                const nextModel =
                  items.find(
                    (item) =>
                      item.provider === choice.id &&
                      item.id === providerCatalog?.model,
                  ) ?? items.find((item) => item.provider === choice.id);
                return (
                  <Choice
                    key={choice.id}
                    selected={choice.id === provider}
                    onClick={() => {
                      if (choice.id === provider || !nextModel) return;
                      onChange({
                        provider: choice.id,
                        modelId: nextModel.id,
                      });
                    }}
                  >
                    {choice.name}
                  </Choice>
                );
              })
            ) : (
              <Menu.Item disabled>
                <Menu.ItemLabel>Connect a provider to continue</Menu.ItemLabel>
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );

  const modelSubmenu = (
    <Menu.FilterProvider
      filter={null}
      value={query}
      onValueChange={onValueChange}
    >
      <Menu.SubmenuRoot
        onItemHighlighted={(element) => {
          const key = element?.dataset.modelKey;
          const model = visibleItems.find((item) => item.key === key);
          if (element && model) activateModel(model, element);
        }}
      >
        <Menu.SubmenuTrigger className={styles["option-submenu"]}>
          <Menu.ItemLabel>Model</Menu.ItemLabel>
          <Menu.SecondaryLabel>{label}</Menu.SecondaryLabel>
        </Menu.SubmenuTrigger>
        <Menu.Portal>
          <Menu.Positioner
            side="inline-end"
            align="start"
            sideOffset={-2}
            alignOffset={-4}
          >
            <Menu.Popup className={styles.models}>
              <Menu.Input
                aria-label="Search models"
                placeholder="Search models…"
              />
              <Menu.FilterList className={styles.content} aria-label="Models">
                <Menu.List className={styles.list}>
                  {catalog.isPending ? (
                    <Menu.Item disabled>
                      <Menu.ItemLabel>Loading models</Menu.ItemLabel>
                    </Menu.Item>
                  ) : visibleItems.length ? (
                    visibleItems.map((model) => (
                      <Menu.Item
                        key={model.key}
                        data-model-key={model.key}
                        onClick={() =>
                          onChange({
                            provider: model.provider,
                            modelId: model.id,
                          })
                        }
                      >
                        <Menu.ItemLabel>{model.name}</Menu.ItemLabel>
                        {model.key === selected?.key ? (
                          <span className={styles.check} aria-hidden>
                            <IconCheckFill size={12} />
                          </span>
                        ) : null}
                      </Menu.Item>
                    ))
                  ) : (
                    <Menu.Item disabled>
                      <Menu.ItemLabel>{emptyMessage}</Menu.ItemLabel>
                    </Menu.Item>
                  )}
                </Menu.List>
                {modelError ? (
                  <>
                    <Menu.Separator />
                    <Menu.Item
                      closeOnClick={false}
                      onClick={() => catalog.refetch()}
                    >
                      <Menu.ItemLabel>Retry Loading Models</Menu.ItemLabel>
                    </Menu.Item>
                  </>
                ) : null}
                <Menu.Separator />
                <Menu.Item
                  onClick={() => {
                    setOpen(false);
                    onManageModels(
                      catalog.data?.providers.length
                        ? "agent-models"
                        : "models",
                    );
                  }}
                >
                  <Menu.ItemLabel>Manage Models</Menu.ItemLabel>
                </Menu.Item>
              </Menu.FilterList>
              {activeModel &&
              (activeModel.description ||
                activeModel.contextWindow ||
                activeModel.maxOutputTokens) ? (
                <aside
                  className={styles.details}
                  style={{ insetBlockStart: activeTop }}
                  aria-live="polite"
                >
                  <h3 className={styles.title}>{activeModel.name}</h3>
                  {activeModel.description ? (
                    <p className={styles.description}>
                      {activeModel.description}
                    </p>
                  ) : null}
                  {activeModel.contextWindow || activeModel.maxOutputTokens ? (
                    <dl className={styles.specs}>
                      {activeModel.contextWindow ? (
                        <div>
                          <dt>Context</dt>
                          <dd>
                            {compactTokens(activeModel.contextWindow)} tokens
                          </dd>
                        </div>
                      ) : null}
                      {activeModel.maxOutputTokens ? (
                        <div>
                          <dt>Maximum output</dt>
                          <dd>
                            {compactTokens(activeModel.maxOutputTokens)} tokens
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </aside>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.SubmenuRoot>
    </Menu.FilterProvider>
  );

  return (
    <Menu.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setActiveKey(null);
          setActiveTop(0);
        }
      }}
    >
      {layout === "field" ? (
        <Menu.Trigger
          disabled={disabled}
          width="full"
          className={styles.trigger}
          data-layout="field"
          aria-label={`Choose model, ${label}`}
        >
          <span className={styles.name}>{label}</span>
          <IconChevronExpandY
            size={12}
            className={styles.chevron}
            aria-hidden
          />
        </Menu.Trigger>
      ) : (
        <Menu.Trigger
          disabled={disabled}
          size="xs"
          variant="ghost"
          rounding="full"
          className={styles.trigger}
          aria-label={`Choose model, ${label}`}
        >
          <span className={styles.name}>{label}</span>
          <IconChevronDown size={12} className={styles.chevron} aria-hidden />
        </Menu.Trigger>
      )}
      <Menu.Portal>
        <Menu.Positioner
          side={layout === "field" ? "bottom" : "top"}
          align="start"
          sideOffset={8}
        >
          <Menu.Popup className={styles.popup}>
            {onUseDefault ? (
              <>
                <Choice selected={!provider} onClick={onUseDefault}>
                  Default Model
                </Choice>
                <Menu.Separator />
              </>
            ) : null}
            {onOptionsChange ? (
              <>
                <Menu.CheckboxItem
                  className={styles.fast}
                  checked={visibleOptions.fast}
                  disabled={!fastSupported}
                  closeOnClick={false}
                  onCheckedChange={(fast) => updateOptions({ fast })}
                >
                  <Menu.ItemLabel>Fast</Menu.ItemLabel>
                  <Menu.SwitchItemIndicator className={styles.switch} />
                </Menu.CheckboxItem>
                {contextSubmenu}
                {reasoningSubmenu}
                <Menu.Separator />
              </>
            ) : null}
            {providerSubmenu}
            {modelSubmenu}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
