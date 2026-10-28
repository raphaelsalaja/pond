import type { ImportMediaKind, ListKind, Source } from "@pond/schema/db";
import {
  Button,
  DatePicker,
  Select,
  Settings,
  Switch,
  Tooltip,
} from "@pond/ui";
import {
  type ImportCollectionKind,
  importScopeOptions,
  importsAnyList,
} from "@shared/import-scope";
import type { OkResult } from "@shared/query-contracts-shared";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ChipsField } from "@/features/sources/components/chips-field";
import {
  collectionNouns,
  listKindDescription,
  listKindLabel,
  localDay,
  mediaKindLabel,
  saveImportScope,
  sinceCopy,
} from "@/features/sources/lib/import-scope";
import { getSourceDef } from "@/features/sources/lib/registry";
import {
  draftChanged,
  draftFiles,
  draftImportScope,
  type ImportScopeAccount,
  type ImportScopeFlow,
  useImportScopeFlow,
  useImportScopeFlowActions,
} from "@/features/sources/state/import-scope-flow";
import { formatNumber } from "@/shared/lib/format";
import { BlueskySignIn, useBlueskySignedIn } from "./bluesky-sign-in";
import styles from "./styles.module.css";

/** Loads the Account's saved choices into the draft and saves each change, like Settings. */
export function useImportScopeDraft(account: ImportScopeAccount): void {
  const flow = useImportScopeFlowActions();
  const draft = useImportScopeFlow();
  const key = JSON.stringify({
    id: account.id,
    source: account.source,
    sync: {
      importScope: account.sync.importScope,
      importPending: account.sync.importPending,
      syncLikes: account.sync.syncLikes,
    },
  } satisfies ImportScopeAccount);
  useEffect(() => () => flow.clear(), [flow]);
  useEffect(() => {
    flow.open(JSON.parse(key));
  }, [flow, key]);
  const unsaved =
    draft.accountId === account.id &&
    !draft.saving &&
    !draft.error &&
    draftChanged(draft) &&
    draftImportScope(draft) !== null;
  useEffect(() => {
    if (unsaved) void confirmImportScope(flow, { start: false });
  }, [flow, unsaved]);
}

export function ImportScopeLists({ accountId }: { accountId: string }) {
  const draft = useImportScopeFlow();
  const { source } = draft;
  if (draft.accountId !== accountId || !source) return null;
  const options = importScopeOptions(source);
  const label = getSourceDef(source).label;
  const collections = options.collections ? (
    <CollectionRows
      accountId={accountId}
      source={source}
      kind={options.collections}
    />
  ) : null;
  if (options.listKinds.length > 0) {
    return (
      <Settings.List className={styles.choices}>
        {options.listKinds.map((kind) =>
          source === "bluesky" && kind === "saved" ? (
            <BlueskyBookmarkRows key={kind} accountId={accountId} />
          ) : (
            <ListKindRows key={kind} source={source} kind={kind}>
              {kind === "saved" ? collections : null}
            </ListKindRows>
          ),
        )}
      </Settings.List>
    );
  }
  if (collections) {
    return (
      <Settings.List className={styles.choices}>{collections}</Settings.List>
    );
  }
  return (
    <p className={styles.note}>
      Pond imports everything you've saved on {label}. Choosing specific lists
      isn't available for {label} yet.
    </p>
  );
}

export function ImportScopeFilters({ accountId }: { accountId: string }) {
  const draft = useImportScopeFlow();
  const { source } = draft;
  if (draft.accountId !== accountId || !source) return null;
  const options = importScopeOptions(source);
  return (
    <Settings.List className={styles.choices}>
      {options.mediaKinds.length > 0 ? (
        <MediaKindsRow kinds={options.mediaKinds} />
      ) : null}
      {options.since ? <SinceRows source={source} /> : null}
    </Settings.List>
  );
}

