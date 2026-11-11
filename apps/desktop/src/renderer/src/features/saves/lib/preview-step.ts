import { matchesBinding, type ShortcutBindings } from "@/shared/lib/shortcuts";

export type PreviewStepBinding = "step" | "video-step";

interface PreviewStepInput {
  event: KeyboardEvent;
  binding: PreviewStepBinding;
  bindings: ShortcutBindings;
  videoShown: boolean;
}

export function previewStepRuns({
  event,
  binding,
  bindings,
  videoShown,
}: PreviewStepInput): boolean {
  const seeks =
    matchesBinding(event, bindings, "viewer.seek-back") ||
    matchesBinding(event, bindings, "viewer.seek-forward");
  if (videoShown && seeks) return false;
  if (binding === "step") return true;
  const steps =
    matchesBinding(event, bindings, "viewer.step-prev") ||
    matchesBinding(event, bindings, "viewer.step-next");
  return videoShown && !steps;
}
