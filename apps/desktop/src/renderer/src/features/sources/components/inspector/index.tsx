import {
  IconArrowLeft,
  IconCalendar,
  IconFolder,
  IconGauge,
  IconGear3,
  IconHistory,
  IconLink2,
  IconSliders,
} from "@pond/icons";
import type { IncomingSaveRule, Source } from "@pond/schema/db";
import {
  watchHandleLabel,
  watchKindLabel,
  watchSourceLabel,
} from "@pond/schema/watches";
import { Button, Input, Settings, Sidebar } from "@pond/ui";
import type { SourceTargetInput } from "@shared/account-contracts";
import { useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { HeroAvatar } from "@/features/sources/components/flow/detail/hero-avatar";
import {
  ImportScopeFilters,
  ImportScopeLists,
  ImportScopeStatus,
  useImportScopeDraft,
} from "@/features/sources/components/flow/import-scope";
import { SourceActivity } from "@/features/sources/components/inspector/activity";
import { SourceOrganize } from "@/features/sources/components/inspector/organize";
import {
  type SourceIdentity,
  SourceOverview,
} from "@/features/sources/components/inspector/overview";
import { SourceSchedule } from "@/features/sources/components/inspector/schedule";
import { buildFolderRows } from "@/features/sources/components/page/lib/folder-menu";
import {
  type CardModel,
  cardModel,
} from "@/features/sources/components/sync-monitor/lib/helpers";
import {
  type AccountRow,
  useAccounts,
} from "@/features/sources/hooks/use-accounts";
import {
  useWatchedFolder,
  watchedFolderName,
} from "@/features/sources/hooks/use-watched-folder";
import {
  useWatches,
  type WatchRow,
} from "@/features/sources/hooks/use-watches";
import type { SourceFetchPrefs } from "@/features/sources/lib/fetch-prefs";
import {
  hasImportChoices,
  hasImportFilters,
  hasImportLists,
} from "@/features/sources/lib/import-scope";
import { getSourceDef } from "@/features/sources/lib/registry";
import {
  accountMenuTarget,
  buildSourceActionRows,
  type SourceActionRow,
  type SourceActionSections,
  watchMenuTarget,
} from "@/features/sources/lib/source-menu";
import {
  type SourceDetailsKind,
  type SourceDetailsPage,
  type SourceDetailTarget,
  sourceDetail,
  sourceDetailHref,
} from "@/features/sources/state/source-detail";
import { useSyncByAccount } from "@/features/sources/state/sync-monitor";
import { getAppRouter } from "@/shared/lib/app-router";
import { formatNumber, formatTimestampLine } from "@/shared/lib/format";
import { openSettings } from "@/shared/lib/open-settings";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import styles from "./styles.module.css";

type SourceDetailGroup = "import" | "fetching" | "end";

const GROUP_LABELS = {
  import: "Import",
  fetching: "Fetching",
  end: undefined,
} satisfies Record<SourceDetailGroup, string | undefined>;

export interface SourceDetailPageDef {
  id: SourceDetailsPage;
  label: string;
  icon: ReactNode;
  /** Pages without a group lead the sidebar. */
  group?: SourceDetailGroup;
  description?: string;
  /** Row titles on the page, so sidebar search finds the page by them. */
  items?: string[];
  /** The page draws its own heading. */
  bare?: boolean;
  content: ReactNode;
}

interface PageResult {
  page: SourceDetailPageDef;
  items: string[];
}

function searchPages(
  pages: readonly SourceDetailPageDef[],
  needle: string,
): PageResult[] {
  const entries = pages.flatMap((page) => [
    { page, title: page.label, description: page.description ?? "" },
    ...(page.items ?? []).map((title) => ({ page, title, description: "" })),
  ]);
  const fuse = new Fuse(entries, {
    ignoreLocation: true,
    threshold: 0.3,
    keys: [
      { name: "title", weight: 3 },
      { name: "description", weight: 1 },
    ],
  });
  const byPage = new Map<SourceDetailsPage, PageResult>();
  for (const { item } of fuse.search(needle)) {
    let result = byPage.get(item.page.id);
    if (!result) {
      result = { page: item.page, items: [] };
      byPage.set(item.page.id, result);
    }
    if (item.title !== item.page.label && !result.items.includes(item.title)) {
      result.items.push(item.title);
    }
  }
  return [...byPage.values()];
}

function groupPages(
  pages: readonly SourceDetailPageDef[],
): { group: SourceDetailGroup | "top"; pages: SourceDetailPageDef[] }[] {
  const order: (SourceDetailGroup | "top")[] = [
    "top",
    "import",
    "fetching",
    "end",
  ];
  return order
    .map((group) => ({
      group,
      pages: pages.filter((page) => (page.group ?? "top") === group),
    }))
    .filter((entry) => entry.pages.length > 0);
}

export type SourceDetailModel =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      name: string;
      pages: SourceDetailPageDef[];
      initialPage: SourceDetailsPage;
      /** Mounted beside every page so switching pages keeps shared state. */
      effect?: ReactNode;
    };

