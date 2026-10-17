import type {
  ImportCollection,
  ImportMediaKind,
  ListKind,
  Source,
} from "@pond/schema/db";
import {
  Button,
  Dialog,
  Input,
  Reveal,
  Select,
  type SelectItemSpec,
  Settings,
  Switch,
  Toggle,
  ToggleGroup,
} from "@pond/ui";
import {
  type ImportCollectionKind,
  importScopeOptions,
} from "@shared/import-scope";
import type { OkResult } from "@shared/query-contracts-shared";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  collectionNouns,
  formatSince,
  hasImportChoices,
  listKindLabel,
  mediaKindLabel,
  SINCE_PRESETS,
  saveImportScope,
} from "@/features/sources/lib/import-scope";
import { getSourceDef } from "@/features/sources/lib/registry";
import { connectFlow } from "@/features/sources/state/connect-flow";
import {
  draftImportScope,
  importScopeFlow,
  useImportScopeFlow,
} from "@/features/sources/state/import-scope-flow";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { formatNumber } from "@/shared/lib/format";
import styles from "./styles.module.css";

const ALL = "all";

export function ImportScopeSection() {
  const draft = useImportScopeFlow();
  if (!draft.source) return null;
  const label = getSourceDef(draft.source).label;
  return (
    <div className={styles.body}>
      <div className={styles.copy}>
        <h2 className={styles.title}>Choose What to Import</h2>
        <p className={styles.description}>
          {draft.starts
            ? `Pond waits for your choice before it syncs ${label}.`
            : "Changes apply from the next sync."}
        </p>
      </div>
      <ImportScopeChoices />
    </div>
  );
}

export function ImportScopeChoices() {
  const draft = useImportScopeFlow();
  const { accountId, source } = draft;
  if (!accountId || !source) return null;
  const options = importScopeOptions(source);
  const label = getSourceDef(source).label;
  const collections = options.collections ? (
    <CollectionRows
      accountId={accountId}
      source={source}
      kind={options.collections}
    />
  ) : null;
  const filters = options.mediaKinds.length > 0 || options.since;
  return (
    <div className={styles.choices}>
      {options.listKinds.length > 0 ? (
        <Settings.List>
          {options.listKinds.map((kind) => (
            <ListKindRows key={kind} source={source} kind={kind}>
              {kind === "saved" ? collections : null}
            </ListKindRows>
          ))}
        </Settings.List>
      ) : collections ? (
        <Settings.List>{collections}</Settings.List>
      ) : null}
      {filters ? (
        <div className={styles.section}>
          <h3 className={styles.heading}>Filters</h3>
          <Settings.List>
            {options.mediaKinds.length > 0 ? (
              <MediaKindsRow kinds={options.mediaKinds} />
            ) : null}
            {options.since ? <SinceRows /> : null}
          </Settings.List>
        </div>
      ) : null}
      {!hasImportChoices(source) ? (
        <p className={styles.note}>
          Pond imports everything you've saved on {label}. Choosing specific
          lists isn't available for {label} yet.
        </p>
      ) : null}
      {draft.error ? (
        <p className={styles.error} role="alert">
          {draft.error}
        </p>
      ) : null}
    </div>
  );
}

export function ImportScopeConfirm() {
  const draft = useImportScopeFlow();
  const ready = draftImportScope(draft) !== null;
  return (
    <Dialog.Confirm
      disabled={!ready || draft.saving}
      onClick={() => void confirmImportScope()}
    >
      {draft.starts ? "Start Import" : "Save"}
    </Dialog.Confirm>
  );
}

async function confirmImportScope(): Promise<void> {
  const draft = importScopeFlow.snapshot();
  const scope = draftImportScope(draft);
  if (!draft.accountId || !draft.source || !scope || draft.saving) return;
  importScopeFlow.setSaving(true);
  let result: OkResult;
  try {
    result = await saveImportScope({
      accountId: draft.accountId,
      source: draft.source,
      scope,
      start: draft.starts,
    });
  } catch {
    importScopeFlow.fail("Pond couldn't save your choice. Try again.");
    return;
  }
  if (!result.ok) {
    importScopeFlow.fail(result.error);
    return;
  }
  connectFlow.clear();
  sourceFlow.close();
}

function ListKindRows({
  source,
  kind,
  children,
}: {
  source: Source;
  kind: ListKind;
  children: ReactNode;
}) {
  const draft = useImportScopeFlow();
  const title = listKindLabel(source, kind);
  const included = draft.listKinds.includes(kind);
  return (
    <>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>{title}</Settings.ItemTitle>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Switch.Root
            aria-label={title}
            checked={included}
            disabled={draft.saving}
            onCheckedChange={(next) => importScopeFlow.setListKind(kind, next)}
          />
        </Settings.ItemControl>
      </Settings.Item>
      {children ? (
        <Reveal visible={included}>
          <div className={styles.nested}>{children}</div>
        </Reveal>
      ) : null}
    </>
  );
}

