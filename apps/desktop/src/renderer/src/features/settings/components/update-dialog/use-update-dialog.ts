import { useSelector } from "@tanstack/react-store";
import { updateDialogStore, updateNoticeStore } from "./session";

export function useUpdateDialog() {
  return useSelector(updateDialogStore, (state) => state);
}

export function useUpdateNotice() {
  return useSelector(updateNoticeStore, (state) => state);
}
