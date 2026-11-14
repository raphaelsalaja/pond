import type { Prefs } from "@pond/schema/db";
import type { ComponentType, ReactNode } from "react";

type ValueOf<T> = T extends T ? T[keyof T] : never;

export type SettingValue = ValueOf<Prefs[keyof Prefs]> | undefined;

export interface SettingsValues {
  [key: string]: SettingValue;
}

export interface Binding<V = SettingsValues> {
  values: V;
  patch(delta: Partial<V>): void | Promise<void>;
  loaded: boolean;
}

export interface SelectOption {
  value: string | number | boolean | null;
  label: ReactNode;
}

interface ItemBase {
  key: string;
  title: string;
  description?: ReactNode;
  tooltip?: string;
  keywords?: string[];
  visible?: (values: SettingsValues) => boolean;
  disabled?: (values: SettingsValues) => boolean;
  apply?: () => void;
  prefsKey?: keyof Prefs;
}

export type FieldItem = ItemBase &
  (
    | { control: "switch" }
    | { control: "select"; options: SelectOption[]; placeholder?: ReactNode }
    | {
        control: "range";
        min: number;
        max: number;
        step?: number;
        suffix?: string;
      }
    | {
        control: "stepper";
        min: number;
        max: number;
        step?: number;
        fallback?: number;
      }
    | {
        control: "number";
        min: number;
        max: number;
        unit?: string;
        width?: number;
      }
    | { control: "color" }
  );

export interface ButtonItem {
  control: "button";
  key: string;
  title: string;
  description?: ReactNode;
  tooltip?: string;
  keywords?: string[];
  label: ReactNode;
  variant?: "secondary" | "destructive";
  visible?: (values: SettingsValues) => boolean;
  disabled?: (values: SettingsValues) => boolean;
  prefsKey?: keyof Prefs;
  onClick: () => void;
}

export interface CustomItem {
  control: "custom";
  key: string;
  title?: string;
  keywords?: string[];
  visible?: (values: SettingsValues) => boolean;
  disabled?: (values: SettingsValues) => boolean;
  prefsKey?: keyof Prefs;
  standalone?: boolean;
  render: (binding: Binding) => ReactNode;
}

export type Item = FieldItem | ButtonItem | CustomItem;

export interface GroupConfig {
  title?: ReactNode;
  visible?: (values: SettingsValues) => boolean;
  fullWidth?: boolean;
  items?: Item[];
  render?: (binding: Binding) => ReactNode;
  prefsKey?: keyof Prefs;
  useBinding?: () => Binding;
}

export interface SectionConfig {
  title?: ReactNode;
  description?: ReactNode;
  keywords?: string[];
  prefsKey?: keyof Prefs;
  useBinding?: () => Binding;
  groups?: GroupConfig[];
  component?: ComponentType;
}

type FieldControl =
  | { control: "switch" }
  | { control: "select"; options: SelectOption[]; placeholder?: ReactNode }
  | {
      control: "range";
      min: number;
      max: number;
      step?: number;
      suffix?: string;
    }
  | {
      control: "stepper";
      min: number;
      max: number;
      step?: number;
      fallback?: number;
    }
  | {
      control: "number";
      min: number;
      max: number;
      unit?: string;
      width?: number;
    }
  | { control: "color" };

interface FieldMeta {
  title: string;
  description?: ReactNode;
  tooltip?: string;
  keywords?: string[];
  visible?: (values: SettingsValues) => boolean;
  disabled?: (values: SettingsValues) => boolean;
  apply?: () => void;
}

type TypedFieldItem<V> = FieldMeta &
  FieldControl & { key: Extract<keyof V, string> };

type OverrideFieldItem = {
  [K in keyof Prefs]: TypedFieldItem<Prefs[K]> & { prefsKey: K };
}[keyof Prefs];

type TypedItem<V> =
  | TypedFieldItem<V>
  | OverrideFieldItem
  | ButtonItem
  | CustomItem;

interface TypedGroupInput<V> {
  title?: ReactNode;
  visible?: (values: SettingsValues) => boolean;
  fullWidth?: boolean;
  items?: TypedItem<V>[];
  render?: (binding: Binding) => ReactNode;
}

interface TypedSectionInput<V> {
  title?: ReactNode;
  description?: ReactNode;
  keywords?: string[];
  groups: TypedGroupInput<V>[];
}

interface CustomSectionInput {
  title?: ReactNode;
  description?: ReactNode;
  keywords?: string[];
  groups: GroupConfig[];
}

export function defineSection<K extends keyof Prefs>(
  prefsKey: K,
  input: TypedSectionInput<Prefs[K]>,
): SectionConfig {
  return { ...input, prefsKey, groups: input.groups };
}

export function defineCustomSection(input: CustomSectionInput): SectionConfig {
  return input;
}

export const group = {
  prefs<K extends keyof Prefs>(
    prefsKey: K,
    input: TypedGroupInput<Prefs[K]>,
  ): GroupConfig {
    return { ...input, prefsKey, items: input.items };
  },
  with<V extends SettingsValues>(
    useBinding: () => Binding<V>,
    input: TypedGroupInput<V>,
  ): GroupConfig {
    return {
      ...input,
      useBinding,
      items: input.items,
    };
  },
  plain(input: TypedGroupInput<SettingsValues>): GroupConfig {
    return { ...input, items: input.items };
  },
};
