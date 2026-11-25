import { HOOK_MATCHES, hookSourceForUrl } from "@/sources";
import { mountPondSidebarLink } from "@/sources/twitter/sidebar";
import { bridge } from "@/utils/bridge";
import { getSettings } from "@/utils/settings";

export default defineContentScript({
  matches: HOOK_MATCHES,
  runAt: "document_start",
  main() {
    const source = hookSourceForUrl(location.href);
    if (!source) return;
    void bridge(source);
    if (source !== "twitter") return;
    void getSettings().then((settings) => {
      if (settings.enabled.twitter) mountPondSidebarLink();
    });
  },
});
