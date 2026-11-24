import type { IconComponent } from "@pond/icons/types";
import { BrandTile, Button, type MenuItemSpec } from "@pond/ui";
import { useState } from "react";
import { pickAuthorColor } from "@/features/saves/lib/presentation";
import { PropertyList } from "@/shared/components/property-list";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { initials } from "@/shared/lib/initials";
import styles from "./styles.module.css";

interface FactRowProps {
  label: string;
  icon?: React.ReactNode;
  title?: string;
  onClick?: () => void;
  menu: () => MenuItemSpec[];
  children: React.ReactNode;
}

export function FactRow({
  label,
  icon,
  title,
  onClick,
  menu,
  children,
}: FactRowProps) {
  const value = (
    <>
      {icon}
      <span className={styles.text}>{children}</span>
    </>
  );
  return (
    <SpecContextMenu buildItems={menu}>
      {/** Focusable when there's no button, so Shift+F10 still reaches the menu. */}
      <PropertyList.Row tabIndex={onClick ? undefined : 0} title={title}>
        <PropertyList.Label>{label}</PropertyList.Label>
        <PropertyList.Value className={styles.value}>
          {onClick ? (
            <Button
              type="button"
              variant="bare"
              className={styles.action}
              onClick={onClick}
            >
              {value}
            </Button>
          ) : (
            value
          )}
        </PropertyList.Value>
      </PropertyList.Row>
    </SpecContextMenu>
  );
}

export function ControlRow({
  label,
  menu,
  children,
}: {
  label: string;
  menu?: () => MenuItemSpec[];
  children: React.ReactNode;
}) {
  const row = (
    <PropertyList.Row>
      <PropertyList.Label>{label}</PropertyList.Label>
      <PropertyList.Value className={styles.value}>{children}</PropertyList.Value>
    </PropertyList.Row>
  );
  return menu ? <SpecContextMenu buildItems={menu}>{row}</SpecContextMenu> : row;
}

export function AuthorAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      className={styles.avatar}
      style={{ background: pickAuthorColor(name) }}
    >
      {avatarUrl && avatarUrl !== failedUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function SourceMark({
  logo,
  Icon,
}: {
  logo: string | null;
  Icon: IconComponent | null;
}) {
  if (logo) return <img className={styles.logo} src={logo} alt="" />;
  return Icon ? (
    <BrandTile size={16} rounding="full">
      <Icon />
    </BrandTile>
  ) : null;
}
