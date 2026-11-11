import {
  IconArchiveDownload,
  IconBroom,
  IconCircleCheck,
  IconLink2,
  IconMediaPauseFill,
  IconMediaPlayFill,
} from "@pond/icons";
import { sourceLabel } from "@pond/schema/sources";
import { Button, Keyboard, Tooltip } from "@pond/ui";
import type { QueueSourceGate } from "@shared/queue-contracts";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import {
  DownloadsCompletedHidden,
  DownloadsEmpty,
} from "@/features/downloads/components/empty";
import {
  canTrashDownload,
  clearUnfinishedDownloads,
} from "@/features/downloads/components/lib/actions";
import { useLiveDownloadHydration } from "@/features/downloads/hooks/use-live-download-hydration";
import {
  downloadFiltersActive,
  downloadRowSource,
  type HistoryCursor,
  HistoryPageSchema,
  historyToDownloadRow,
  matchesDownloadFilters,
  PipelineStatusSchema,
  projectLiveDownloads,
  STATUS_FILTER_OPTIONS,
  type StatusFilter,
  showsCompletedDownloads,
  statusFeed,
} from "@/features/downloads/lib/status-feed";
import { downloadDialog } from "@/features/downloads/state/download-dialog";
import {
  downloadsFilters,
  useDownloadsFilters,
} from "@/features/downloads/state/downloads-filters";
import { downloadsSelection } from "@/features/downloads/state/downloads-selection";
import { useSaves } from "@/features/saves/pool";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { SearchChrome } from "@/shared/components/search-chrome";
import {
  TableFilterBar,
  TableFilterChip,
  TableFilterToggle,
} from "@/shared/components/table-filters";
import { uniqueFilterOptions } from "@/shared/components/table-filters/chip-label";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { useDownloadActivity } from "../../hooks/use-download-activity";
import { useSourceGates } from "../../hooks/use-source-gates";
import { TransferJobsPanel } from "../transfers";
import { DownloadOptionsMenu } from "./options";
import { DownloadSelectionBar } from "./selection-bar";
import styles from "./styles.module.css";
import { DownloadsView } from "./view";

const initialHistoryCursor: HistoryCursor = null;
const NO_GATES: readonly QueueSourceGate[] = [];
type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

function DownloadsMatchesEmpty({ onReset }: { onReset: () => void }) {
  return <MatchesEmpty onReset={onReset} />;
}

