import { Button, Dialog, Settings } from "@pond/ui";
import { SHARE_HOST_PROVIDER_LABELS } from "@shared/share-link-contracts";
import type { ShareHostSummary, ShareLink } from "@shared/share-link-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { copyShareLink, openShareLink } from "@/features/share-links/lib/share";
import { formatBytes, formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { ShareHostDialog } from "../host-dialog";

const HOST_KEY = ["share-host"];
const LINKS_KEY = ["share-links"];

const KIND_LABELS = {
  save: "Save",
  selection: "Saves",
  folder: "Folder",
} as const satisfies Record<ShareLink["kind"], string>;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function ShareLinksSection() {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const host = useQuery({
    queryKey: HOST_KEY,
    queryFn: async () => (await window.pond.query("shareHost.get", {})).host,
  });
  const links = useQuery({
    queryKey: LINKS_KEY,
    queryFn: () => window.pond.query("shareLinks.list", {}),
    /** Uploads finish in main; the list follows them until none is running. */
    refetchInterval: (state) =>
      state.state.data?.some((link) => link.status === "uploading")
        ? 1500
        : false,
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: HOST_KEY }),
      client.invalidateQueries({ queryKey: LINKS_KEY }),
    ]).then(() => undefined);

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Share Links</Settings.Title>
          <Settings.Description>
            Publish read-only pages of Saves and Folders to storage you own.
            There is no Pond server: anyone with a link reads it from your Share
            Host.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>
      <Settings.Section>
        <Settings.SectionDetails>
          <Settings.SectionTitle>Share Host</Settings.SectionTitle>
        </Settings.SectionDetails>
        <Settings.List>
          <HostRow
            host={host.data ?? null}
            loading={host.isPending}
            onEdit={() => setEditing(true)}
            onRemoved={refresh}
          />
        </Settings.List>
      </Settings.Section>
      <Settings.Section>
        <Settings.SectionDetails>
          <Settings.SectionTitle>Links</Settings.SectionTitle>
        </Settings.SectionDetails>
        <Settings.List>
          {links.data?.length ? (
            links.data.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                canChange={Boolean(host.data)}
                onChanged={refresh}
              />
            ))
          ) : (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>
                  {links.isPending ? "Loading Share Links" : "No Share Links"}
                </Settings.ItemTitle>
                <Settings.ItemDescription>
                  Choose Create Share Link from a Save&apos;s or Folder&apos;s
                  Export menu.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
            </Settings.Item>
          )}
        </Settings.List>
      </Settings.Section>
      {editing ? (
        <ShareHostDialog
          host={host.data ?? null}
          onSaved={refresh}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Settings.Page>
  );
}

function HostRow({
  host,
  loading,
  onEdit,
  onRemoved,
}: {
  host: ShareHostSummary | null;
  loading: boolean;
  onEdit: () => void;
  onRemoved: () => Promise<void>;
}) {
  if (!host) {
    return (
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>
            {loading ? "Loading" : "No Share Host"}
          </Settings.ItemTitle>
          <Settings.ItemDescription>
            A bucket you own, such as Cloudflare R2.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={onEdit}
          >
            Set Up
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
    );
  }
  const expiry = host.expireAfterDays
    ? `New links expire after ${formatPlural(host.expireAfterDays, { one: "day", other: "days" })}.`
    : "New links stay until you stop sharing them.";
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>
          {SHARE_HOST_PROVIDER_LABELS[host.provider]} · {host.bucket}
        </Settings.ItemTitle>
        <Settings.ItemDescription>
          {host.publicUrl}. {expiry}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            Dialog.confirm({
              title: "Remove Share Host",
              description:
                "Links you've shared stay online. Pond can't update or remove them until you set up this host again.",
              confirmLabel: "Remove",
              confirmVariant: "destructive",
              onConfirm: async () => {
                await window.pond.query("shareHost.remove", {});
                await onRemoved();
              },
            })
          }
        >
          Remove
        </Button>
      </Settings.ItemControl>
    </Settings.Item>
  );
}

function linkDetails(link: ShareLink): string {
  if (link.status === "uploading") return "Uploading…";
  if (link.status === "failed")
    return `Didn't finish: ${link.error ?? "the upload stopped."}`;
  const parts = [
    KIND_LABELS[link.kind],
    formatPlural(link.saves, { one: "Save", other: "Saves" }),
    formatBytes(link.bytes),
    link.expiresAt
      ? `Expires ${dateFormat.format(new Date(link.expiresAt))}`
      : `Shared ${dateFormat.format(new Date(link.createdAt))}`,
  ];
  return parts.join(" · ");
}

function LinkRow({
  link,
  canChange,
  onChanged,
}: {
  link: ShareLink;
  canChange: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function update() {
    setBusy(true);
    const result = await window.pond.query("shareLinks.update", {
      id: link.id,
    });
    setBusy(false);
    await onChanged();
    if (!result.ok && !("reason" in result)) {
      notify({
        id: "share-link",
        title: "Couldn't Update the Share Link",
        description: result.error,
      });
    } else if (result.ok) {
      notify({
        id: "share-link",
        title: "Share Link Updated",
        description: link.title,
      });
    }
  }

  async function copy() {
    const copied = await copyShareLink(link.url);
    notify({
      id: "share-link",
      title: copied ? "Share Link Copied" : "Couldn't Copy the Link",
    });
  }

  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{link.title}</Settings.ItemTitle>
        <Settings.ItemDescription>{linkDetails(link)}</Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        {link.status === "live" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openShareLink(link.url)}
            >
              Open
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void copy()}>
              Copy Link
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={!canChange || busy || link.status === "uploading"}
          onClick={() => void update()}
        >
          {link.status === "failed" ? "Retry" : "Update"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canChange || link.status === "uploading"}
          onClick={() =>
            Dialog.confirm({
              title: "Stop Sharing",
              description: `Pond deletes ${link.title} and its files from your Share Host, so the link stops working. Anyone who saved copies keeps them.`,
              confirmLabel: "Stop Sharing",
              confirmVariant: "destructive",
              onConfirm: async () => {
                const result = await window.pond.query("shareLinks.stop", {
                  id: link.id,
                });
                await onChanged();
                if (!result.ok) throw new Error(result.error);
              },
            })
          }
        >
          Stop Sharing
        </Button>
      </Settings.ItemControl>
    </Settings.Item>
  );
}
