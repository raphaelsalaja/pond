import { createFileRoute, redirect } from "@tanstack/react-router";
import { SettingsDetail } from "@/features/settings/components/detail";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import {
  rememberSettingsSection,
  resolveSettingsLocation,
  settingsHref,
} from "@/shared/lib/open-settings";

export const Route = createFileRoute("/_library/settings/$section")({
  beforeLoad: ({ params, location }) => {
    const currentHash = location.hash?.replace(/^#/, "") || null;
    const resolved = resolveSettingsLocation(params.section, currentHash ?? "");
    rememberSettingsSection(resolved.section);
    if (resolved.section === params.section && resolved.hash === currentHash) {
      return;
    }
    redirect({
      href: settingsHref(resolved.section, resolved.hash ?? undefined),
      throw: true,
    });
  },
  component: SettingsSectionRoute,
});

function SettingsSectionRoute() {
  const { section } = Route.useParams();
  const hash = useRouteLocation((location) => {
    const value = location.hash;
    if (!value) {
      return null;
    }
    return value.replace(/^#/, "") || null;
  });
  return <SettingsDetail section={section} hash={hash} />;
}
