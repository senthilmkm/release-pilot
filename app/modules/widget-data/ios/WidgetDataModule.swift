import ExpoModulesCore
import Foundation
import WidgetKit

/// Writes the shared app-state JSON to the App Group container so the
/// WidgetKit widget + Live Activity can read it, then triggers a
/// timeline refresh.
///
/// Storage backend: `UserDefaults(suiteName:)`. We could write to a
/// file in `containerURL(forSecurityApplicationGroupIdentifier:)`, but
/// UserDefaults is fine for <1MB payloads (our SharedAppState caps out
/// well under that) and avoids serializing a file write.

public class WidgetDataModule: Module {
    /// Matches `SHARED_STATE_KEY` in `src/lib/native/shared-app-state.ts`.
    static let stateKey   = "release-pilot.state.v1"
    /// Matches `APP_GROUP_ID` in `src/lib/native/shared-app-state.ts`
    /// AND the `app.json` entitlements list.
    static let appGroupId = "group.app.releasepilot.shared"

    public func definition() -> ModuleDefinition {
        Name("WidgetData")

        AsyncFunction("writeSharedState") { (jsonString: String) -> Void in
            try Self.writeSharedState(jsonString: jsonString)
            Self.reloadWidgets()
        }

        AsyncFunction("reloadWidgets") { () -> Void in
            Self.reloadWidgets()
        }

        AsyncFunction("readSharedState") { () -> String? in
            return Self.readSharedState()
        }
    }

    static func writeSharedState(jsonString: String) throws {
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            throw WidgetDataError.appGroupUnavailable
        }
        defaults.set(jsonString, forKey: stateKey)
    }

    static func readSharedState() -> String? {
        return UserDefaults(suiteName: appGroupId)?.string(forKey: stateKey)
    }

    static func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

enum WidgetDataError: Error, LocalizedError {
    case appGroupUnavailable

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            return "App Group 'group.app.releasepilot.shared' is not configured. " +
                   "Check entitlements + provisioning profile."
        }
    }
}
