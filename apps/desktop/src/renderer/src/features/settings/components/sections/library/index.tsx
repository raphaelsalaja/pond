import { Button, Input, Select, Settings, Tooltip } from "@pond/ui";
import type { LogoSource } from "@shared/logo-crop";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import defaultAppIcon from "@/generated/app-icon-previews/aqua.png";
import { LogoCropDialog } from "@/shared/components/logo-crop-dialog";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

const LibraryInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
});

type LibraryInfo = z.infer<typeof LibraryInfoSchema>;

function libraryFolderName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.pond$/i, "") ?? ""
  );
}

export function LibrarySettings() {
  const { data: info } = useQuery({
    queryKey: ["library-info"],
    queryFn: async () =>
      LibraryInfoSchema.parse(await window.pond.query("library.info", {})),
  });
  const { data: recent = [] } = useQuery({
    queryKey: ["recent-libraries"],
    queryFn: () => window.pond.query("library.recent", {}),
  });

  const openRecent = useMutation({
    mutationFn: async (path: string) => {
      const result = await window.pond.query("library.switchTo", { path });
      if (!result.ok) throw new Error(result.error ?? "Couldn't open library.");
    },
  });

  return (
    <Settings.List>
      <LibraryIdentitySettings info={info} />
      {recent.length > 1 ? (
        <Settings.Item id="setting-library-recent">
          <Settings.ItemDetails>
            <Settings.ItemTitle>Recent Libraries</Settings.ItemTitle>
            <Settings.ItemDescription>
              Switch to a library you've opened before.
              <StatusNote error={openRecent.error?.message} />
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Select.Root
              value={recent.find((entry) => entry.active)?.path ?? ""}
              disabled={openRecent.isPending}
              onValueChange={(path) => {
                if (path) openRecent.mutate(path);
              }}
            >
              <Select.Trigger aria-label="Recent Libraries">
                <Select.Value>
                  {(path: string) =>
                    recent.find((entry) => entry.path === path)?.name ??
                    "Choose Library"
                  }
                </Select.Value>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={6}>
                  <Select.Popup>
                    <Select.Items
                      items={recent.map((entry) => ({
                        value: entry.path,
                        label: entry.available
                          ? entry.name
                          : `${entry.name} (Unavailable)`,
                        disabled: !entry.available,
                      }))}
                    />
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          </Settings.ItemControl>
        </Settings.Item>
      ) : null}
    </Settings.List>
  );
}

function LibraryIdentitySettings({ info }: { info?: LibraryInfo }) {
  const client = useQueryClient();
  const [name, setName] = useState(info?.name ?? "");
  const [logo, setLogo] = useState<string | null>(info?.icon ?? null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [cropSource, setCropSource] = useState<LogoSource | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => setName(info?.name ?? ""), [info?.name]);
  useEffect(() => setLogo(info?.icon ?? null), [info?.icon]);

  const refreshIdentity = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["library-info"] }),
      client.invalidateQueries({ queryKey: ["recent-libraries"] }),
    ]);
  };

  const updateLogo = async (nextLogo: string | null) => {
    const result = await window.pond.query("library.identity.update", {
      icon: nextLogo,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    setLogo(nextLogo);
    await refreshIdentity();
  };

  const chooseLogo = async () => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const result = await window.pond.query("library.identity.pickIcon", {});
      if (!result.ok) {
        if (result.reason !== "cancelled")
          setLogoError("Choose a supported image.");
        return;
      }
      setCropSource(result.image);
    } catch (error) {
      setLogoError(errorCopy(error, "Couldn't choose the logo. Try again."));
    } finally {
      setLogoBusy(false);
    }
  };

  const saveCroppedLogo = async (icon: string) => {
    setCropSource(null);
    setLogoBusy(true);
    setLogoError(null);
    try {
      await updateLogo(icon);
    } catch (error) {
      setLogoError(errorCopy(error, "Couldn't save the logo. Try again."));
    } finally {
      setLogoBusy(false);
    }
  };

  const resetLogo = async () => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await updateLogo(null);
    } catch (error) {
      setLogoError(errorCopy(error, "Couldn't reset the logo. Try again."));
    } finally {
      setLogoBusy(false);
    }
  };

  const saveName = async () => {
    if (!info || nameBusy) return;
    const nextName = name.trim().replace(/\.pond$/i, "");
    if (!nextName) {
      setNameError("Enter a library name.");
      return;
    }
    if (nextName === info.name) {
      setName(info.name);
      setNameError(null);
      return;
    }
    setNameBusy(true);
    setNameError(null);
    try {
      const result =
        nextName === libraryFolderName(info.path)
          ? await window.pond.query("library.identity.update", {
              name: nextName,
            })
          : await window.pond.query("library.rename", {
              name: nextName,
            });
      if (!result.ok) {
        setNameError(result.error ?? "Couldn't rename the library. Try again.");
        return;
      }
      setName(nextName);
      await refreshIdentity();
    } catch (error) {
      setNameError(errorCopy(error, "Couldn't rename the library. Try again."));
    } finally {
      setNameBusy(false);
    }
  };

  return (
    <>
      <Settings.Item id="setting-library-logo">
        <Settings.ItemDetails>
          <Settings.ItemTitle>Logo</Settings.ItemTitle>
          <Settings.ItemDescription>
            Recommended size is 256 × 256 px.
            <StatusNote error={logoError} />
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          {logo ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={logoBusy}
              onClick={() => void resetLogo()}
            >
              Reset
            </Button>
          ) : null}
          <Tooltip label={logo ? "Change Logo" : "Choose Logo"} side="bottom">
            <Button
              icon
              size="xl"
              variant="secondary"
              className={styles.logo}
              disabled={!info || logoBusy}
              aria-label={logo ? "Change Logo" : "Choose Logo"}
              onClick={() => void chooseLogo()}
            >
              <img src={logo ?? defaultAppIcon} alt="" />
            </Button>
          </Tooltip>
          {cropSource ? (
            <LogoCropDialog
              source={cropSource}
              onClose={() => setCropSource(null)}
              onCrop={(icon) => void saveCroppedLogo(icon)}
            />
          ) : null}
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item id="setting-library-name">
        <Settings.ItemDetails>
          <Settings.ItemTitle>Name</Settings.ItemTitle>
          <StatusNote error={nameError} />
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Input.Root className={styles.name}>
            <Input.Field
              aria-label="Library Name"
              value={name}
              disabled={!info || nameBusy}
              onValueChange={(value) => {
                setName(value);
                setNameError(null);
              }}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape" && info) {
                  setName(info.name);
                  setNameError(null);
                }
              }}
            />
          </Input.Root>
        </Settings.ItemControl>
      </Settings.Item>
    </>
  );
}

function StatusNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <span className={styles.error} role="alert">
      {error}
    </span>
  );
}
