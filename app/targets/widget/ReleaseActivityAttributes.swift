import ActivityKit
import Foundation

/// ActivityKit attributes shared between the main app and the widget extension.
///
/// ⚠️ DUPLICATE-FILE WARNING ⚠️
/// This file MUST be kept byte-identical with
/// `modules/live-activity/ios/ReleaseActivityAttributes.swift`. They define
/// the same logical type but live in two separate Swift modules:
///
///   • Main app                  → module `LiveActivity` (the Expo native module pod)
///   • Widget extension (this)   → module `ReleasePilotWidget`
///
/// ActivityKit bridges these two binaries via Codable serialization at the
/// system level — as long as the field names + types + Codable encoding
/// match exactly, the widget process correctly deserializes the payloads
/// the app sends with `Activity.request(...)` / `update(...)` / `end(...)`.
///
/// We don't use a single shared SPM module because:
///   (a) `@bacons/apple-targets` doesn't currently emit a real SPM package
///       that both the Pod and the extension can depend on, and
///   (b) Xcode Target Membership isn't editable from `expo-target.config.js`.
///
/// If you change ANY field of `ReleaseActivityAttributes` or `ContentState`
/// below, you MUST mirror the change in the main-app copy or the activity
/// payloads will fail to decode and the Lock-Screen banner will silently
/// disappear.
public struct ReleaseActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Mutable state — what changes during the activity's lifetime
        public var semanticState: String       // matches our 7 SemanticState values
        public var stateLabel: String
        public var stateShortLabel: String
        public var stateFgLight: String
        public var stateBgLight: String
        public var stateFgDark: String
        public var stateBgDark: String
        public var lastChangedAtMs: Double

        public init(
            semanticState: String,
            stateLabel: String,
            stateShortLabel: String,
            stateFgLight: String,
            stateBgLight: String,
            stateFgDark: String,
            stateBgDark: String,
            lastChangedAtMs: Double
        ) {
            self.semanticState   = semanticState
            self.stateLabel      = stateLabel
            self.stateShortLabel = stateShortLabel
            self.stateFgLight    = stateFgLight
            self.stateBgLight    = stateBgLight
            self.stateFgDark     = stateFgDark
            self.stateBgDark     = stateBgDark
            self.lastChangedAtMs = lastChangedAtMs
        }
    }

    // Immutable for the activity's lifetime
    public var appAscId: String
    public var appName: String
    public var versionString: String
    public var buildNumber: String?

    public init(
        appAscId: String,
        appName: String,
        versionString: String,
        buildNumber: String?
    ) {
        self.appAscId      = appAscId
        self.appName       = appName
        self.versionString = versionString
        self.buildNumber   = buildNumber
    }
}
