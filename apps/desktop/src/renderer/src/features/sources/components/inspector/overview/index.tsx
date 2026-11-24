import type { Source } from "@pond/schema/db";
import { Button, Settings } from "@pond/ui";
import { useEffect, useMemo, useState } from "react";
import { viewAccountItems } from "@/features/library";
import { SaveStrip } from "@/features/library/save-strip";
import { ensureSaves } from "@/features/saves/pool";
import { HeroAvatar } from "@/features/sources/components/flow/detail/hero-avatar";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import {
  runFreshCount,
  useSourceHistory,
  useSourceOverview,
} from "@/features/sources/hooks/use-source-activity";
import { getSourceDef } from "@/features/sources/lib/registry";
import { formatBytes, formatNumber } from "@/shared/lib/format";
import styles from "./styles.module.css";

const RECENT_COUNT = 8;
const MONTH_MS = 30 * 86_400_000;

export interface SourceIdentity {
  name: string;
  handle: string | null;
  avatarUrl?: string | null;
}

function lastFetchLabel(model: CardModel): string {
  if (model.tone === "run") {
    return "Fetching";
  }
  if (model.tone === "err") {
    return "Failed";
  }
  if (model.lastText === "—") {
    return "Never";
  }
  return model.lastText.charAt(0).toUpperCase() + model.lastText.slice(1);
}

export function SourceOverview({
  id,
  source,
  identity,
  model,
}: {
  id: string;
  source: Source;
  identity: SourceIdentity;
  model: CardModel;
}) {
  const overview = useSourceOverview(id);
  const history = useSourceHistory(source, id);
  const recent = useMemo(
    () => (overview.data?.recent ?? []).slice(0, RECENT_COUNT),
    [overview.data],
  );
  const recentKey = recent.join(",");
  useEffect(() => {
    if (recentKey) {
      void ensureSaves(recentKey.split(",")).catch(() => undefined);
    }
  }, [recentKey]);

  const [since] = useState(() => Date.now() - MONTH_MS);
  const runs = (history.data ?? []).filter((run) => run.ts >= since);
  const month = runs.reduce((sum, run) => sum + runFreshCount(run), 0);
  const succeeded = runs.filter(
    (run) => run.outcome === "ok" || run.outcome === "noop",
  ).length;
  const sourceLabel = getSourceDef(source).label;
  const subtitle =
    identity.handle && identity.handle !== identity.name
      ? `${identity.handle} · ${sourceLabel}`
      : sourceLabel;

  return (
    <div className={styles.overview}>
      <header className={styles.hero}>
        <HeroAvatar
          source={source}
          avatarUrl={identity.avatarUrl}
          size={88}
          badgeSize={24}
        />
        <div className={styles.identity}>
          <h2 className={styles.name}>{identity.name}</h2>
          <p className={styles.handle}>{subtitle}</p>
        </div>
      </header>

      <dl className={styles.stats}>
        <Stat
          label="Saves"
          value={overview.data ? formatNumber(overview.data.saves) : "—"}
        />
        <Stat
          label="On Disk"
          value={overview.data ? formatBytes(overview.data.bytes) : "—"}
        />
        <Stat label="Last 30 Days" value={formatNumber(month)} />
        <Stat
          label="Success Rate"
          value={
            runs.length > 0
              ? `${Math.round((succeeded / runs.length) * 100)}%`
              : "—"
          }
        />
        <Stat label="Last Fetch" value={lastFetchLabel(model)} />
      </dl>

      <Settings.Section>
        <Settings.SectionDetails>
          <Settings.SectionTitle>Recent Saves</Settings.SectionTitle>
          <Settings.SectionAction>
            <Button
              size="sm"
              variant="ghost"
              disabled={recent.length === 0}
              onClick={() => viewAccountItems(id)}
            >
              Show All
            </Button>
          </Settings.SectionAction>
        </Settings.SectionDetails>
        {recent.length > 0 ? (
          <SaveStrip ids={recent} label="Recent saves" />
        ) : (
          <p className={styles.empty}>
            {overview.isPending ? "Loading saves" : "No saves yet"}
          </p>
        )}
      </Settings.Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}
