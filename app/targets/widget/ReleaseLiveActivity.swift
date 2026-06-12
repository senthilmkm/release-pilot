import ActivityKit
import SwiftUI
import WidgetKit

/// Live Activity for one in-flight version submission.
///
/// Started by the RN app when a version enters an in-flight state
/// (submitted / in_review / approved_*) via the `LiveActivity` custom
/// Expo module. Updated on every state change. Ended when the version
/// reaches a terminal state (live / rejected).
///
/// Renders in three contexts:
///  1. Lock Screen / Notification Center banner
///  2. Dynamic Island — compact (icon)
///  3. Dynamic Island — expanded (icon + name + state + time)
///  4. Dynamic Island — minimal (just the state pill, side-by-side with
///     another activity)

// MARK: - Attributes
//
// `ReleaseActivityAttributes` is defined in the sibling file
// `ReleaseActivityAttributes.swift` in this directory. apple-targets picks
// up every .swift file in `targets/widget/` automatically, so both files
// are compiled into the same `ReleasePilotWidget` extension target.

// MARK: - Widget

struct ReleaseLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ReleaseActivityAttributes.self) { context in
            // Lock Screen / Notification Center banner
            LockScreenBanner(context: context)
                .activityBackgroundTint(Color.clear)
                .activitySystemActionForegroundColor(Color.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: stateSymbol(context.state.semanticState))
                            .font(.system(size: 14, weight: .semibold))
                        Text(context.attributes.appName)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("v\(context.attributes.versionString)")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        StatePill(context: context)
                        Spacer()
                        Text("Updated \(relativeShortFromMs(context.state.lastChangedAtMs))")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)
                    }
                }
            } compactLeading: {
                Image(systemName: stateSymbol(context.state.semanticState))
                    .font(.system(size: 12, weight: .semibold))
            } compactTrailing: {
                Text(context.state.stateShortLabel)
                    .font(.system(size: 11, weight: .semibold))
            } minimal: {
                Image(systemName: stateSymbol(context.state.semanticState))
                    .font(.system(size: 11, weight: .semibold))
            }
        }
    }
}

// MARK: - Subviews

private struct LockScreenBanner: View {
    @Environment(\.colorScheme) var scheme
    let context: ActivityViewContext<ReleaseActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            Text(initial(of: context.attributes.appName))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(context.attributes.appName)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                Text("v\(context.attributes.versionString)" +
                     (context.attributes.buildNumber.map { " (\($0))" } ?? ""))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            StatePill(context: context)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

private struct StatePill: View {
    @Environment(\.colorScheme) var scheme
    let context: ActivityViewContext<ReleaseActivityAttributes>

    var body: some View {
        let fg = Color(hex: scheme == .dark ? context.state.stateFgDark : context.state.stateFgLight)
        let bg = Color(hex: scheme == .dark ? context.state.stateBgDark : context.state.stateBgLight)
        return Text(context.state.stateLabel)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(bg, in: Capsule())
    }
}

// MARK: - Helpers

/// Maps semantic state → SF Symbol name. Mirrors `state-tokens.ts` `StateIcons`.
private func stateSymbol(_ state: String) -> String {
    switch state {
    case "drafting":           return "pencil"
    case "submitted":          return "paperplane.fill"
    case "in_review":          return "eye.fill"
    case "approved_waiting":   return "checkmark.circle"
    case "approved_scheduled": return "calendar.badge.clock"
    case "live":               return "checkmark.seal.fill"
    case "rejected":           return "xmark.octagon.fill"
    default:                   return "circle"
    }
}

private func initial(of name: String) -> String {
    String(name.trimmingCharacters(in: .whitespaces).first ?? "?").uppercased()
}

private func relativeShortFromMs(_ ms: Double) -> String {
    let date = Date(timeIntervalSince1970: ms / 1000)
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f.localizedString(for: date, relativeTo: Date())
}
