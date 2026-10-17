import type { Source } from "@pond/schema/db";
import { Dialog, Field, Input, type MenuItemSpec } from "@pond/ui";
import { accountImportScope } from "@shared/import-scope";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { SourceDetailsKind } from "@/features/library";
import { HeroAvatar } from "@/features/sources/components/flow/detail/hero-avatar";
import { buildFolderMenu } from "@/features/sources/components/page/lib/folder-menu";
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
  watchKindLabel,
} from "@/features/sources/hooks/use-watches";
import { importScopeSummary } from "@/features/sources/lib/import-scope";
import { getSourceDef } from "@/features/sources/lib/registry";
import {
  accountMenuTarget,
  buildSourceActionMenu,
  watchMenuTarget,
} from "@/features/sources/lib/source-menu";
import { sourceDetail } from "@/features/sources/state/source-detail";
import {
  type SyncSourceStatus,
  useSyncByAccount,
} from "@/features/sources/state/sync-monitor";
import { DetailsHero } from "@/shared/components/details-hero";
import { Section } from "@/shared/components/inspector-section";
import { PropertyList } from "@/shared/components/property-list";
import { formatNumber, formatTimestampLine } from "@/shared/lib/format";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import styles from "./styles.module.css";

export function SourceInspector({
  kind,
  id,
}: {
  kind: SourceDetailsKind;
  id: string;
}) {
  if (kind === "folder") return <FolderInspector />;
  return kind === "watch" ? (
    <WatchInspector id={id} />
  ) : (
    <AccountInspector id={id} />
  );
}

function fetchedLabel(model: CardModel): string {
  if (model.lastText === "now") return "Fetching now";
  if (model.lastText === "—") return "Not fetched yet";
  return `Last fetched ${model.lastText}`;
}

function FolderInspector() {
  const folder = useWatchedFolder();
  const client = useQueryClient();
  const status = folder.data;
  if (!status?.path) {
    return (
      <SourceInspectorView status={folder.isPending ? "loading" : "missing"} />
    );
  }
  const name = watchedFolderName(status.path);
  const imported = status.history.filter((item) => item.ok);
  const lastMs = imported[0]?.at ?? null;
  const menuItems = buildFolderMenu(
    { name, imported: imported.length, watching: status.enabled },
    () => void client.invalidateQueries({ queryKey: ["watched-folder"] }),
  );
  return (
    <SourceInspectorView
      key={status.path}
      status="ready"
      title={name}
      description={
        lastMs == null
          ? "Nothing imported yet"
          : `Last imported ${relativeTimeFromMs(lastMs)}`
      }
      source="local"
      menuItems={menuItems}
      properties={[
        { label: "Source", value: "Local" },
        { label: "Type", value: "Folder" },
        { label: "Location", value: status.path },
        { label: "Imported Items", value: formatNumber(imported.length) },
        { label: "Mode", value: status.mode === "move" ? "Move" : "Copy" },
        { label: "Status", value: status.enabled ? "Watching" : "Paused" },
      ]}
    />
  );
}

function AccountInspector({ id }: { id: string }) {
  const { accounts, loading, refetch } = useAccounts();
  const account = accounts.find((row) => row.id === id);
  const byAccount = useSyncByAccount();
  if (!account) {
    return <SourceInspectorView status={loading ? "loading" : "missing"} />;
  }
  const syncStatus = byAccount[account.id];
  const model = cardModel(syncStatus);
  const changed = () => {
    void refetch();
    sourceDetail.changed();
  };
  const menuItems = buildSourceActionMenu(accountMenuTarget(account, model), {
    accounts,
    onChanged: changed,
  });
  return (
    <SourceInspectorView
      key={account.id}
      status="ready"
      description={fetchedLabel(model)}
      handle={account.handle ? `@${account.handle}` : null}
      source={account.source}
      avatarUrl={account.avatarUrl}
      model={model}
      syncStatus={syncStatus}
      nickname={account.label ?? ""}
      menuItems={menuItems}
      properties={[
        { label: "Source", value: getSourceDef(account.source).label },
        { label: "Type", value: "Account" },
        {
          label: "Saved Items",
          value: formatNumber(account.sync.knownCount),
        },
        {
          label: "Imports",
          value: account.sync.importPending
            ? "Not started"
            : importScopeSummary(
                account.source,
                accountImportScope(account.source, account.sync),
              ),
        },
        { label: "Added", value: addedLabel(account.addedAt) },
      ]}
      onNicknameSave={async (value) => {
        await saveAccountNickname(account, value);
        changed();
      }}
    />
  );
}

