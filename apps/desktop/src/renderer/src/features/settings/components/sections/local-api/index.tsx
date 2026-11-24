import { API_TOKEN_SCOPE_LABELS } from "@pond/schema/api";
import type { ApiTokenInfo } from "@pond/schema/api";
import { Button, Dialog, Settings } from "@pond/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import { CreateTokenDialog } from "./create-dialog";

const TOKENS_KEY = ["api-tokens"];

export function LocalApiSection() {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const tokens = useQuery({
    queryKey: TOKENS_KEY,
    queryFn: async () => (await window.pond.query("apiTokens.list", {})).tokens,
  });
  const refresh = () => client.invalidateQueries({ queryKey: TOKENS_KEY });

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Local API</Settings.Title>
          <Settings.Description>
            Let scripts and apps on {THIS_DEVICE} use this library over HTTP
            while Pond is open.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>
      <Settings.Section>
        <Settings.SectionDetails>
          <Settings.SectionTitle>Tokens</Settings.SectionTitle>
          <Settings.SectionAction>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCreating(true)}
            >
              New Token
            </Button>
          </Settings.SectionAction>
        </Settings.SectionDetails>
        <Settings.List>
          {tokens.data?.length ? (
            tokens.data.map((token) => (
              <TokenRow key={token.id} token={token} onRevoked={refresh} />
            ))
          ) : (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>
                  {tokens.isPending ? "Loading tokens" : "No tokens"}
                </Settings.ItemTitle>
                <Settings.ItemDescription>
                  Give each tool its own token so you can revoke it alone.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
            </Settings.Item>
          )}
        </Settings.List>
      </Settings.Section>
      {creating ? (
        <CreateTokenDialog
          onCreated={refresh}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </Settings.Page>
  );
}

function TokenRow({
  token,
  onRevoked,
}: {
  token: ApiTokenInfo;
  onRevoked: () => Promise<void>;
}) {
  const access = token.scopes
    .map((scope) => API_TOKEN_SCOPE_LABELS[scope])
    .join(", ");
  const used = token.lastUsedAt
    ? `Last used ${relativeTimeFromMs(token.lastUsedAt)}`
    : "Never used";
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{token.name}</Settings.ItemTitle>
        <Settings.ItemDescription>
          {access}. {used}.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            Dialog.confirm({
              title: "Revoke Token",
              description: `Tools using ${token.name} lose access right away.`,
              confirmLabel: "Revoke",
              confirmVariant: "destructive",
              onConfirm: async () => {
                const { ok } = await window.pond.query("apiTokens.revoke", {
                  id: token.id,
                });
                await onRevoked();
                if (!ok) {
                  throw new Error("That token was already revoked.");
                }
              },
            })
          }
        >
          Revoke
        </Button>
      </Settings.ItemControl>
    </Settings.Item>
  );
}
