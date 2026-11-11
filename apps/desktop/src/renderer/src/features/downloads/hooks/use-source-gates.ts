import { QueueSourceGateSchema } from "@shared/queue-contracts";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const SourceGatesSchema = z.array(QueueSourceGateSchema);

export function useSourceGates(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["queue.sourceGates"],
    queryFn: async () =>
      SourceGatesSchema.parse(await window.pond.query("queue.sourceGates", {})),
    refetchInterval: 10_000,
  });
}
