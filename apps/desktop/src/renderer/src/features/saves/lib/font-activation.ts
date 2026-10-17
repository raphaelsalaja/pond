import { notify } from "@/shared/lib/toast";

/** Runs the activate/deactivate query; resolves true when the request succeeded. */
export async function setFontActivation(
  id: string,
  activate: boolean,
): Promise<boolean> {
  const result = activate
    ? await window.pond.query("saves.activateFont", { id })
    : await window.pond.query("saves.deactivateFont", { id });
  if (!result.ok) {
    notify({
      id: "font-activation",
      title: activate
        ? "Couldn't activate this font."
        : "Couldn't deactivate this font. Close apps using it and try again.",
    });
    return false;
  }
  if ("requiresSignIn" in result && result.requiresSignIn) {
    notify({
      id: "font-activation",
      title: "Font installed",
      description: "Available in other apps after you sign out and back in.",
    });
  }
  return true;
}
