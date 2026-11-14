import type { Prefs } from "@pond/schema/db";
import { Settings } from "@pond/ui";
import type { ReactNode } from "react";
import { z } from "zod";
import { ItemView } from "@/features/settings/components/engine/field-control";
import type {
  Binding,
  CustomItem,
  GroupConfig,
  Item,
  SectionConfig,
} from "@/features/settings/lib/engine-types";
import { usePrefs } from "@/shared/state/prefs";

export type {
  Binding,
  SectionConfig,
} from "@/features/settings/lib/engine-types";

const GroupTitleSchema = z.string();

const EMPTY_BINDING: Binding = {
  values: {},
  patch: () => {},
  loaded: true,
};

function usePrefsBinding(prefsKey: keyof Prefs): Binding {
  const [values, patch, loaded] = usePrefs(prefsKey);
  return { values, patch, loaded };
}

export function SettingsSectionView({
  config,
  sectionId,
}: {
  config: SectionConfig;
  sectionId?: string;
}) {
  if (config.component) {
    const Custom = config.component;
    return <Custom />;
  }
  if (config.useBinding)
    return <BoundSection config={config} sectionId={sectionId} />;
  if (config.prefsKey)
    return (
      <PrefsSection
        config={config}
        prefsKey={config.prefsKey}
        sectionId={sectionId}
      />
    );
  return (
    <SectionBody
      config={config}
      binding={EMPTY_BINDING}
      sectionId={sectionId}
    />
  );
}

function PrefsSection({
  config,
  prefsKey,
  sectionId,
}: {
  config: SectionConfig;
  prefsKey: NonNullable<SectionConfig["prefsKey"]>;
  sectionId?: string;
}) {
  return (
    <SectionBody
      config={config}
      sectionId={sectionId}
      binding={usePrefsBinding(prefsKey)}
    />
  );
}

function BoundSection({
  config,
  sectionId,
}: {
  config: SectionConfig;
  sectionId?: string;
}) {
  const binding = config.useBinding?.() ?? EMPTY_BINDING;
  return (
    <SectionBody config={config} binding={binding} sectionId={sectionId} />
  );
}

function SectionBody({
  config,
  binding,
  sectionId,
}: {
  config: SectionConfig;
  binding: Binding;
  sectionId?: string;
}) {
  const groups = config.groups ?? [];
  return (
    <>
      {groups.map((group, index) => (
        <GroupRouter
          key={groupKey(group, index)}
          group={group}
          sectionBinding={binding}
          sectionId={sectionId}
        />
      ))}
    </>
  );
}

function groupKey(group: GroupConfig, index: number): string {
  const title = GroupTitleSchema.safeParse(group.title);
  return title.success ? title.data : `group-${index}`;
}

function GroupRouter({
  group,
  sectionBinding,
  sectionId,
}: {
  group: GroupConfig;
  sectionBinding: Binding;
  sectionId?: string;
}) {
  if (group.useBinding)
    return <UseBindingGroup group={group} sectionId={sectionId} />;
  if (group.prefsKey)
    return (
      <PrefsGroup
        group={group}
        prefsKey={group.prefsKey}
        sectionId={sectionId}
      />
    );
  return <Group group={group} binding={sectionBinding} sectionId={sectionId} />;
}

function PrefsGroup({
  group,
  prefsKey,
  sectionId,
}: {
  group: GroupConfig;
  prefsKey: NonNullable<GroupConfig["prefsKey"]>;
  sectionId?: string;
}) {
  return (
    <Group
      group={group}
      sectionId={sectionId}
      binding={usePrefsBinding(prefsKey)}
    />
  );
}

function UseBindingGroup({
  group,
  sectionId,
}: {
  group: GroupConfig;
  sectionId?: string;
}) {
  const binding = group.useBinding?.() ?? EMPTY_BINDING;
  return <Group group={group} binding={binding} sectionId={sectionId} />;
}