export function DownloadsPage() {
  const saves = useSaves();
  const qc = useQueryClient();
  useLiveDownloadHydration();
  const filters = useDownloadsFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activity = useDownloadActivity();
  const live = useMemo(() => projectLiveDownloads(saves), [saves]);
  const gates = useSourceGates(live.some((row) => row.status === "parked"));
  const history = useInfiniteQuery({
    queryKey: ["downloads.history", filters.q],
    initialPageParam: initialHistoryCursor,
    queryFn: async ({ pageParam }) =>
      HistoryPageSchema.parse(
        await window.pond.query("downloads.history", {
          limit: 50,
          cursor: pageParam,
          q: filters.q,
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 5_000,
  });
  const completed = useMemo(() => {
    const seen = new Set(live.map((row) => row.saveId));
    return (history.data?.pages ?? [])
      .flatMap((page) => page.rows)
      .flatMap((row) => {
        if (row.source === "local") return [];
        if (seen.has(row.saveId)) return [];
        seen.add(row.saveId);
        return [historyToDownloadRow(row)];
      });
  }, [history.data, live]);
  const statuslessFilters = useMemo(
    () => ({ ...filters, statuses: new Set<StatusFilter>() }),
    [filters],
  );
  const scopedLive = useMemo(
    () => live.filter((row) => matchesDownloadFilters(row, statuslessFilters)),
    [live, statuslessFilters],
  );
  const scopedCompleted = useMemo(
    () =>
      completed.filter((row) => matchesDownloadFilters(row, statuslessFilters)),
    [completed, statuslessFilters],
  );
  const rows = useMemo(
    () => scopedLive.filter((row) => matchesDownloadFilters(row, filters)),
    [scopedLive, filters],
  );
  const visibleCompleted = useMemo(
    () => scopedCompleted.filter((row) => matchesDownloadFilters(row, filters)),
    [scopedCompleted, filters],
  );
  const sourceOptions = useMemo(
    () =>
      uniqueFilterOptions(
        [...live, ...completed].map((row) => {
          const id = downloadRowSource(row);
          return { id, label: sourceLabel(id) };
        }),
      ),
    [live, completed],
  );
  useEffect(() => {
    const available = new Map(
      [...rows, ...visibleCompleted].map((row) => [row.id, row]),
    );
    downloadsSelection.set(
      downloadsSelection.snapshot().flatMap((row) => {
        const current = available.get(row.id);
        return current ? [current] : [];
      }),
    );
  }, [rows, visibleCompleted]);
  useEffect(() => () => downloadsSelection.clear(), []);

  const pipeline = useQuery({
    queryKey: ["pipeline.status"],
    queryFn: async () =>
      PipelineStatusSchema.parse(
        await window.pond.query("pipeline.status", {}),
      ),
  });
  const paused = pipeline.data?.paused === true;
  const tableFiltersActive = downloadFiltersActive(filters);
  const filtering = filters.q.trim() !== "" || tableFiltersActive;
  const showCompleted = showsCompletedDownloads(filters);
  const nothingVisible =
    rows.length === 0 && visibleCompleted.length === 0 && !history.isPending;
  const showPlaceEmpty =
    live.length === 0 && completed.length === 0 && !filtering;
  const showCompletedHidden =
    nothingVisible &&
    !showPlaceEmpty &&
    !showCompleted &&
    scopedCompleted.some((row) => row.status === "complete");
  const showMatchesEmpty =
    nothingVisible && !showPlaceEmpty && !showCompletedHidden;

  const pause = useMutation({
    mutationFn: () => window.pond.pipelinePause(!paused),
    onSuccess: (result) =>
      qc.setQueryData<PipelineStatus>(["pipeline.status"], {
        paused: result.paused,
      }),
    onError: () =>
      statusFeed.error(
        "Pause downloads",
        "Couldn't change the queue. Try again.",
      ),
  });
  const clearUnfinished = useMutation({ mutationFn: clearUnfinishedDownloads });
  const toolbar = (
    <SearchChrome.Root
      actions={
        <>
          <Tooltip
            label="Download Video or Audio"
            shortcut={
              <Keyboard.Cluster keys={shortcutGlyphs("library.download")} />
            }
            side="bottom"
          >
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Download Video or Audio"
              onClick={() => downloadDialog.open()}
            >
              <IconArchiveDownload />
            </Button>
          </Tooltip>
          <DownloadOptionsMenu />
          <TableFilterToggle
            open={filtersOpen}
            active={tableFiltersActive}
            controlsId="downloads-filter-toolbar"
            onToggle={() => setFiltersOpen((open) => !open)}
          />
          <Tooltip
            label={
              <>
                Move every unfinished download to Trash.
                <br />
                Finished saves stay in the Library.
              </>
            }
            side="bottom"
          >
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Clear Unfinished"
              disabled={
                !live.some(canTrashDownload) || clearUnfinished.isPending
              }
              loading={clearUnfinished.isPending}
              onClick={() => clearUnfinished.mutate()}
            >
              <IconBroom />
            </Button>
          </Tooltip>
          <Tooltip
            label={
              paused
                ? "Resume background downloads"
                : "Pause background downloads. Links you add still start."
            }
            side="bottom"
          >
            <Button
              icon
              size="sm"
              variant="ghost"
              disabled={!pipeline.data || pause.isPending}
              loading={pause.isPending}
              onClick={() => pause.mutate()}
              aria-label={paused ? "Resume Queue" : "Pause Queue"}
            >
              {paused ? <IconMediaPlayFill /> : <IconMediaPauseFill />}
            </Button>
          </Tooltip>
        </>
      }
      below={
        <TableFilterBar
          open={filtersOpen}
          id="downloads-filter-toolbar"
          label="Download Filters"
        >
          <TableFilterChip
            name="Status"
            icon={<IconCircleCheck />}
            options={STATUS_FILTER_OPTIONS}
            selected={filters.statuses}
            onChange={downloadsFilters.setStatuses}
          />
          <TableFilterChip
            name="Source"
            icon={<IconLink2 />}
            options={sourceOptions}
            selected={filters.sources}
            onChange={downloadsFilters.setSources}
          />
        </TableFilterBar>
      }
    >
      <SearchChrome.Input
        value={filters.q}
        onChange={(e) => downloadsFilters.setQ(e.target.value)}
        spellCheck={false}
        placeholder="Search downloads…"
        aria-label="Search Downloads"
        data-downloads-search=""
      />
    </SearchChrome.Root>
  );
  return (
    <div className={styles.page}>
      {toolbar}
      {activity.isError ? (
        <p className={styles["activity-error"]} role="status">
          Live activity is unavailable.{" "}
          <Button
            type="button"
            size="xs"
            variant="text"
            onClick={() => void activity.refetch()}
          >
            Try Again
          </Button>
        </p>
      ) : null}
      <TransferJobsPanel search={filters.q} />
      <DownloadsView
        rows={rows}
        completed={visibleCompleted}
        activities={activity.data ?? []}
        gates={gates.data ?? NO_GATES}
        paused={paused}
        historyLoading={showCompleted && history.isPending}
        historyError={showCompleted && history.isError}
        hasMore={showCompleted && history.hasNextPage}
        loadingMore={history.isFetchingNextPage}
        onLoadMore={() => void history.fetchNextPage()}
        onRetryHistory={() => void history.refetch()}
        empty={
          showPlaceEmpty ? (
            <div className={styles.empty}>
              <DownloadsEmpty />
            </div>
          ) : showCompletedHidden ? (
            <div className={styles.empty}>
              <DownloadsCompletedHidden
                onShowCompleted={() =>
                  downloadsFilters.setStatuses(
                    new Set([...filters.statuses, "complete"]),
                  )
                }
              />
            </div>
          ) : showMatchesEmpty ? (
            <div className={styles.empty}>
              <DownloadsMatchesEmpty onReset={downloadsFilters.reset} />
            </div>
          ) : null
        }
      />
      <DownloadSelectionBar />
    </div>
  );
}
