; Per-user uninstall cleanup for registrations the app writes at runtime.
; Keep the native messaging keys in sync with manifests.ts
; (WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS and WINDOWS_FIREFOX_REGISTRY_KEYS).
; The Library lives outside the install directory and is never touched here.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\pond"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pond"
  ${endIf}
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\Google\Chrome SxS\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\Vivaldi\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\LibreWolf\NativeMessagingHosts\so.pond.host"
  DeleteRegKey HKCU "Software\Floorp\NativeMessagingHosts\so.pond.host"
!macroend
