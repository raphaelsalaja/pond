import { Input, Select, Settings, Toggle, ToggleGroup } from "@pond/ui";
import type { SelectItemSpec } from "@pond/ui";
import { assistantCatalog, offeredProviders } from "@shared/assistant";
import type { AssistantProvider, ProviderGroup } from "@shared/assistant";
import type { ReactNode } from "react";
import { ProviderLogo } from "@/features/settings";
import { IS_MAC, THIS_DEVICE } from "@/shared/lib/platform";
import type { AssistantChoice, StepProps } from "../../model";
import styles from "./styles.module.css";

export { AssistantPreview } from "./preview";

const CHOICES: ReadonlyArray<{ value: AssistantChoice; label: string }> = [
  { value: "later", label: "Not Now" },
  { value: "cloud", label: "API Key" },
  { value: "subscription", label: "Subscription" },
  { value: "local", label: "Local Host" },
];

function defaultEndpoint(id: AssistantProvider) {
  if (id === "ollama") return "http://127.0.0.1:11434/v1";
  if (id === "lmstudio") return "http://127.0.0.1:1234/v1";
  return "";
}

function providersFor(group: ProviderGroup) {
  return offeredProviders(group).filter(
    (entry) => !("macOnly" in entry) || IS_MAC,
  );
}

function providerName(id: AssistantProvider) {
  return assistantCatalog(id)?.provider ?? id;
}

function ProviderSelect({
  group,
  value,
  onChange,
}: {
  group: ProviderGroup;
  value: AssistantProvider;
  onChange: (provider: AssistantProvider) => void;
}) {
  const providers = providersFor(group);
  const items = providers.map((entry): SelectItemSpec<string> => ({
    value: entry.id,
    label: (
      <span className={styles.option}>
        <ProviderLogo provider={entry.id} size={14} />
        {entry.provider}
      </span>
    ),
  }));
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        const match = providers.find((entry) => entry.id === next);
        if (match) onChange(match.id);
      }}
    >
      <Select.Trigger aria-label="Provider">
        <Select.Value>
          {(id: AssistantProvider) => (
            <span className={styles.option}>
              <ProviderLogo provider={id} size={14} />
              {providerName(id)}
            </span>
          )}
        </Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6}>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{title}</Settings.ItemTitle>
        {description ? (
          <Settings.ItemDescription>{description}</Settings.ItemDescription>
        ) : null}
      </Settings.ItemDetails>
      {children ? (
        <Settings.ItemControl>{children}</Settings.ItemControl>
      ) : null}
    </Settings.Item>
  );
}

export function AssistantOptions({ choices, update }: StepProps) {
  const { assistant, provider, apiKey, endpoint } = choices;
  const choose = (next: AssistantChoice) => {
    if (next === "later") return update({ assistant: next });
    const first = providersFor(next)[0]?.id ?? provider;
    update({
      assistant: next,
      provider: first,
      endpoint: defaultEndpoint(first),
    });
  };
  return (
    <div className={styles.options}>
      <ToggleGroup
        aria-label="Connect With"
        value={[assistant]}
        onValueChange={(value) => {
          const next = CHOICES.find((choice) => choice.value === value[0]);
          if (next) choose(next.value);
        }}
      >
        {CHOICES.map(({ value, label }) => (
          <Toggle key={value} type="button" size="sm" value={value}>
            {label}
          </Toggle>
        ))}
      </ToggleGroup>
      <Settings.List className={styles.list}>
        {assistant === "later" ? (
          <Row
            title="Set Up Later"
            description="Pond works fully without a model."
          />
        ) : null}
        {assistant === "cloud" ? (
          <>
            <Row title="Provider" description="Requests go straight to them.">
              <ProviderSelect
                group="cloud"
                value={provider}
                onChange={(next) => update({ provider: next })}
              />
            </Row>
            <Row title="API Key">
              <Input.Root className={styles.input}>
                <Input.Field
                  type="password"
                  aria-label="API Key"
                  placeholder={`Enter your ${providerName(provider)} API Key`}
                  value={apiKey}
                  onChange={(event) =>
                    update({ apiKey: event.currentTarget.value })
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </Input.Root>
            </Row>
          </>
        ) : null}
        {assistant === "subscription" ? (
          <Row title="Account" description={`Signed in on ${THIS_DEVICE}.`}>
            <ProviderSelect
              group="subscription"
              value={provider}
              onChange={(next) => update({ provider: next })}
            />
          </Row>
        ) : null}
        {assistant === "local" ? (
          <>
            <Row
              title="Server"
              description={
                provider === "apple"
                  ? "Built into macOS. Nothing leaves your Mac."
                  : "A model server you run."
              }
            >
              <ProviderSelect
                group="local"
                value={provider}
                onChange={(next) =>
                  update({ provider: next, endpoint: defaultEndpoint(next) })
                }
              />
            </Row>
            {provider === "apple" ? null : (
              <Row title="Address">
                <Input.Root className={styles.input}>
                  <Input.Field
                    type="url"
                    aria-label="Address"
                    value={endpoint}
                    onChange={(event) =>
                      update({ endpoint: event.currentTarget.value })
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Input.Root>
              </Row>
            )}
          </>
        ) : null}
      </Settings.List>
    </div>
  );
}
