import { Button, Checkbox } from "@pond/ui";
import type { TableColumn } from "@pond/ui/data-table";
import type { AssistantProvider } from "@shared/assistant";
import type { CatalogModel } from "../types";
import {
  compactTokens,
  contextHint,
  modelHint,
  priceHint,
  tokenPrice,
} from "./format";
import { Hint } from "./hint";
import styles from "./styles.module.css";

function Metric({ hint, value }: { hint: string | undefined; value: string }) {
  return (
    <span className={styles.metric}>
      <Hint label={hint}>
        {hint ? (
          <Button type="button" variant="link" size="sm" aria-label={hint}>
            {value}
          </Button>
        ) : (
          <span>{value}</span>
        )}
      </Hint>
    </span>
  );
}

function checkboxId(model: CatalogModel) {
  return `model-visible-${model.provider}-${model.id}`;
}

export function modelColumns({
  provider,
  visible,
  disabled,
  onCheckedChange,
}: {
  provider: AssistantProvider;
  visible: Set<string>;
  disabled: boolean;
  onCheckedChange: (model: CatalogModel, checked: boolean) => void;
}): TableColumn<CatalogModel>[] {
  return [
    {
      id: "model",
      header: "Model",
      sortLabel: "Model",
      width: "minmax(0, 1fr)",
      cell: (model) => (
        <Hint label={modelHint(model) || undefined}>
          <label htmlFor={checkboxId(model)} className={styles.name}>
            {model.name}
          </label>
        </Hint>
      ),
    },
    {
      id: "input",
      header: (
        <Hint label="Price per million input tokens.">
          <span>Input</span>
        </Hint>
      ),
      sortLabel: "Input",
      width: "72px",
      align: "end",
      cell: (model) => (
        <Metric
          hint={priceHint("Input", model.pricing?.input)}
          value={tokenPrice(model.pricing?.input)}
        />
      ),
    },
    {
      id: "output",
      header: (
        <Hint label="Price per million output tokens.">
          <span>Output</span>
        </Hint>
      ),
      sortLabel: "Output",
      width: "72px",
      align: "end",
      cell: (model) => (
        <Metric
          hint={priceHint("Output", model.pricing?.output)}
          value={tokenPrice(model.pricing?.output)}
        />
      ),
    },
    {
      id: "context",
      header: (
        <Hint label="Context window in tokens.">
          <span>Context</span>
        </Hint>
      ),
      sortLabel: "Context",
      width: "80px",
      align: "end",
      cell: (model) => (
        <Metric
          hint={contextHint(model.contextWindow)}
          value={compactTokens(model.contextWindow)}
        />
      ),
    },
    {
      id: "show",
      sortLabel: "Show",
      headerHidden: true,
      width: "40px",
      align: "center",
      cell: (model) => (
        <Checkbox.Root
          id={checkboxId(model)}
          size="sm"
          aria-label={`Show ${model.name} in model pickers`}
          checked={model.available !== false && visible.has(model.id)}
          disabled={disabled || model.available === false}
          aria-describedby={
            model.available === false ? `connection-${provider}` : undefined
          }
          onCheckedChange={(checked) => onCheckedChange(model, checked)}
        >
          <Checkbox.Indicator />
        </Checkbox.Root>
      ),
    },
  ];
}
