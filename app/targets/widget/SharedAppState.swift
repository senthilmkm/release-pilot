import Foundation
import SwiftUI

/// Mirror of the TypeScript `SharedAppState` shape defined in
/// `src/lib/native/shared-app-state.ts`.
///
/// IMPORTANT: any change to fields MUST be made on both sides.
/// The `v` envelope number lets the Swift decoder bail on mismatched
/// versions rather than silently rendering stale shapes.
struct WidgetAppRow: Codable, Identifiable, Hashable {
    let ascId: String
    let name: String
    let bundleId: String
    let state: String           // semantic state — matches TS `SemanticState`
    let stateLabel: String
    let stateShortLabel: String
    let versionString: String
    let buildNumber: String?
    let lastChangedAt: String   // ISO 8601
    let stateFgLight: String    // hex e.g. "#7A5C00"
    let stateBgLight: String
    let stateFgDark: String
    let stateBgDark: String

    var id: String { ascId }
}

/// Subscription tier visible to the widget — drives apps cap +
/// "Renew Pro" headline. Must match TS `WidgetProStatus`.
///
/// Optional in the payload — old TS bundles (pre-tier-aware widget)
/// don't write this field. When missing, the widget defaults to `.pro`
/// (i.e. show all apps, no headline) so existing users don't lose data
/// during a JS-bundle-only upgrade.
enum WidgetProStatus: String, Codable {
    case pro
    case free
    case lapsed
}

struct SharedAppState: Codable {
    let v: Int
    let lastUpdatedMs: Double
    let apps: [WidgetAppRow]
    /// Additive field — Optional so old payloads (without it) still
    /// decode successfully. Defaults to `.pro` at render time.
    let proStatus: WidgetProStatus?
    /// Optional CTA banner (e.g. "Renew Pro to track all apps"). When
    /// nil the widget renders without any banner.
    let headline: String?
}

/// Loads the latest snapshot from the App Group container.
/// Returns `nil` on first launch (before the RN app has ever written) OR
/// on schema-version mismatch — both treated as "no data, show empty state".
enum SharedAppStateLoader {
    static let appGroupId = "group.app.releasepilot.shared"
    static let stateKey   = "release-pilot.state.v1"
    /// Matches `SharedAppState.v` in `src/lib/native/shared-app-state.ts`.
    /// Reserved for BREAKING shape changes — field additions are done
    /// without bumping (Codable ignores unknown fields, Optional fields
    /// gracefully fall back to nil on read).
    static let schemaV    = 1

    static func load() -> SharedAppState? {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return nil }
        guard let data = defaults.string(forKey: stateKey)?.data(using: .utf8) else { return nil }
        do {
            let decoded = try JSONDecoder().decode(SharedAppState.self, from: data)
            guard decoded.v == schemaV else { return nil }
            return decoded
        } catch {
            return nil
        }
    }
}

// MARK: - Color helpers

/// Build a SwiftUI Color from a "#RRGGBB" string. Falls back to gray on
/// malformed input — better than crashing the widget render.
extension Color {
    init(hex: String) {
        let trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        var rgb: UInt64 = 0
        guard Scanner(string: trimmed).scanHexInt64(&rgb), trimmed.count == 6 else {
            self = .gray
            return
        }
        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >>  8) / 255.0
        let b = Double( rgb & 0x0000FF       ) / 255.0
        self = Color(red: r, green: g, blue: b)
    }
}

/// Picks the right hex for the current color scheme.
struct AdaptiveHexColor {
    let light: String
    let dark:  String

    func resolve(_ scheme: ColorScheme) -> Color {
        Color(hex: scheme == .dark ? dark : light)
    }
}

extension WidgetAppRow {
    var fg: AdaptiveHexColor { AdaptiveHexColor(light: stateFgLight, dark: stateFgDark) }
    var bg: AdaptiveHexColor { AdaptiveHexColor(light: stateBgLight, dark: stateBgDark) }
}
