import { Input } from "@pond/ui";
import styles from "./styles.module.css";

interface FieldInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  type?: "text" | "number" | "date" | "color";
  placeholder?: string;
  width?: "full";
}

export function FieldInput({
  value,
  onChange,
  label,
  type = "text",
  placeholder,
  width,
}: FieldInputProps) {
  return (
    <Input.Root size="sm" className={styles.root} data-width={width}>
      <Input.Field
        aria-label={label}
        value={value}
        onValueChange={onChange}
        type={type}
        placeholder={placeholder}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
      />
    </Input.Root>
  );
}
