import type { Source } from "@pond/schema/db";
import { BrandTile as Tile } from "@pond/ui";
import type { ComponentProps } from "react";
import { getSourceDef } from "@/features/sources/lib/registry";

export function BrandTile({
  source,
  size = 36,
  shape,
}: {
  source: Source;
  size?: number;
  shape?: ComponentProps<typeof Tile>["shape"];
}) {
  const { icon: Icon, logo } = getSourceDef(source);

  return (
    <Tile size={size} shape={shape}>
      {Icon ? (
        <Icon width={size} height={size} />
      ) : logo ? (
        <img src={logo} alt="" width={size} height={size} />
      ) : null}
    </Tile>
  );
}
