import { capture, installInterceptor } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import { pinIdFromBody } from "./save-request";

const SAVE_RE =
  /\/resource\/(?:Repin|RepinSave|BoardPickerSave|UserPin|Pin)Resource\/create\/?(?:\?|$)/i;

export function inject(): void {
  const emitted = new Set<string>();
  installInterceptor({
    id: "pinterest",
    match: (req: RequestLens) => req.method === "POST" && SAVE_RE.test(req.url),
    async onResponse(req, res) {
      if (!res.ok) return;
      const id = pinIdFromBody(await req.readBody());
      if (!id || emitted.has(id)) return;
      emitted.add(id);
      capture(`https://www.pinterest.com/pin/${id}/`, "pinterest:save");
    },
  });
}