export function SourceDetailSidebar({ kind, id, page }: SourceDetailTarget) {
  return (
    <SourceDetailData kind={kind} id={id}>
      {(model) => (
        <SourceDetailNavView
          model={model}
          page={page}
          onSelect={(next) =>
            getAppRouter()?.history.replace(sourceDetailHref(kind, id, next))
          }
          onExit={sourceDetail.close}
        />
      )}
    </SourceDetailData>
  );
}

export function SourceDetail({ kind, id, page }: SourceDetailTarget) {
  return (
    <SourceDetailData kind={kind} id={id}>
      {(model) => (
        <>
          <SourceDetailName
            name={model.status === "ready" ? model.name : null}
          />
          <SourceDetailView model={model} page={page} />
        </>
      )}
    </SourceDetailData>
  );
}

function SourceDetailName({ name }: { name: string | null }) {
  useEffect(() => {
    sourceDetail.setName(name);
  }, [name]);
  useEffect(() => () => sourceDetail.setName(null), []);
  return null;
}

function SourceDetailData({
  kind,
  id,
  children,
}: {
  kind: SourceDetailsKind;
  id: string;
  children: (model: SourceDetailModel) => ReactNode;
}) {
  if (kind === "folder") return <FolderData>{children}</FolderData>;
  if (kind === "watch") return <WatchData id={id}>{children}</WatchData>;
  return <AccountData id={id}>{children}</AccountData>;
}

function resolveSourceDetailPage(
  model: SourceDetailModel,
  requested?: SourceDetailsPage,
): SourceDetailPageDef | null {
  if (model.status !== "ready") return null;
  const find = (id?: SourceDetailsPage) =>
    id ? model.pages.find((page) => page.id === id) : undefined;
  return find(requested) ?? find(model.initialPage) ?? model.pages[0] ?? null;
}

export function SourceDetailNavView({
  model,
  page,
  onSelect,
  onExit,
}: {
  model: SourceDetailModel;
  page?: SourceDetailsPage;
  onSelect: (page: SourceDetailsPage) => void;
  onExit?: () => void;
}) {
  const active = resolveSourceDetailPage(model, page);
  const [query, setQuery] = useState("");
  const needle = query.trim();
  const pages = model.status === "ready" ? model.pages : [];
  const results = useMemo(
    () => (needle ? searchPages(pages, needle) : null),
    [pages, needle],
  );
  const pageItem = (item: SourceDetailPageDef) => {
    const current = item.id === active?.id;
    return (
      <Sidebar.Item
        key={item.id}
        data-status={current ? "active" : undefined}
        aria-current={current ? "page" : undefined}
        onClick={() => onSelect(item.id)}
      >
        <Sidebar.Icon>{item.icon}</Sidebar.Icon>
        <Sidebar.ItemLabel>{item.label}</Sidebar.ItemLabel>
      </Sidebar.Item>
    );
  };
  return (
    <Sidebar.Root
      className={styles.sidebar}
      width="full"
      role="navigation"
      aria-label="Source"
    >
      {onExit ? (
        <Sidebar.Header className={styles.header}>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <IconArrowLeft aria-hidden />
            Back to Sources
          </Button>
        </Sidebar.Header>
      ) : null}
      {model.status === "ready" ? (
        <>
          <div className={styles.search}>
            <Sidebar.Search
              aria-label="Search source settings"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
            />
          </div>
          <Sidebar.Scroll>
            {results === null ? (
              groupPages(model.pages).map(({ group, pages }) => {
                const label = group === "top" ? undefined : GROUP_LABELS[group];
                return (
                  <Sidebar.Group key={group}>
                    {label ? (
                      <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
                    ) : null}
                    {pages.map(pageItem)}
                  </Sidebar.Group>
                );
              })
            ) : results.length === 0 ? (
              <Sidebar.Group>
                <Sidebar.Empty>No settings match.</Sidebar.Empty>
              </Sidebar.Group>
            ) : (
              results.map(({ page: result, items }) => (
                <Sidebar.Group key={result.id}>
                  {pageItem(result)}
                  {items.map((title) => (
                    <Sidebar.ResultButton
                      key={title}
                      onClick={() => onSelect(result.id)}
                    >
                      {title}
                    </Sidebar.ResultButton>
                  ))}
                </Sidebar.Group>
              ))
            )}
          </Sidebar.Scroll>
        </>
      ) : null}
    </Sidebar.Root>
  );
}

