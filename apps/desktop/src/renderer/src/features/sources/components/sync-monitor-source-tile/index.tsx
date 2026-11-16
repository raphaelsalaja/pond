import type { Source } from "@pond/schema/db";
import { BrandTile as Tile } from "@pond/ui";
import type { ComponentProps } from "react";
import { getSourceDef } from "@/features/sources/lib/registry";

export function BrandTile({
  source,
  size = 36,
  rounding,
}: {
  source: Source;
  size?: number;
  rounding?: ComponentProps<typeof Tile>["rounding"];
}) {
  const { icon: Icon, logo } = getSourceDef(source);

  return (
    <Tile size={size} rounding={rounding}>
      {Icon ? (
        <Icon width={size} height={size} />
      ) : logo ? (
        <img src={logo} alt="" width={size} height={size} />
      ) : null}
    </Tile>
  );
}