function CollectionRows({
  accountId,
  source,
  kind,
}: {
  accountId: string;
  source: Source;
  kind: ImportCollectionKind;
}) {
  const draft = useImportScopeFlow();
  const nouns = collectionNouns(kind);
  const label = getSourceDef(source).label;
  const [requested, setRequested] = useState(false);
  const query = useQuery({
    queryKey: ["import-options", accountId],
    queryFn: () => window.pond.query("accounts.importOptions", { accountId }),
    staleTime: 60_000,
    enabled: requested,
  });
  const failed = query.data && !query.data.ok ? query.data.error : null;
  return (
    <>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>{nouns.title}</Settings.ItemTitle>
          {failed ? (
            <Settings.ItemDescription role="alert" title={failed}>
              {failed}
            </Settings.ItemDescription>
          ) : null}
        </Settings.ItemDetails>
        <Settings.ItemControl>
          {failed ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void query.refetch()}
            >
              Try Again
            </Button>
          ) : (
            <CollectionSelect
              kind={kind}
              pending={query.isPending}
              available={query.data?.ok ? (query.data.collections ?? []) : []}
              selected={draft.collections}
              disabled={draft.saving}
              onOpen={() => setRequested(true)}
            />
          )}
        </Settings.ItemControl>
      </Settings.Item>
      <Reveal visible={draft.collections.length > 0}>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Add to Folders</Settings.ItemTitle>
            <Settings.ItemDescription>
              Files each {nouns.one} into its own Folder under {label}.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root
              aria-label="Add to Folders"
              checked={draft.addToFolders}
              disabled={draft.saving}
              onCheckedChange={(next) => importScopeFlow.setAddToFolders(next)}
            />
          </Settings.ItemControl>
        </Settings.Item>
      </Reveal>
    </>
  );
}

function CollectionSelect({
  kind,
  pending,
  available,
  selected,
  disabled,
  onOpen,
}: {
  kind: ImportCollectionKind;
  pending: boolean;
  available: ReadonlyArray<ImportCollection & { itemCount?: number | null }>;
  selected: readonly ImportCollection[];
  disabled: boolean;
  onOpen: () => void;
}) {
  const nouns = collectionNouns(kind);
  const names = new Map(
    [...selected, ...available].map((collection) => [
      collection.id,
      collection.name,
    ]),
  );
  const value = selected.length > 0 ? selected.map((c) => c.id) : [ALL];
  const status = pending
    ? `Loading ${nouns.many}`
    : available.length === 0
      ? `No ${nouns.many} found`
      : null;
  const items: SelectItemSpec<string>[] = [
    { value: ALL, label: nouns.all },
    { type: "separator" },
    ...(status
      ? [
          {
            type: "custom" as const,
            render: () => (
              <p className={styles.status} role="status">
                {status}
              </p>
            ),
          },
        ]
      : available.map((collection) => ({
          value: collection.id,
          label: (
            <span className={styles.option}>
              <span className={styles.name}>{collection.name}</span>
              {collection.itemCount == null ? null : (
                <span className={styles.count}>
                  {formatNumber(collection.itemCount)}{" "}
                  {collection.itemCount === 1
                    ? nouns.item.one
                    : nouns.item.many}
                </span>
              )}
            </span>
          ),
        }))),
  ];
  const [first] = selected;
  const summary =
    selected.length === 0
      ? nouns.all
      : selected.length === 1 && first
        ? first.name
        : `${selected.length} ${nouns.many}`;
  return (
    <Select.Root
      multiple
      value={value}
      disabled={disabled}
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
      onValueChange={(next) => {
        const chosenAll = next.includes(ALL) && !value.includes(ALL);
        const ids = chosenAll ? [] : next.filter((id) => id !== ALL);
        importScopeFlow.setCollections(
          ids.map((id) => ({ id, name: names.get(id) ?? id })),
        );
      }}
    >
      <Select.Trigger size="sm" aria-label={nouns.title}>
        <Select.Value className={styles.value}>{() => summary}</Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="end">
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function MediaKindsRow({ kinds }: { kinds: readonly ImportMediaKind[] }) {
  const draft = useImportScopeFlow();
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Kinds of Posts</Settings.ItemTitle>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <ToggleGroup
          multiple
          variant="outline"
          aria-label="Kinds of Posts"
          value={[...draft.mediaKinds]}
          disabled={draft.saving}
          onValueChange={(next) =>
            importScopeFlow.setMediaKinds(
              kinds.filter((kind) => next.includes(kind)),
            )
          }
        >
          {kinds.map((kind) => (
            <Toggle
              key={kind}
              type="button"
              size="sm"
              variant="outline"
              value={kind}
            >
              {mediaKindLabel(kind)}
            </Toggle>
          ))}
        </ToggleGroup>
      </Settings.ItemControl>
    </Settings.Item>
  );
}

function SinceRows() {
  const draft = useImportScopeFlow();
  const custom = draft.sincePreset === "custom";
  return (
    <>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Posted Since</Settings.ItemTitle>
          {draft.since && !custom ? (
            <Settings.ItemDescription>
              From {formatSince(draft.since)}
            </Settings.ItemDescription>
          ) : null}
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Select.Root
            value={draft.sincePreset}
            items={[...SINCE_PRESETS]}
            disabled={draft.saving}
            onValueChange={(next) => {
              if (next) importScopeFlow.setSincePreset(next);
            }}
          >
            <Select.Trigger size="sm" aria-label="Posted Since">
              <Select.Value />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner align="end">
                <Select.Popup>
                  <Select.Items items={[...SINCE_PRESETS]} />
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </Settings.ItemControl>
      </Settings.Item>
      <Reveal visible={custom}>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Date</Settings.ItemTitle>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Input.Root size="sm" className={styles.date}>
              <Input.Field
                aria-label="Date"
                type="date"
                value={draft.since}
                disabled={draft.saving}
                onChange={(event) =>
                  importScopeFlow.setSince(event.target.value)
                }
              />
            </Input.Root>
          </Settings.ItemControl>
        </Settings.Item>
      </Reveal>
    </>
  );
}