export function SourceDetailView({
  model,
  page,
}: {
  model: SourceDetailModel;
  page?: SourceDetailsPage;
}) {
  const active = resolveSourceDetailPage(model, page);
  if (model.status !== "ready" || !active) {
    return (
      <div className={styles.page} data-scroll-fade="vertical">
        <p className={styles.unavailable} role="status">
          {model.status === "loading"
            ? "Loading source details"
            : "This source is unavailable."}
        </p>
      </div>
    );
  }
  return (
    <div className={styles.page} data-scroll-fade="vertical">
      {model.effect}
      <Settings.Page>
        {active.bare ? null : (
          <Settings.Header>
            <Settings.HeaderText>
              <Settings.Title>{active.label}</Settings.Title>
              {active.description ? (
                <Settings.Description>
                  {active.description}
                </Settings.Description>
              ) : null}
            </Settings.HeaderText>
          </Settings.Header>
        )}
        {active.content}
      </Settings.Page>
    </div>
  );
}

function fetchedLabel(model: CardModel): string {
  if (model.lastText === "now") return "Fetching now";
  if (model.lastText === "—") return "Not fetched yet";
  return `Last fetched ${model.lastText}`;
}

function FolderData({
  children,
}: {
  children: (model: SourceDetailModel) => ReactNode;
}) {
  const folder = useWatchedFolder();
  const client = useQueryClient();
  const status = folder.data;
  if (!status?.path) {
    return children({ status: folder.isPending ? "loading" : "missing" });
  }
  const name = watchedFolderName(status.path);
  const imported = status.history.filter((item) => item.ok);
  const lastMs = imported[0]?.at ?? null;
  const actions = buildFolderRows(
    {
      name,
      path: status.path,
      imported: imported.length,
      watching: status.enabled,
      mode: status.mode,
    },
    () => void client.invalidateQueries({ queryKey: ["watched-folder"] }),
  );
  return children(
    sourceDetailModel({
      title: name,
      description:
        lastMs == null
          ? "Nothing imported yet"
          : `Last imported ${relativeTimeFromMs(lastMs)}`,
      source: "local",
      actions,
      properties: [
        { label: "Source", value: "Local" },
        { label: "Type", value: "Folder" },
        { label: "Imported Items", value: formatNumber(imported.length) },
        { label: "Status", value: status.enabled ? "Watching" : "Paused" },
      ],
    }),
  );
}

