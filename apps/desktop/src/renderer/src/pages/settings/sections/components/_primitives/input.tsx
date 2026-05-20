import { Input } from "@pond/ui";
import { Cell } from "./cell";

export default function InputCell() {
  return (
    <Cell label="Input">
      <Input placeholder="Find..." />
    </Cell>
  );
}
