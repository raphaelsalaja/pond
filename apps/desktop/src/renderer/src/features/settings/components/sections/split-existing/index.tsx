import { Button, Dialog, Settings } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  resumeSplitAll,
  splitAllSaves,
  splittableDescription,
  useSplitAllRunning,
} from "@/features/saves/split-all";

export function SplitExistingSaves() {
  const running = useSplitAllRunning();
  const { data, refetch } = useQuery({
    queryKey: ["saves", "splittableCount"],
    queryFn: () => window.pond.query("saves.splittableCount", {}),
  });
  const count = data?.count ?? 0;

  useEffect(() => {
    void resumeSplitAll().catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) void refetch();
  }, [running, refetch]);

  const split = () =>
    Dialog.confirm({
      title: "Split Existing Saves",
      description:
        "Each image or video becomes its own save with the same source, tags, and notes. You can't undo this.",
      confirmLabel: "Split",
      onConfirm: () => {
        void splitAllSaves();
      },
    });

  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Split Existing Saves</Settings.ItemTitle>
        <Settings.ItemDescription>
          {data ? splittableDescription(count) : null}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          disabled={!data || count === 0 || running}
          onClick={split}
        >
          {running ? "Splitting" : "Split"}
        </Button>
      </Settings.ItemControl>
    </>
  );
}