function AccountData({
  id,
  children,
}: {
  id: string;
  children: (model: SourceDetailModel) => ReactNode;
}) {
  const { accounts, loading, refetch } = useAccounts();
  const account = accounts.find((row) => row.id === id);
  const byAccount = useSyncByAccount();
  if (!account) {
    return children({ status: loading ? "loading" : "missing" });
  }
  const model = cardModel(byAccount[account.id]);
  const changed = () => {
    void refetch();
    sourceDetail.changed();
  };
  const actions = buildSourceActionRows(accountMenuTarget(account, model), {
    accounts,
    onChanged: changed,
  });
  const imports =
    account.sync.importPending || hasImportChoices(account.source);
  const filters = hasImportFilters(account.source);
  const lists = hasImportLists(account.source) || !filters;
  const target = { kind: "account", id: account.id } as const;
  const pages: SourceDetailPageDef[] = [];
  if (imports) {
    pages.push({
      id: "filters",
      label: "Filters",
      icon: <IconSliders />,
      group: "import",
      description: "Only what passes here reaches your library.",
      items: [
        ...(lists ? ["Lists", "Collections", "Add to Folders"] : []),
        ...(filters ? ["Post Types", "Date"] : []),
      ],
      content: (
        <>
          <ImportScopeStatus />
          {lists ? (
            <Settings.Section>
              <Settings.SectionTitle>Lists</Settings.SectionTitle>
              <ImportScopeLists accountId={account.id} />
            </Settings.Section>
          ) : null}
          {filters ? (
            <Settings.Section>
              <Settings.SectionTitle>Posts</Settings.SectionTitle>
              <ImportScopeFilters accountId={account.id} />
            </Settings.Section>
          ) : null}
        </>
      ),
    });
  }
  pages.push(
    organizePage(target, account.sync.incoming, changed),
    schedulePage(target, account.sync, actions.fetch, model, changed),
    activityPage(account.id, account.source),
  );
  return children(
    sourceDetailModel({
      handle: account.handle ? `@${account.handle}` : null,
      source: account.source,
      avatarUrl: account.avatarUrl,
      nickname: account.label ?? "",
      actions,
      overview: overviewPage(account.id, account.source, model, {
        name: accountLabel(account),
        handle: account.handle ? `@${account.handle}` : null,
        avatarUrl: account.avatarUrl,
      }),
      pages,
      initialPage: account.sync.importPending ? "filters" : "overview",
      effect: imports ? (
        <ImportScopeDraft key={account.id} account={account} />
      ) : undefined,
      onNicknameSave: async (value) => {
        await saveAccountNickname(account, value);
        changed();
      },
    }),
  );
}

function ImportScopeDraft({ account }: { account: AccountRow }) {
  useImportScopeDraft(account);
  return null;
}

function WatchData({
  id,
  children,
}: {
  id: string;
  children: (model: SourceDetailModel) => ReactNode;
}) {
  const { watches, loading, refetch } = useWatches();
  const { accounts } = useAccounts();
  const watch = watches.find((row) => row.id === id);
  const byAccount = useSyncByAccount();
  if (!watch) {
    return children({ status: loading ? "loading" : "missing" });
  }
  const model = cardModel(byAccount[watch.id]);
  const changed = () => {
    void refetch();
    sourceDetail.changed();
  };
  const actions = buildSourceActionRows(watchMenuTarget(watch, model), {
    onChanged: changed,
  });
  const target = { kind: "watch", id: watch.id } as const;
  const handle = watchHandleLabel(watch.handle, watch.kind);
  return children(
    sourceDetailModel({
      handle,
      source: watch.source,
      avatarUrl: watch.avatarUrl,
      nickname: watch.label ?? "",
      actions,
      properties: watchProperties(watch, accounts),
      overview: overviewPage(watch.id, watch.source, model, {
        name: watch.label || handle,
        handle,
        avatarUrl: watch.avatarUrl,
      }),
      pages: [
        organizePage(target, watch.sync.incoming, changed),
        schedulePage(target, watch.sync, actions.fetch, model, changed),
        activityPage(watch.id, watch.source),
      ],
      initialPage: "overview",
      onNicknameSave: async (value) => {
        await saveWatchNickname(watch, value);
        changed();
      },
    }),
  );
}

interface SourceInspectorProperty {
  label: string;
  value: string;
}

function addedLabel(value: string): string {
  return formatTimestampLine(value) || "—";
}

function accountLabel(account: AccountRow): string {
  if (account.label) return account.label;
  if (account.handle) return `@${account.handle}`;
  return getSourceDef(account.source).label;
}

function watchProperties(
  watch: WatchRow,
  accounts: readonly AccountRow[],
): SourceInspectorProperty[] {
  const kind = watchKindLabel(watch.kind);
  const properties: SourceInspectorProperty[] = [
    { label: "Source", value: watchSourceLabel(watch.source) },
    { label: "Type", value: kind.charAt(0).toUpperCase() + kind.slice(1) },
    { label: "Added", value: addedLabel(watch.addedAt) },
  ];
  const via = accounts.find((account) => account.id === watch.via);
  if (via) {
    properties.push({ label: "Connected Via", value: accountLabel(via) });
  }
  return properties;
}

async function saveAccountNickname(
  account: AccountRow,
  value: string,
): Promise<void> {
  const next = value.trim() || null;
  if (next === account.label) return;
  await window.pond.query("accounts.setLabel", {
    accountId: account.id,
    label: next,
  });
}