function Group({
  group,
  binding,
  sectionId,
}: {
  group: GroupConfig;
  binding: Binding;
  sectionId?: string;
}) {
  if (group.visible && !group.visible(binding.values)) return null;

  const items = (group.items ?? []).filter(
    (item) =>
      item.prefsKey !== undefined ||
      !item.visible ||
      item.visible(binding.values),
  );

  if (group.render === undefined && items.length === 0) return null;

  return (
    <Settings.Section span={group.fullWidth ? "full" : undefined}>
      {group.title ? (
        <Settings.SectionTitle>{group.title}</Settings.SectionTitle>
      ) : null}
      {items.length > 0 ? (
        <GroupItems items={items} binding={binding} sectionId={sectionId} />
      ) : null}
      {group.render ? group.render(binding) : null}
    </Settings.Section>
  );
}

function GroupItems({
  items,
  binding,
  sectionId,
}: {
  items: Item[];
  binding: Binding;
  sectionId?: string;
}) {
  const content: ReactNode[] = [];
  let rows: Item[] = [];

  const flushRows = () => {
    if (rows.length === 0) return;
    const segment = rows;
    rows = [];
    content.push(
      <Settings.List key={`rows-${segment[0]?.key}`}>
        {segment.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            groupBinding={binding}
            sectionId={sectionId}
          />
        ))}
      </Settings.List>,
    );
  };

  for (const item of items) {
    if (item.control !== "custom" || !item.standalone) {
      rows.push(item);
      continue;
    }
    flushRows();
    content.push(
      <StandaloneItem
        key={item.key}
        item={item}
        groupBinding={binding}
        sectionId={sectionId}
      />,
    );
  }
  flushRows();

  return content;
}

function StandaloneItem({
  item,
  groupBinding,
  sectionId,
}: {
  item: CustomItem;
  groupBinding: Binding;
  sectionId?: string;
}) {
  if (item.prefsKey)
    return (
      <StandaloneItemWithBinding
        item={item}
        prefsKey={item.prefsKey}
        sectionId={sectionId}
      />
    );
  return (
    <StandaloneItemShell
      item={item}
      binding={groupBinding}
      sectionId={sectionId}
    />
  );
}

function StandaloneItemWithBinding({
  item,
  prefsKey,
  sectionId,
}: {
  item: CustomItem;
  prefsKey: NonNullable<CustomItem["prefsKey"]>;
  sectionId?: string;
}) {
  const binding = usePrefsBinding(prefsKey);
  if (item.visible && !item.visible(binding.values)) return null;
  return (
    <StandaloneItemShell item={item} binding={binding} sectionId={sectionId} />
  );
}

function StandaloneItemShell({
  item,
  binding,
  sectionId,
}: {
  item: CustomItem;
  binding: Binding;
  sectionId?: string;
}) {
  return (
    <div id={sectionId ? `setting-${sectionId}-${item.key}` : undefined}>
      {item.render(binding)}
    </div>
  );
}

function ItemRow({
  item,
  groupBinding,
  sectionId,
}: {
  item: Item;
  groupBinding: Binding;
  sectionId?: string;
}) {
  if (item.prefsKey)
    return (
      <OverriddenItemRow
        item={item}
        prefsKey={item.prefsKey}
        sectionId={sectionId}
      />
    );
  return <ItemShell item={item} binding={groupBinding} sectionId={sectionId} />;
}

function OverriddenItemRow({
  item,
  prefsKey,
  sectionId,
}: {
  item: Item;
  prefsKey: NonNullable<Item["prefsKey"]>;
  sectionId?: string;
}) {
  const binding = usePrefsBinding(prefsKey);
  if (item.visible && !item.visible(binding.values)) return null;
  return <ItemShell item={item} binding={binding} sectionId={sectionId} />;
}

function ItemShell({
  item,
  binding,
  sectionId,
}: {
  item: Item;
  binding: Binding;
  sectionId?: string;
}) {
  const disabled = item.disabled?.(binding.values) ?? false;
  return (
    <Settings.Item
      id={sectionId ? `setting-${sectionId}-${item.key}` : undefined}
      disabled={disabled}
    >
      <ItemView item={item} binding={binding} />
    </Settings.Item>
  );
}
