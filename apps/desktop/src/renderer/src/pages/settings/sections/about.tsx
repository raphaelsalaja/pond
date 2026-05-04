import { useEffect, useState } from "react";
import { Button } from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
}

const REPO_URL = "https://github.com/raphaelsalaja/pond";
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/**
 * About page — version + repo + license. We deliberately keep this
 * thin instead of bundling a generated open-source manifest; users
 * who need that level of detail go straight to the GitHub mirror.
 */
export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.pond.appInfo().then((i) => setInfo(i as AppInfo));
  }, []);

  function open(url: string) {
    void window.pond.openExternal(url);
  }

  return (
    <SectionStack>
      <SectionHeader
        title="About"
        description="Version, license, and links to the Pond project."
      />

      <SettingsCard title="App">
        <Row
          label="Version"
          description="The currently running build of Pond."
          control={<span>{info?.version ?? "loading…"}</span>}
        />
        <Row
          label="Platform"
          description="Reported by Electron at boot. Useful when reporting bugs."
          control={
            <span>
              {info?.platform ?? ""} · {info?.arch ?? ""}
            </span>
          }
        />
        <Row
          label="License"
          description="Pond is open source under the MIT License."
          control={
            <Button size="sm" onClick={() => open(LICENSE_URL)}>
              View license
            </Button>
          }
        />
        <Row
          label="Repository"
          description="Source code on GitHub."
          control={
            <Button size="sm" onClick={() => open(REPO_URL)}>
              Open
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