async function saveWatchNickname(
  watch: WatchRow,
  value: string,
): Promise<void> {
  const next = value.trim() || null;
  if (next === watch.label) return;
  await window.pond.query("watches.setLabel", {
    watchId: watch.id,
    label: next,
  });
}

export interface SourceDetailsProps {
  title?: string;
  description?: string;
  handle?: string | null;
  source: Source;
  avatarUrl?: string | null;
  nickname?: string;
  actions?: SourceActionSections;
  properties?: SourceInspectorProperty[];
  /** Leads the sidebar, before General. */
  overview?: SourceDetailPageDef;
  /** Pages after General; Connection always comes last. */
  pages?: SourceDetailPageDef[];
  initialPage?: SourceDetailsPage;
  effect?: ReactNode;
  onNicknameSave?: (value: string) => Promise<void>;
}

export function sourceDetailModel({
  title,
  handle,
  description,
  source,
  avatarUrl,
  nickname = "",
  actions,
  properties = [],
  overview,
  pages = [],
  initialPage = "general",
  effect,
  onNicknameSave,
}: SourceDetailsProps): SourceDetailModel {
  const general: SourceDetailPageDef = {
    id: "general",
    label: "General",
    icon: <IconGear3 />,
    description,
    items: [
      ...(source !== "local" && source !== "web"
        ? ["Profile Picture", "Image and Video Downloads"]
        : []),
      ...(onNicknameSave ? ["Nickname"] : []),
      ...(actions?.profile ?? []).map((row) => row.title),
      ...properties.map((property) => property.label),
    ],
    content: (
      <GeneralPage
        handle={handle}
        source={source}
        avatarUrl={avatarUrl}
        nickname={nickname}
        properties={properties}
        actions={actions}
        onNicknameSave={onNicknameSave}
      />
    ),
  };
  const connection: SourceDetailPageDef | null =
    actions && actions.connection.length > 0
      ? {
          id: "connection",
          label: "Connection",
          icon: <IconLink2 />,
          group: "end",
          items: actions.connection.map((row) => row.title),
          content: <ActionRows rows={actions.connection} />,
        }
      : null;
  return {
    status: "ready",
    name: title || handle || nickname || getSourceDef(source).label,
    pages: [
      ...(overview ? [overview] : []),
      general,
      ...pages,
      ...(connection ? [connection] : []),
    ],
    initialPage,
    effect,
  };
}

function ActionRows({ rows }: { rows: SourceActionRow[] }) {
  return (
    <Settings.List>
      {rows.map((row) => (
        <Settings.Item key={row.id} disabled={row.disabled}>
          <Settings.ItemDetails>
            <Settings.ItemTitle>{row.title}</Settings.ItemTitle>
            {row.description ? (
              <Settings.ItemDescription>
                {row.description}
              </Settings.ItemDescription>
            ) : null}
          </Settings.ItemDetails>
          <Settings.ItemControl className={styles.control}>
            {row.value ? (
              <span className={styles.value}>{row.value}</span>
            ) : null}
            {row.actions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.variant ?? "secondary"}
                disabled={row.disabled}
                aria-label={action.name}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </Settings.ItemControl>
        </Settings.Item>
      ))}
    </Settings.List>
  );
}

function overviewPage(
  id: string,
  source: Source,
  model: CardModel,
  identity: SourceIdentity,
): SourceDetailPageDef {
  return {
    id: "overview",
    label: "Overview",
    icon: <IconGauge />,
    bare: true,
    items: ["Saves", "On Disk", "Success Rate", "Recent Saves"],
    content: (
      <SourceOverview
        id={id}
        source={source}
        model={model}
        identity={identity}
      />
    ),
  };
}

function organizePage(
  target: SourceTargetInput,
  incoming: IncomingSaveRule | undefined,
  onChanged: () => void,
): SourceDetailPageDef {
  return {
    id: "organize",
    label: "Organize",
    icon: <IconFolder />,
    group: "import",
    description: "Files saves new to your library as they arrive.",
    items: ["Add to Folder", "Add Tags"],
    content: (
      <SourceOrganize
        key={target.id}
        target={target}
        incoming={incoming}
        onChanged={onChanged}
      />
    ),
  };
}

