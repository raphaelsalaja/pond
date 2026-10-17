export function isWindowsSymlinkPrivilegeError(error: Error): boolean {
  if (process.platform !== "win32") return false;
  if (!("code" in error)) return false;
  return error.code === "EPERM" || error.code === "EACCES";
}
