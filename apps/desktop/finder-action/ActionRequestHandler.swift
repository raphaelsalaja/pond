import AppKit
import UniformTypeIdentifiers

/// Principal class named in Info.plist as `PondFinderAction.ActionRequestHandler`.
/// Opens the selection with Pond through Launch Services, so a closed Pond launches and imports it as `open-file`.
final class ActionRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let providers = (context.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
        Task {
            var urls: [URL] = []
            for provider in providers {
                if let url = await loadFileURL(provider) { urls.append(url) }
            }
            if !urls.isEmpty { await openInPond(urls) }
            context.completeRequest(returningItems: nil)
        }
    }

    /// The extension ships at `Pond.app/Contents/PlugIns/<name>.appex`.
    private var pondApp: URL {
        Bundle.main.bundleURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func loadFileURL(_ provider: NSItemProvider) async -> URL? {
        let type = UTType.fileURL.identifier
        guard provider.hasItemConformingToTypeIdentifier(type) else { return nil }
        let item = try? await provider.loadItem(forTypeIdentifier: type)
        if let url = item as? URL { return url }
        if let data = item as? Data { return URL(dataRepresentation: data, relativeTo: nil) }
        return nil
    }

    private func openInPond(_ urls: [URL]) async {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        _ = try? await NSWorkspace.shared.open(
            urls,
            withApplicationAt: pondApp,
            configuration: configuration
        )
    }
}