function schedulePage(
  target: SourceTargetInput,
  sync: SourceFetchPrefs,
  rows: SourceActionRow[],
  model: CardModel,
  onChanged: () => void,
): SourceDetailPageDef {
  return {
    id: "schedule",
    label: "Schedule",
    icon: <IconCalendar />,
    group: "fetching",
    description: fetchedLabel(model),
    items: [
      "Automatic Fetching",
      "Fetch Interval",
      "Schedule in Settings",
      ...rows.map((row) => row.title),
    ],
    content: (
      <SourceSchedule
        key={target.id}
        target={target}
        sync={sync}
        onChanged={onChanged}
        actions={<ActionRows rows={rows} />}
      />
    ),
  };
}

function activityPage(id: string, source: Source): SourceDetailPageDef {
  return {
    id: "activity",
    label: "Activity",
    icon: <IconHistory />,
    group: "fetching",
    description: "Every fetch from this source, newest first.",
    content: <SourceActivity id={id} source={source} />,
  };
}

function GeneralPage({
  handle,
  source,
  avatarUrl,
  nickname,
  properties,
  actions,
  onNicknameSave,
}: Pick<
  SourceDetailsProps,
  "handle" | "source" | "avatarUrl" | "actions" | "onNicknameSave"
> & {
  nickname: string;
  properties: SourceInspectorProperty[];
}) {
  const picture = source !== "local" && source !== "web";
  return (
    <>
      {picture || onNicknameSave ? (
        <Settings.List>
          {picture ? (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Profile Picture</Settings.ItemTitle>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <HeroAvatar
                  source={source}
                  avatarUrl={avatarUrl}
                  size={36}
                  badgeSize={14}
                />
              </Settings.ItemControl>
            </Settings.Item>
          ) : null}
          {onNicknameSave ? (
            <NicknameItem
              nickname={nickname}
              placeholder={handle ?? "Add a nickname"}
              onSave={onNicknameSave}
            />
          ) : null}
        </Settings.List>
      ) : null}
      {actions && actions.profile.length > 0 ? (
        <Settings.Section>
          <Settings.SectionTitle>{actions.kind}</Settings.SectionTitle>
          <ActionRows rows={actions.profile} />
        </Settings.Section>
      ) : null}
      {properties.length > 0 ? (
        <Settings.Section>
          <Settings.SectionTitle>Properties</Settings.SectionTitle>
          <ActionRows
            rows={properties.map((property) => ({
              id: property.label,
              title: property.label,
              value: property.value,
              actions: [],
            }))}
          />
        </Settings.Section>
      ) : null}
      {picture ? (
        <Settings.Section>
          <Settings.SectionTitle>Downloads</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>
                  Image and Video Downloads
                </Settings.ItemTitle>
                <Settings.ItemDescription>
                  Quality and formats for every {getSourceDef(source).label}{" "}
                  save.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Open ${getSourceDef(source).label} Download Settings`}
                  onClick={() => openSettings(`sources-${source}`)}
                >
                  Open
                </Button>
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>
        </Settings.Section>
      ) : null}
    </>
  );
}

function NicknameItem({
  nickname,
  placeholder,
  onSave,
}: {
  nickname: string;
  placeholder: string;
  onSave: (value: string) => Promise<void>;
}) {
  const savedValue = useRef(nickname);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  useEffect(() => {
    savedValue.current = nickname;
  }, [nickname]);
  const save = async (next: string) => {
    if (next === savedValue.current) return;
    setStatus("saving");
    try {
      await onSave(next);
      savedValue.current = next;
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Nickname</Settings.ItemTitle>
        {status === "error" ? (
          <span className={styles["field-status"]} role="alert">
            Couldn't save. Focus the field and press Enter to try again.
          </span>
        ) : (
          <Settings.ItemDescription>
            Shown instead of the handle across Pond.
          </Settings.ItemDescription>
        )}
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Input.Root className={styles.nickname}>
          <Input.Field
            aria-label="Nickname"
            aria-invalid={status === "error" || undefined}
            defaultValue={nickname}
            placeholder={placeholder}
            maxLength={255}
            disabled={status === "saving"}
            onChange={() => setStatus("idle")}
            onBlur={(event) => void save(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </Input.Root>
      </Settings.ItemControl>
    </Settings.Item>
  );
}