/** Start Import for a new Account, and any reason the choice can't be saved. */
export function ImportScopeStatus() {
  const flow = useImportScopeFlowActions();
  const draft = useImportScopeFlow();
  if (!draft.source) return null;
  const scope = draftImportScope(draft);
  const empty = scope !== null && !importsAnyList(draft.source, scope);
  const ready = scope !== null && !empty;
  const problem =
    draft.error ??
    (scope === null || (empty && draft.starts)
      ? "Turn on at least one list to import from this Account."
      : null);
  const alert = problem ? (
    <p className={styles.error} role="alert">
      {problem}
    </p>
  ) : null;
  if (!draft.starts) return alert;
  return (
    <div className={styles.status}>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Not imported yet</Settings.ItemTitle>
            <Settings.ItemDescription>
              Nothing syncs until you start.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Button
              size="sm"
              variant="primary"
              disabled={!ready || draft.saving}
              onClick={() => void confirmImportScope(flow, { start: true })}
            >
              Start Import
            </Button>
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
      {alert}
    </div>
  );
}

async function confirmImportScope(
  flow: ImportScopeFlow,
  { start }: { start: boolean },
): Promise<void> {
  const draft = flow.snapshot();
  const scope = draftImportScope(draft);
  if (!draft.accountId || !draft.source || !scope || draft.saving) return;
  flow.setSaving(true);
  let result: OkResult;
  try {
    result = await saveImportScope({
      accountId: draft.accountId,
      source: draft.source,
      scope,
      start,
    });
  } catch {
    flow.fail("Pond couldn't save your choice. Try again.");
    return;
  }
  if (!result.ok) {
    flow.fail(result.error);
    return;
  }
  flow.markSaved(scope, { started: start });
}

/** Bookmarks stay visible but locked until Pond's bsky.app window is signed in as this Account. */
function BlueskyBookmarkRows({ accountId }: { accountId: string }) {
  const signedIn = useBlueskySignedIn(accountId, true);
  return (
    <ListKindRows source="bluesky" kind="saved" locked={!signedIn}>
      <BlueskySignIn accountId={accountId} />
    </ListKindRows>
  );
}

function ListKindRows({
  source,
  kind,
  locked = false,
  children,
}: {
  source: Source;
  kind: ListKind;
  locked?: boolean;
  children: ReactNode;
}) {
  const flow = useImportScopeFlowActions();
  const draft = useImportScopeFlow();
  const title = listKindLabel(source, kind);
  const description = listKindDescription(source, kind);
  return (
    <>
      <Settings.Item disabled={locked}>
        <Settings.ItemDetails>
          <Settings.ItemTitle>{title}</Settings.ItemTitle>
          {description ? (
            <Settings.ItemDescription>{description}</Settings.ItemDescription>
          ) : null}
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Switch.Root
            aria-label={title}
            checked={!locked && draft.listKinds.includes(kind)}
            disabled={locked}
            onCheckedChange={(next) => flow.setListKind(kind, next)}
          />
        </Settings.ItemControl>
      </Settings.Item>
      {children ? <div className={styles.nested}>{children}</div> : null}
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
  const flow = useImportScopeFlowActions();
  const draft = useImportScopeFlow();
  const nouns = collectionNouns(kind);
  const label = getSourceDef(source).label;
  const options = importScopeOptions(source);
  const savedOff =
    options.listKinds.length > 0 && !draft.listKinds.includes("saved");
  const nonePicked = draft.collections.length === 0;
  const filingOff = savedOff || (nonePicked && !options.fileEveryCollection);
  const [requested, setRequested] = useState(false);
  const query = useQuery({
    queryKey: ["import-options", accountId],
    queryFn: () => window.pond.query("accounts.importOptions", { accountId }),
    staleTime: 60_000,
    enabled: requested,
  });
  const failed = query.data && !query.data.ok ? query.data.error : null;
  const available = query.data?.ok ? (query.data.collections ?? []) : [];
  const names = new Map(
    [...draft.collections, ...available].map((c) => [c.id, c.name]),
  );
  const details = new Map(
    available.flatMap((c) =>
      c.itemCount == null ? [] : [[c.id, formatNumber(c.itemCount)] as const],
    ),
  );
  const ids = Array.from(
    new Set([
      ...available.map((c) => c.id),
      ...draft.collections.map((c) => c.id),
    ]),
  );
  return (
    <>
      <Settings.Item disabled={savedOff}>
        <Settings.ItemDetails>
          <Settings.ItemTitle>{nouns.title}</Settings.ItemTitle>
          {failed ? (
            <Settings.ItemDescription role="alert" title={failed}>
              {failed}
            </Settings.ItemDescription>
          ) : (
            <Settings.ItemDescription>
              Pick {nouns.many} to import only those.
            </Settings.ItemDescription>
          )}
        </Settings.ItemDetails>
        <Settings.ItemControl>
          {failed ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={savedOff}
              loading={query.isFetching}
              onClick={() => void query.refetch({ cancelRefetch: false })}
            >
              Try Again
            </Button>
          ) : (
            <ChipsField
              label={nouns.title}
              placeholder={nouns.all}
              items={ids}
              value={draft.collections.map((c) => c.id)}
              labelOf={(id) => names.get(id) ?? id}
              detailOf={(id) => details.get(id)}
              empty={
                !requested || query.isPending
                  ? `Loading ${nouns.many}`
                  : available.length === 0
                    ? `No ${nouns.many} found`
                    : `No ${nouns.many} match`
              }
              disabled={savedOff}
              onOpen={() => setRequested(true)}
              onValueChange={(next) =>
                flow.setCollections(
                  next.map((id) => ({ id, name: names.get(id) ?? id })),
                )
              }
            />
          )}
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item disabled={filingOff}>
        <Settings.ItemDetails>
          <Settings.ItemTitle className={styles.titled}>
            Add to Folders
            <Tooltip.Info
              label={
                nonePicked && !options.fileEveryCollection
                  ? `Pick a ${nouns.one} to put its saves in a matching Folder.`
                  : `Each save goes in a Folder named after its ${nouns.one}. Pond creates any Folder that's missing.`
              }
              aria-label="About Add to Folders"
            />
          </Settings.ItemTitle>
          <Settings.ItemDescription>
            Mirrors your {label} {nouns.one}s in Pond.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Switch.Root
            aria-label="Add to Folders"
            checked={!filingOff && draftFiles(draft)}
            disabled={filingOff}
            onCheckedChange={(next) => flow.setAddToFolders(next)}
          />
        </Settings.ItemControl>
      </Settings.Item>
    </>
  );
}

