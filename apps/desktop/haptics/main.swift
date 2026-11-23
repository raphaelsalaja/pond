/** Plays a trackpad haptic for each pattern name Pond writes to stdin, one per line; see apps/desktop/src/main/core/haptics.ts. */
import AppKit

let patterns: [String: NSHapticFeedbackManager.FeedbackPattern] = [
    "generic": .generic,
    "alignment": .alignment,
    "level-change": .levelChange,
]

var buffer = ""

/** Pond holds stdin open; end of input means it quit or no longer needs haptics. */
FileHandle.standardInput.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty { exit(0) }
    guard let chunk = String(data: data, encoding: .utf8) else { return }
    DispatchQueue.main.async {
        buffer += chunk
        while let newline = buffer.firstIndex(of: "\n") {
            let name = String(buffer[..<newline]).trimmingCharacters(in: .whitespaces)
            buffer = String(buffer[buffer.index(after: newline)...])
            guard let pattern = patterns[name] else { continue }
            NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
        }
    }
}

RunLoop.main.run()
