import { Toast } from "@pond/ui";
import type { ReactNode } from "react";

export const TOAST_TIMEOUT_MS = 2500;

export const ASK_TOAST_ID = "ask";

export type ToastTone = "neutral" | "accent" | "gold";

export interface ToastAsk {
  cancel: string;
  confirm: string;
  onConfirm: () => void | Promise<void>;
}

export interface ToastProgress {
  label: string;
  detail?: string;
  value?: number;
  max?: number;
}

export interface ToastData {
  progress?: ToastProgress;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: ReactNode;
  tone?: ToastTone;
  note?: string;
  variant?: "default" | "spotlight";
  ask?: ToastAsk;
}

export const toastManager = Toast.createToastManager<ToastData>();

let toastSequence = 0;

export interface NotifyOptions {
  id: string;
  title: string;
  description?: string;
  progress?: ToastProgress;
  action?: ToastData["action"];
  timeout?: number;
}

function toastOptions(
  options: NotifyOptions,
): Parameters<typeof toastManager.add>[0] {
  const toast: Parameters<typeof toastManager.add>[0] = {
    data: {
      progress: options.progress,
      action: options.action,
    },
    id: options.id,
    title: options.title,
  };
  if (options.description != null) toast.description = options.description;
  if (options.timeout != null) toast.timeout = options.timeout;
  return toast;
}

export function notify(options: NotifyOptions): string {
  toastSequence += 1;
  const id = `${options.id}:${toastSequence}`;
  toastManager.add(toastOptions({ ...options, id }));
  window.dispatchEvent(
    new CustomEvent("pond:notification", {
      detail: {
        title: options.title,
        description: options.description,
      },
    }),
  );
  return id;
}

export function updateNotification(options: NotifyOptions): void {
  toastManager.update(options.id, toastOptions(options));
}

export interface AskOptions extends ToastAsk {
  title: string;
  description: string;
  icon?: ReactNode;
  tone?: ToastTone;
  note?: string;
  variant?: ToastData["variant"];
  onClose: () => void;
}

/** One ask at a time: a new ask replaces the one on screen, and it stays until you answer or dismiss it. */
export function ask(options: AskOptions): void {
  toastManager.add(askToast(ASK_TOAST_ID, options));
}

export function askToast(
  id: string,
  options: AskOptions,
): Parameters<typeof toastManager.add>[0] {
  const { title, description, onClose, ...data } = options;
  return {
    id,
    title,
    description,
    timeout: 0,
    onClose,
    data: {
      icon: data.icon,
      tone: data.tone,
      note: data.note,
      variant: data.variant,
      ask: {
        cancel: data.cancel,
        confirm: data.confirm,
        onConfirm: data.onConfirm,
      },
    },
  };
}