function WatchInspector({ id }: { id: string }) {
  const { watches, loading, refetch } = useWatches();
  const { accounts } = useAccounts();
  const watch = watches.find((row) => row.id === id);
  const byAccount = useSyncByAccount();
  if (!watch) {
    return <SourceInspectorView status={loading ? "loading" : "missing"} />;
  }
  const syncStatus = byAccount[watch.id];
  const model = cardModel(syncStatus);
  const changed = () => {
    void refetch();
    sourceDetail.changed();
  };
  const menuItems = buildSourceActionMenu(watchMenuTarget(watch, model), {
    onChanged: changed,
  });
  return (
    <SourceInspectorView
      key={watch.id}
      status="ready"
      description={fetchedLabel(model)}
      handle={
        watch.kind === "playlist" || watch.kind === "list"
          ? watch.handle
          : `@${watch.handle}`
      }
      source={watch.source}
      avatarUrl={watch.avatarUrl}
      model={model}
      syncStatus={syncStatus}
      nickname={watch.label ?? ""}
      menuItems={menuItems}
      properties={watchProperties(watch, accounts)}
      onNicknameSave={async (value) => {
        await saveWatchNickname(watch, value);
        changed();
      }}
    />
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
    { label: "Source", value: getSourceDef(watch.source).label },
    { label: "Type", value: kind.charAt(0).toUpperCase() + kind.slice(1) },
    { label: "Saved Items", value: formatNumber(watch.sync.knownCount) },
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

interface SourceInspectorDetailsProps {
  title?: string;
  description?: string;
  handle?: string | null;
  source: Source;
  avatarUrl?: string | null;
  model?: CardModel;
  syncStatus?: SyncSourceStatus;
  nickname?: string;
  menuItems?: MenuItemSpec[];
  properties?: SourceInspectorProperty[];
  onNicknameSave?: (value: string) => Promise<void>;
}

export type SourceInspectorViewProps =
  | { status: "loading" }
  | { status: "missing" }
  | ({ status: "ready" } & SourceInspectorDetailsProps);

export function SourceInspectorView(props: SourceInspectorViewProps) {
  return (
    <>
      <Dialog.Header data-empty />
      <Dialog.Content className={styles.content}>
        {props.status === "loading" ? (
          <p className={styles.empty} role="status">
            Loading source details
          </p>
        ) : props.status === "missing" ? (
          <p className={styles.empty} role="status">
            This source is unavailable.
          </p>
        ) : (
          <SourceInspectorDetails {...props} />
        )}
      </Dialog.Content>
      <Dialog.Footer>
        <Dialog.Cancel>Done</Dialog.Cancel>
      </Dialog.Footer>
    </>
  );
}

function SourceInspectorDetails({
  title,
  handle,
  description,
  source,
  avatarUrl,
  model,
  syncStatus,
  nickname = "",
  menuItems = [],
  properties = [],
  onNicknameSave,
}: SourceInspectorDetailsProps) {
  const activity = model ? activityDetail(model, syncStatus) : null;
  return (
    <>
      <DetailsHero.Root>
        <DetailsHero.Media>
          <HeroAvatar
            source={source}
            avatarUrl={avatarUrl}
            size={88}
            badge={false}
          />
          <DetailsHero.Actions items={menuItems} aria-label="Source Actions" />
        </DetailsHero.Media>
        <DetailsHero.Copy>
          <DetailsHero.Title>
            {title || handle || nickname || getSourceDef(source).label}
          </DetailsHero.Title>
          {description ? (
            <DetailsHero.Description>{description}</DetailsHero.Description>
          ) : null}
        </DetailsHero.Copy>
      </DetailsHero.Root>
      {onNicknameSave ? (
        <NicknameField
          nickname={nickname}
          placeholder={handle ?? "Add a nickname"}
          onSave={onNicknameSave}
        />
      ) : null}
      {properties.length > 0 ? (
        <Section
          title="Properties"
          className={styles.section}
          collapsible={false}
        >
          <PropertyList.Root>
            {properties.map((property) => (
              <PropertyList.Row key={property.label}>
                <PropertyList.Label>{property.label}</PropertyList.Label>
                <PropertyList.Value>{property.value}</PropertyList.Value>
              </PropertyList.Row>
            ))}
          </PropertyList.Root>
        </Section>
      ) : null}
      {model && activity ? (
        <Section
          title="Activity"
          className={styles.section}
          collapsible={false}
        >
          <div className={styles.activity}>
            <p
              className={styles.detail}
              data-tone={
                model.tone === "err" || model.tone === "paused"
                  ? model.tone
                  : undefined
              }
            >
              {activity}
            </p>
            <SourceProgress progress={syncStatus?.progress} />
          </div>
        </Section>
      ) : null}
    </>
  );
}

function activityDetail(
  model: CardModel,
  syncStatus: SyncSourceStatus | undefined,
): string | null {
  if (syncStatus?.message) return syncStatus.message;
  if (model.tone === "err" && syncStatus?.lastError) {
    return syncStatus.lastError;
  }
  return null;
}

function SourceProgress({
  progress,
}: {
  progress: SyncSourceStatus["progress"] | undefined;
}) {
  if (!progress || progress.total <= 0) return null;
  const value = Math.min(
    100,
    Math.max(0, (progress.current / progress.total) * 100),
  );
  return (
    <div className={styles["progress-group"]}>
      <div className={styles.metrics}>
        <span>
          {formatNumber(progress.current)} of {formatNumber(progress.total)}{" "}
          saves
        </span>
        <span>{Math.round(value)}%</span>
      </div>
      <progress
        className={styles.progress}
        aria-label="Fetch progress"
        max={100}
        value={value}
      />
    </div>
  );
}

function NicknameField({
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
    <Field.Root className={styles.field} invalid={status === "error"}>
      <Field.Label>Nickname</Field.Label>
      <Input.Root>
        <Field.Control
          render={<Input.Field />}
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
      {status === "error" ? (
        <p className={styles["field-status"]} role="alert">
          Couldn't save. Focus the field and press Enter to try again.
        </p>
      ) : null}
    </Field.Root>
  );
}
