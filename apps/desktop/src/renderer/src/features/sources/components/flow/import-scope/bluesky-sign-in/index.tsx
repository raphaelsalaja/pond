import { Button, Settings } from "@pond/ui";
import type { AccountQueryResults } from "@shared/account-contracts";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const DESCRIPTION =
  "Bookmarks are private, so Pond reads them from bsky.app with you signed in.";

/** Checking loads bsky.app in a hidden window, so the answer is kept for a few minutes. */
function sessionQuery(accountId: string) {
  return queryOptions({
    queryKey: ["bluesky-session", accountId],
    queryFn: () => window.pond.query("accounts.blueskySession", { accountId }),
    staleTime: 5 * 60_000,
  });
}

export function useBlueskySignedIn(
  accountId: string,
  enabled: boolean,
): boolean {
  const session = useQuery({ ...sessionQuery(accountId), enabled });
  return session.data?.ok === true && session.data.signedIn;
}

export function BlueskySignIn({ accountId }: { accountId: string }) {
  const client = useQueryClient();
  const options = sessionQuery(accountId);
  const session = useQuery(options);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = session.data?.ok === true && session.data.signedIn;
  const handle = session.data?.ok ? session.data.handle : null;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const result = await window.pond.query("accounts.blueskySignIn", {
        accountId,
      });
      if (result.ok) {
        const next: AccountQueryResults["accounts.blueskySession"] = {
          ok: true,
          signedIn: true,
          handle: result.handle,
        };
        client.setQueryData(options.queryKey, next);
      } else if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Pond couldn't open the sign-in window. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const result = await window.pond.query("accounts.blueskySignOut", {
        accountId,
      });
      if (!result.ok) setError(result.error);
      await client.invalidateQueries({ queryKey: options.queryKey });
    } catch {
      setError("Pond couldn't sign out. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = session.isPending
    ? "Checking sign-in"
    : signedIn
      ? handle
        ? `Signed in as @${handle}`
        : "Signed in"
      : "Not signed in";

  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{title}</Settings.ItemTitle>
        {error ? (
          <Settings.ItemDescription data-error role="alert">
            {error}
          </Settings.ItemDescription>
        ) : (
          <Settings.ItemDescription>{DESCRIPTION}</Settings.ItemDescription>
        )}
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={session.isPending}
          onClick={() => void (signedIn ? signOut() : signIn())}
        >
          {signedIn ? "Sign Out" : "Sign In"}
        </Button>
      </Settings.ItemControl>
    </Settings.Item>
  );
}
