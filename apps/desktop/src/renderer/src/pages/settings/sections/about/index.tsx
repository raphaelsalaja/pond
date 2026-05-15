import { Button } from "@pond/ui";
import { useEffect, useState } from "react";
import { Settings } from "@/components/settings";

interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
}

const REPO_URL = "https://github.com/raphaelsalaja/pond";
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.pond.appInfo().then((i) => setInfo(i as AppInfo));
  }, []);

  function open(url: string) {
    void window.pond.openExternal(url);
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>About</Settings.Title>
        <Settings.Description>
          Build details and links to the source.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>App</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Version</Settings.ItemTitle>
              <Settings.ItemDescription>
                The build currently running on your machine.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <span>{info?.version ?? "Loading…"}</span>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Platform</Settings.ItemTitle>
              <Settings.ItemDescription>
                Reported by Electron at boot. Include this when filing bugs.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <span>
                {info?.platform ?? ""} · {info?.arch ?? ""}
              </span>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>License</Settings.ItemTitle>
              <Settings.ItemDescription>
                Open source under the MIT License.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => open(LICENSE_URL)}>
                View License
              </Button>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Repository</Settings.ItemTitle>
              <Settings.ItemDescription>
                Read the source on GitHub.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => open(REPO_URL)}>
                Open Repo
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
