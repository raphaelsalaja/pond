import type { Source } from "@pond/schema/db";
import { useState } from "react";
import { BrandTile } from "@/features/sources/components/sync-monitor-source-tile";
import { getSourceDef } from "@/features/sources/lib/registry";
import styles from "./styles.module.css";

export function HeroAvatar({
  source,
  avatarUrl,
  size = 52,
  ring = false,
  badge = true,
  badgeSize = 16,
}: {
  source: Source;
  avatarUrl: string | null | undefined;
  size?: number;
  ring?: boolean;
  badge?: boolean;
  badgeSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const { logo, icon: Icon } = getSourceDef(source);
  const pfp = avatarUrl && !failed ? avatarUrl : null;
  const largeBadge = badgeSize >= 32;
  const badgeBox = badgeSize + (largeBadge ? 8 : 4);

  if (!pfp) {
    const tile = (
      <span className={styles.tile} data-large={size >= 96 || undefined}>
        <BrandTile source={source} size={size} />
      </span>
    );
    if (!ring) {
      return tile;
    }
    return <span className={styles.wavatar}>{tile}</span>;
  }

  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      <img
        src={pfp}
        alt=""
        className={styles.image}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      {badge && (Icon || logo) ? (
        <span
          className={styles.badge}
          style={{ width: badgeBox, height: badgeBox }}
          data-large={largeBadge || undefined}
        >
          {Icon ? (
            <BrandTile source={source} size={badgeSize} />
          ) : logo ? (
            <img src={logo} alt="" />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
