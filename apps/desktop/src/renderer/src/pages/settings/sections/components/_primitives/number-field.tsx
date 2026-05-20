import { NumberField } from "@pond/ui";
import { Cell } from "./cell";

export default function NumberFieldCell() {
  return (
    <Cell label="Number Field">
      <NumberField.Root defaultValue={1}>
        <NumberField.Decrement />
        <NumberField.Input />
        <NumberField.Increment />
      </NumberField.Root>
    </Cell>
  );
}
