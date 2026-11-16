/** Prints the macOS icon style as one JSON line at start and after each change; see apps/desktop/src/main/core/icon-style.ts for how Pond reads it. */
import Foundation

/** Reads a global preference fresh from disk; the in-process copy can lag behind a change that just arrived. */
func globalPreference(_ key: String) -> String {
    CFPreferencesAppSynchronize(kCFPreferencesAnyApplication)
    return CFPreferencesCopyAppValue(key as CFString, kCFPreferencesAnyApplication) as? String ?? ""
}

final class StyleReporter: NSObject {
    private var last: String?
    private var pending: DispatchWorkItem?

    func report() {
        let line = String(
            data: try! JSONEncoder().encode([
                "theme": globalPreference("AppleIconAppearanceTheme"),
                "interface": globalPreference("AppleInterfaceStyle"),
            ]),
            encoding: .utf8
        )!
        guard line != last else { return }
        last = line
        print(line)
        fflush(stdout)
    }

    /** A style switch writes several preferences in quick succession; report once they settle. */
    func scheduleReport() {
        pending?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.report() }
        pending = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: item)
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        scheduleReport()
    }
}

let reporter = StyleReporter()
for key in ["AppleIconAppearanceTheme", "AppleInterfaceStyle"] {
    UserDefaults.standard.addObserver(reporter, forKeyPath: key, options: [], context: nil)
}
DistributedNotificationCenter.default().addObserver(
    forName: Notification.Name("AppleInterfaceThemeChangedNotification"), object: nil, queue: .main
) { _ in reporter.scheduleReport() }

/** Pond holds stdin open; end of input means it quit or no longer needs the style. */
FileHandle.standardInput.readabilityHandler = { handle in
    if handle.availableData.isEmpty { exit(0) }
}

reporter.report()
RunLoop.main.run()
