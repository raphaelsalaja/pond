import { Button, Dialog, Field, Input } from "@pond/ui";
import type { QueryInput, QueryResult } from "@shared/query-contracts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { importMymindExport } from "@/features/sources/lib/mymind-export";
import { mymindConnectFlow } from "@/features/sources/state/mymind-connect-flow";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { gentleSpring } from "@/shared/lib/motion";
import styles from "./styles.module.css";

type ConnectInput = QueryInput<"accounts.connectMymind">;
type ConnectResult = QueryResult<"accounts.connectMymind">;

interface MymindConnectFormProps {
  accountId?: string;
  active?: boolean;
  connect: (input: ConnectInput) => Promise<ConnectResult>;
  onConnected: (accountId: string) => void;
  importOlder: () => Promise<void>;
  openExtensions: () => void;
}

const FORM_ID = "connect-mymind";

export function MymindConnectForm({
  accountId,
  active = true,
  connect,
  onConnected,
  importOlder,
  openExtensions,
}: MymindConnectFormProps) {
  const [kid, setKid] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const request = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!active) {
      request.current += 1;
      setKid("");
      setSecret("");
      setError(null);
    }
    return () => {
      request.current += 1;
    };
  }, [active]);

  const submit = async () => {
    if (!active || submitting.current || !kid.trim() || !secret.trim()) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const revision = request.current;
    try {
      const input: ConnectInput = {
        kid: kid.trim(),
        secret: secret.trim(),
      };
      if (accountId) input.accountId = accountId;
      const result = await connect(input);
      if (revision !== request.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKid("");
      setSecret("");
      onConnected(result.account.id);
    } catch {
      if (revision === request.current)
        setError("Pond could not connect to mymind. Try again.");
    } finally {
      submitting.current = false;
      if (revision === request.current) setBusy(false);
    }
  };

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>
          {accountId ? "Reconnect mymind" : "Connect mymind"}
        </Dialog.Title>
        <Dialog.Close />
      </Dialog.Header>
      <Dialog.Viewport>
        <div className={styles.body}>
          <p className={styles.description}>
            Pond imports items you save in mymind after you connect. To import
            older items, use your mymind export.
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void importOlder()}
          >
            Import mymind Export
          </Button>
          <form
            id={FORM_ID}
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p className={styles.description}>
              Create a read-only key in mymind, then enter its ID and secret.{" "}
              <Button
                type="button"
                size="xs"
                variant="link"
                onClick={openExtensions}
              >
                Open mymind Extensions
              </Button>
            </p>
            <Field.Root>
              <Field.Label>Key ID</Field.Label>
              <Input.Root>
                <Input.Field
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={kid}
                  disabled={busy}
                  onChange={(event) => setKid(event.target.value)}
                />
              </Input.Root>
            </Field.Root>
            <Field.Root>
              <Field.Label>Key Secret</Field.Label>
              <Input.Root>
                <Input.Field
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  disabled={busy}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </Input.Root>
            </Field.Root>
            <AnimatePresence initial={false}>
              {error ? (
                <motion.div
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : gentleSpring}
                  className={styles.error}
                >
                  <p role="alert">{error}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </form>
        </div>
      </Dialog.Viewport>
      <Dialog.Footer>
        <Button
          type="submit"
          form={FORM_ID}
          loading={busy}
          disabled={!active || busy || !kid.trim() || !secret.trim()}
        >
          {accountId ? "Reconnect" : "Connect"}
        </Button>
      </Dialog.Footer>
    </>
  );
}

export function MymindConnectPage({
  accountId,
  active,
}: {
  accountId?: string;
  active: boolean;
}) {
  return (
    <MymindConnectForm
      accountId={accountId}
      active={active}
      connect={(input) => window.pond.query("accounts.connectMymind", input)}
      onConnected={(id) => {
        void refetchAccounts();
        mymindConnectFlow.complete();
        sourceFlow.close();
        sourceDetail.openAccount(id);
      }}
      importOlder={async () => {
        sourceFlow.close();
        mymindConnectFlow.clear();
        await importMymindExport();
      }}
      openExtensions={() =>
        void window.pond.openExternal("https://access.mymind.com/extensions")
      }
    />
  );
}
