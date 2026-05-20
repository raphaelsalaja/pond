import { Switch } from "@pond/ui";
import { useState } from "react";
import { Cell } from "./cell";

export default function SwitchCell() {
  const [checked, setChecked] = useState(true);

  return (
    <Cell label="Switch">
      <Switch.Root checked={checked} onCheckedChange={setChecked} />
    </Cell>
  );
}
