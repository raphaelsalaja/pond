import { useSelector } from "@tanstack/react-store";
import { updateDialogStore } from "./session";

export function useUpdateDialog() {
  return useSelector(updateDialogStore, (state) => state);
}
