import type { SQL } from "drizzle-orm";
import { COMPARATORS_BY_TYPE } from "../types";
import type {
  ComparatorId,
  FieldId,
  FieldTypeId,
  PredicateValue,
} from "../types";
import type { SaveLike } from "./save-like";

export type FieldGroup = "content" | "media" | "time" | "people";

export interface FieldPreset {
  id: string;
  label: string;
  value: PredicateValue;
}

export type FieldValue =
  | string
  | number
  | boolean
  | Array<string>
  | null
  | undefined;

export interface FieldDescriptor {
  id: FieldId;
  type: FieldTypeId;
  label: string;
  group: FieldGroup;
  presets?: ReadonlyArray<FieldPreset>;
  comparators: ReadonlyArray<ComparatorId>;
  project(save: SaveLike): FieldValue;
  sqlProjection?: () => SQL | null;
}

type FieldDescriptorInput = Omit<FieldDescriptor, "comparators"> & {
  comparators?: ReadonlyArray<ComparatorId>;
};

export function defineField(input: FieldDescriptorInput): FieldDescriptor {
  return {
    ...input,
    comparators: input.comparators ?? COMPARATORS_BY_TYPE[input.type],
  };
}
