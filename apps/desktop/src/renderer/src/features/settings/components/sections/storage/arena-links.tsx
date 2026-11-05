import { Button, Settings } from "@pond/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertArenaLinks } from "@/shared/lib/arena-links";
import { formatPlural } from "@/shared/lib/format";

const STATUS_KEY = ["arena-links-status"];
const LINK_SAVES = { one: "Link save", other: "Link saves" };

export function ArenaLinkConversion() {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => window.pond.query("arenaLinks.status", {}),
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });
  const convert = useMutation({
    mutationFn: convertArenaLinks,
    onSettled: () => client.invalidateQueries({ queryKey: STATUS_KEY }),
  });
  const pending = status.data?.pending ?? 0;
  const running = convert.isPending || status.data?.running === true;

  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Convert Are.na Links</Settings.ItemTitle>
        <Settings.ItemDescription>
          {running
            ? "Converting older Link saves into web pages."
            : pending > 0
              ? `${formatPlural(pending, LINK_SAVES)} still open the Are.na block instead of the linked page.`
              : "Every Link save opens the linked page."}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          disabled={running || pending === 0}
          loading={running}
          onClick={() => convert.mutate()}
        >
          Convert
        </Button>
      </Settings.ItemControl>
    </>
  );
}
