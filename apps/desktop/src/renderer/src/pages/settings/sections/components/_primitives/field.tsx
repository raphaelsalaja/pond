import { Field } from "@pond/ui";
import { Cell } from "./cell";

export default function FieldCell() {
  return (
    <Cell label="Field">
      <Field.Root validationMode="onChange">
        <Field.Label>Email</Field.Label>
        <Field.Control required type="email" placeholder="you@example.com" />
        <Field.Description>We'll never share your email</Field.Description>
        <Field.Error />
      </Field.Root>
    </Cell>
  );
}
