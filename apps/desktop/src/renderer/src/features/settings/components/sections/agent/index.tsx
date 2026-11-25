import { Button, Loader, Settings } from "@pond/ui";
import log from "electron-log/renderer";
import { useCallback, useEffect, useState } from "react";
import { savePrefsSection, usePrefs } from "@/shared/state/prefs";
import {
  addedProvidersWith,
  GROUPS,
  ProviderSettings,
} from "./provider-settings";
import { keyRowsSchema } from "./types";
import type { KeyRow } from "./types";
import styles from "./styles.module.css";

async function loadKeys(): Promise<Array<KeyRow>> {
  return keyRowsSchema.parse(await window.pond.query("agent.keys", {}));
}

function ProvidersLoading() {
  return (
    <>
      <Loader.Root className={styles.status}>Loading providers</Loader.Root>
      {GROUPS.map((group) => (
        <Settings.Section key={group.title} aria-hidden="true">
          <Settings.SectionDetails>
            <Settings.SectionTitle>{group.title}</Settings.SectionTitle>
          </Settings.SectionDetails>
          <Settings.List>
            <Settings.Card className={styles.pending}>
              <span className={styles.bone} data-part="logo" />
              <span className={styles.bone} data-part="title" />
              <span className={styles.bone} data-part="control" />
            </Settings.Card>
            <Settings.Card className={styles.pending}>
              <span className={styles.bone} data-part="logo" />
              <span className={styles.bone} data-part="title" />
              <span className={styles.bone} data-part="control" />
            </Settings.Card>
          </Settings.List>
        </Settings.Section>
      ))}
    </>
  );
}

export function AgentSection() {
  const [agent, , loaded] = usePrefs("agent");
  const [error, setError] = useState("");
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [keys, setKeys] = useState<Array<KeyRow>>([]);

  const showKeys = useCallback((rows: Array<KeyRow>) => {
    setKeys(rows);
    setKeysLoaded(true);
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    showKeys(await loadKeys());
  }, [showKeys]);

  const fail = useCallback((cause: unknown) => {
    log.error(cause);
    setError("Could not load providers. Try again.");
  }, []);

  useEffect(() => {
    void loadKeys()
      .then((rows) => {
        showKeys(rows);
      })
      .catch(fail);
  }, [showKeys, fail]);

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Providers</Settings.Title>
          <Settings.Description>
            Connect the AI providers your fish use with your keys or a local
            host you run.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>

      {loaded && keysLoaded ? (
        <ProviderSettings
          agent={agent}
          keys={keys}
          onAdd={(provider) => {
            void savePrefsSection("agent", {
              addedProviders: addedProvidersWith(
                agent.addedProviders,
                keys,
                provider,
              ),
            });
          }}
          onPatchAgent={(patch) => savePrefsSection("agent", patch)}
          onRefresh={refresh}
        />
      ) : error ? (
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Providers unavailable</Settings.ItemTitle>
              <Settings.ItemDescription>{error}</Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => void refresh().catch(fail)}>
                Retry
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      ) : (
        <ProvidersLoading />
      )}
    </Settings.Page>
  );
}
