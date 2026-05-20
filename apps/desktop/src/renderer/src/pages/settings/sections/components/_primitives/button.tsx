import { IconXmarkOutline18 } from "@pond/icons/outline/18";
import { Button } from "@pond/ui";
import { Cell } from "./cell";

export default function ButtonCell() {
  return (
    <Cell label="Button">
      <Button variant="primary">Submit</Button>
      <Button variant="secondary">Submit</Button>
      <Button variant="tertiary">Submit</Button>
      <Button variant="danger">Submit</Button>
      <Button variant="accent">Submit</Button>
      <Button icon variant="primary">
        <IconXmarkOutline18 />
      </Button>
    </Cell>
  );
}
