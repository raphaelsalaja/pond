/** Draws Pond's selected app icon color on its Dock tile while Pond is not running; `publishDockTile` in apps/desktop/src/main/core/app-icon.ts writes the preferences it reads. */
import AppKit

private let pondDomain = "so.pond.desktop" as CFString
/** Posted by Pond after it changes the tile images, so a quit Pond's tile follows the next selection. */
private let tileChanged = Notification.Name("so.pond.desktop.dockTileChanged")

private func preference(_ key: String, _ domain: CFString) -> String? {
    CFPreferencesAppSynchronize(domain)
    return CFPreferencesCopyAppValue(key as CFString, domain) as? String
}

/** Mirrors `classifyIconStyle` in icon-style.ts. */
private func iconStyle() -> String {
    let theme = preference("AppleIconAppearanceTheme", kCFPreferencesAnyApplication) ?? ""
    let interface = preference("AppleInterfaceStyle", kCFPreferencesAnyApplication) ?? ""
    if theme.hasPrefix("Clear") || theme.hasPrefix("Tinted") { return "monochrome" }
    if theme.hasSuffix("Dark") { return "dark" }
    if theme.hasSuffix("Automatic") && interface == "Dark" { return "dark" }
    return "light"
}

@objc(PondDockTilePlugIn)
final class PondDockTilePlugIn: NSObject, NSDockTilePlugIn {
    private static let styleKeys = ["AppleIconAppearanceTheme", "AppleInterfaceStyle"]
    private var tile: NSDockTile?
    /** Pond.app/Contents/Resources, found from Contents/PlugIns/PondDockTile.docktileplugin. */
    private let resources = Bundle(for: PondDockTilePlugIn.self).bundleURL
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Resources")
    private var observers: [NSObjectProtocol] = []

    private var pending: DispatchWorkItem?

    func setDockTile(_ dockTile: NSDockTile?) {
        let center = DistributedNotificationCenter.default()
        observers.forEach(center.removeObserver)
        observers = []
        if tile != nil {
            for key in Self.styleKeys { UserDefaults.standard.removeObserver(self, forKeyPath: key) }
        }
        tile = dockTile
        guard dockTile != nil else { return }
        for name in [Notification.Name("AppleInterfaceThemeChangedNotification"), tileChanged] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.scheduleDraw()
            })
        }
        for key in Self.styleKeys { UserDefaults.standard.addObserver(self, forKeyPath: key, options: [], context: nil) }
        draw()
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        scheduleDraw()
    }

    /** A style switch writes several preferences in quick succession; draw once they settle. */
    private func scheduleDraw() {
        pending?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.draw() }
        pending = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: item)
    }

    private func draw() {
        guard let tile else { return }
        let style = iconStyle()
        let key = style == "dark" ? "DockTileDarkImage" : "DockTileLightImage"
        guard style != "monochrome",
              let path = preference(key, pondDomain),
              let image = NSImage(contentsOf: resources.appendingPathComponent(path))
        else {
            // No color selected, or Clear and Tinted: the bundle's own icon already matches.
            tile.contentView = nil
            tile.display()
            return
        }
        // The image is already on the macOS icon grid with the native drop shadow; see scripts/prepare-dock-icons.mjs.
        let view = NSImageView(frame: NSRect(origin: .zero, size: tile.size))
        view.image = image
        view.imageScaling = .scaleProportionallyUpOrDown
        tile.contentView = view
        tile.display()
    }
}
