import { Button, Settings } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { savePrefsSection, usePrefs } from "@/shared/state/prefs";
import { ModelCatalogTable } from "./catalog-table";
import { ModelsLoading } from "./loading";
import { useModelsCatalog } from "./use-models-catalog";
import styles from "./styles.module.css";

export { ModelCatalogTable } from "./catalog-table";
export type { CatalogModel } from "./types";

function CatalogUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Models unavailable</Settings.ItemTitle>
          <Settings.ItemDescription>{message}</Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}

export function ModelsSection() {
  const [agent, , loaded] = usePrefs("agent");
  const client = useQueryClient();
  const { connectionsPending, pending, models, errors, loadError, retry } =
    useModelsCatalog(agent);
  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Models</Settings.Title>
          <Settings.Description>
            Choose which models your fish can use.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>
      {!loaded || connectionsPending || (pending && !models.length) ? (
        <ModelsLoading />
      ) : loadError ? (
        <CatalogUnavailable message={loadError} onRetry={retry} />
      ) : (
        <Settings.Section className={styles.section}>
          {errors.length ? (
            <div className={styles.notice} role="alert">
              <span>
                {errors.length === 1
                  ? errors[0]
                  : "Some providers could not load models. Try again."}
              </span>
              <Button size="xs" variant="ghost" onClick={retry}>
                Retry
              </Button>
            </div>
          ) : null}
          <ModelCatalogTable
            models={models}
            visibleByProvider={agent.visibleModelIds ?? {}}
            onSave={async (visibleModelIds) => {
              await savePrefsSection("agent", { visibleModelIds });
              await client.invalidateQueries({
                queryKey: ["assistant-models"],
              });
            }}
          />
        </Settings.Section>
      )}
    </Settings.Page>
  );
}