function MediaKindsRow({ kinds }: { kinds: readonly ImportMediaKind[] }) {
  const flow = useImportScopeFlowActions();
  const draft = useImportScopeFlow();
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Post Types</Settings.ItemTitle>
        <Settings.ItemDescription>
          Leave empty to import every type.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <ChipsField
          label="Post Types"
          placeholder="All Types"
          items={[...kinds]}
          value={[...draft.mediaKinds]}
          labelOf={(kind) => mediaKindLabel(kind)}
          empty="No types match"
          onValueChange={(next) =>
            flow.setMediaKinds(kinds.filter((kind) => next.includes(kind)))
          }
        />
      </Settings.ItemControl>
    </Settings.Item>
  );
}

function SinceRows({ source }: { source: Source }) {
  const flow = useImportScopeFlowActions();
  const draft = useImportScopeFlow();
  const custom = draft.sincePreset === "custom";
  const copy = sinceCopy(source);
  return (
    <>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle className={styles.titled}>
            {copy.title}
            {copy.info ? (
              <Tooltip.Info
                label={copy.info}
                aria-label={`About ${copy.title}`}
              />
            ) : null}
          </Settings.ItemTitle>
          <Settings.ItemDescription>
            {copy.description}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Select.Root
            value={draft.sincePreset}
            items={[...copy.presets]}
            onValueChange={(next) => {
              if (next) flow.setSincePreset(next);
            }}
          >
            <Select.Trigger
              size="sm"
              aria-label={copy.title}
              className={styles.control}
            >
              <Select.Value />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner align="end">
                <Select.Popup>
                  <Select.Items items={[...copy.presets]} />
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item disabled={!custom}>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Date</Settings.ItemTitle>
          <Settings.ItemDescription>
            Used when {copy.title} is Custom Date.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <DatePicker
            aria-label="Date"
            className={styles.date}
            value={draft.since}
            max={localDay(new Date())}
            disabled={!custom}
            onValueChange={(since) => flow.setSince(since)}
          />
        </Settings.ItemControl>
      </Settings.Item>
    </>
  );
}
