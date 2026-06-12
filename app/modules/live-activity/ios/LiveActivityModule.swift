import ActivityKit
import ExpoModulesCore
import Foundation

/// Bridge between RN/JS and ActivityKit.
///
/// `ReleaseActivityAttributes` is defined in a **sibling file** in this
/// same directory (`ReleaseActivityAttributes.swift`) and compiled into
/// the same `LiveActivity` Pod module — so it's directly visible here.
///
/// A byte-identical copy lives in `targets/widget/ReleaseActivityAttributes.swift`
/// so the widget extension has its own resolvable type. ActivityKit
/// bridges the two via Codable serialization at the system level. See
/// "ActivityKit cross-target type sharing" in app/AGENTS.md before
/// editing either copy.

public class LiveActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("LiveActivity")

        AsyncFunction("areLiveActivitiesEnabled") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        AsyncFunction("startActivity") {
            (attributes: [String: Any], initialState: [String: Any]) -> String in
            return try Self.startActivity(attributesDict: attributes, stateDict: initialState)
        }

        AsyncFunction("updateActivity") {
            (activityId: String, state: [String: Any]) -> Void in
            try await Self.updateActivity(activityId: activityId, stateDict: state)
        }

        AsyncFunction("endActivity") {
            (activityId: String, finalState: [String: Any]) -> Void in
            try await Self.endActivity(activityId: activityId, stateDict: finalState)
        }

        AsyncFunction("endAllActivities") { () -> Int in
            return await Self.endAllActivities()
        }
    }

    // MARK: - Start

    static func startActivity(attributesDict: [String: Any], stateDict: [String: Any]) throws -> String {
        guard #available(iOS 16.2, *) else {
            throw LiveActivityError.unsupportedOS
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw LiveActivityError.notAuthorized
        }
        let attributes = try decodeAttributes(attributesDict)
        let state      = try decodeState(stateDict)

        let activity = try Activity<ReleaseActivityAttributes>.request(
            attributes: attributes,
            content: ActivityContent(state: state, staleDate: nil),
            pushType: nil  // Phase 6 will set this to `.token` for APNs-driven updates
        )
        return activity.id
    }

    // MARK: - Update

    @available(iOS 16.2, *)
    static func updateActivity(activityId: String, stateDict: [String: Any]) async throws {
        let state = try decodeState(stateDict)
        guard let activity = Activity<ReleaseActivityAttributes>.activities
                .first(where: { $0.id == activityId }) else {
            throw LiveActivityError.notFound(activityId)
        }
        await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    // MARK: - End

    @available(iOS 16.2, *)
    static func endActivity(activityId: String, stateDict: [String: Any]) async throws {
        let state = try decodeState(stateDict)
        guard let activity = Activity<ReleaseActivityAttributes>.activities
                .first(where: { $0.id == activityId }) else {
            // Already gone — treat as success (we shouldn't crash on race)
            return
        }
        await activity.end(
            ActivityContent(state: state, staleDate: nil),
            dismissalPolicy: .default
        )
    }

    @available(iOS 16.2, *)
    static func endAllActivities() async -> Int {
        let activities = Activity<ReleaseActivityAttributes>.activities
        for activity in activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return activities.count
    }

    // MARK: - Decoding from JS dicts

    static func decodeAttributes(_ dict: [String: Any]) throws -> ReleaseActivityAttributes {
        guard let appAscId      = dict["appAscId"]      as? String,
              let appName       = dict["appName"]       as? String,
              let versionString = dict["versionString"] as? String else {
            throw LiveActivityError.invalidAttributes
        }
        let buildNumber = dict["buildNumber"] as? String
        return ReleaseActivityAttributes(
            appAscId:      appAscId,
            appName:       appName,
            versionString: versionString,
            buildNumber:   buildNumber
        )
    }

    static func decodeState(_ dict: [String: Any]) throws -> ReleaseActivityAttributes.ContentState {
        guard let semanticState   = dict["semanticState"]   as? String,
              let stateLabel      = dict["stateLabel"]      as? String,
              let stateShortLabel = dict["stateShortLabel"] as? String,
              let stateFgLight    = dict["stateFgLight"]    as? String,
              let stateBgLight    = dict["stateBgLight"]    as? String,
              let stateFgDark     = dict["stateFgDark"]     as? String,
              let stateBgDark     = dict["stateBgDark"]     as? String,
              let lastChangedMs   = dict["lastChangedAtMs"] as? Double else {
            throw LiveActivityError.invalidState
        }
        return ReleaseActivityAttributes.ContentState(
            semanticState:   semanticState,
            stateLabel:      stateLabel,
            stateShortLabel: stateShortLabel,
            stateFgLight:    stateFgLight,
            stateBgLight:    stateBgLight,
            stateFgDark:     stateFgDark,
            stateBgDark:     stateBgDark,
            lastChangedAtMs: lastChangedMs
        )
    }
}

enum LiveActivityError: Error, LocalizedError {
    case unsupportedOS
    case notAuthorized
    case notFound(String)
    case invalidAttributes
    case invalidState

    var errorDescription: String? {
        switch self {
        case .unsupportedOS:          return "Live Activities require iOS 16.2+"
        case .notAuthorized:          return "Live Activities disabled in Settings"
        case .notFound(let id):       return "No live activity found with id \(id)"
        case .invalidAttributes:      return "Missing required Live Activity attributes"
        case .invalidState:           return "Missing required Live Activity state fields"
        }
    }
}
