import { DEFAULT_PREFS } from "@pond/schema/db";
import { Button } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useEffect } from "react";
import { z } from "zod";
import type { Binding } from "@/features/settings/components/engine";
import {
  appIconSwatch,
  listAppIconPreviews,
} from "@/features/settings/lib/app-icon-previews";
import styles from "./styles.module.css";

const ICONS = listAppIconPreviews();

const StoredIconIdSchema = z.string().catch(DEFAULT_PREFS.window.appIcon);

interface TintStyle extends CSSProperties {
  "--tint": string;
}

export function AppIconRow({ binding }: { binding: Binding }) {
  const stored = StoredIconIdSchema.parse(binding.values.appIcon);
  const selected = ICONS.some((icon) => icon.id === stored)
    ? stored
    : DEFAULT_PREFS.window.appIcon;
  const appearanceQuery = useQuery({
    queryKey: ["settings.appIconAppearance"],
    queryFn: () => window.pond.query("settings.appIconAppearance", {}),
    staleTime: 0,
  });
  const appearance = appearanceQuery.data;
  const { refetch } = appearanceQuery;
  // The icon style changes in System Settings, so read it again whenever
  // Pond's window comes back to the front.
  useEffect(() => {
    const refresh = () => void refetch();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refetch]);

  return (
    <fieldset className={styles.grid} aria-label="App icon">
      {ICONS.map((icon) => {
        const isSelected = icon.id === selected;
        const tint: TintStyle | undefined = icon.tint
          ? { "--tint": icon.tint }
          : undefined;
        return (
          <Button
            key={icon.id}
            variant="bare"
            className={styles.cell}
            aria-label={icon.label}
            aria-pressed={isSelected}
            data-selected={isSelected || undefined}
            style={tint}
            onClick={() => binding.patch({ appIcon: icon.id })}
          >
            <img
              src={appIconSwatch(icon, appearance)}
              alt=""
              draggable={false}
            />
          </Button>
        );
      })}
    </fieldset>
  );
}
