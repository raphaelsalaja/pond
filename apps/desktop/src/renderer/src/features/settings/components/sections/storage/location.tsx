import { Button, Dialog, Settings } from "@pond/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import { prettyPath } from "@/shared/lib/pretty-path";
import styles from "./styles.module.css";

const LibraryInfoSchema = z.object({ path: z.string() });

const MoveResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), path: z.string() }),
  z.object({
    ok: z.literal(false),
    reason: z.string().optional(),
    error: z.string().optional(),
  }),
]);

function moveError(failure: { reason?: string; error?: string }): string {
  switch (failure.reason) {
    case "cancelled":
      return "";
    case "same_path":
      return "Pick a different location than the open library.";
    case "nested_path":
      return "Can't move into a folder inside the library.";
    case "destination_exists":
      return "That folder already has files. Pick a new name.";
    case "no_library":
      return "No library is open to move.";
    default:
      return failure.error ?? "Couldn't move the library. Try again.";
  }
}

export function StorageLocationSettings() {
  const { data: info } = useQuery({
    queryKey: ["library-info"],
    queryFn: async () =>
      LibraryInfoSchema.parse(await window.pond.query("library.info", {})),
  });
  const move = useMutation({
    mutationFn: async () => {
      const result = MoveResultSchema.parse(
        await window.pond.query("library.move", {}),
      );
      if (!result.ok) {
        const message = moveError(result);
        if (message) throw new Error(message);
      }
    },
  });

  return (
    <Settings.List>
      <Settings.Item id="setting-storage-location">
        <Settings.ItemDetails>
          <Settings.ItemTitle>Library Location</Settings.ItemTitle>
          {info ? (
            <Settings.ItemDescription>
              {prettyPath(info.path)}
            </Settings.ItemDescription>
          ) : null}
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void window.pond.query("library.openInFinder", {})}
          >
            {REVEAL_LABEL}
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item id="setting-storage-move">
        <Settings.ItemDetails>
          <Settings.ItemTitle>Move Library</Settings.ItemTitle>
          <Settings.ItemDescription>
            Verify the new copy, switch to it, then remove the original.
            {move.isError ? (
              <span className={styles.error} role="alert">
                {move.error.message}
              </span>
            ) : null}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            disabled={move.isPending}
            loading={move.isPending}
            onClick={() =>
              Dialog.confirm({
                title: "Move Library",
                description:
                  "Pond will verify the new copy before removing the library from its current location.",
                confirmLabel: "Move",
                onConfirm: () => move.mutateAsync(),
              })
            }
          >
            Move
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}
