import SwiftUI
import WidgetKit

/// Home/Lock-screen widget showing the developer's apps + their current
/// semantic states.
///
/// Supported families:
///  - systemSmall          → one app's state badge + version (the hero app)
///  - systemMedium         → up to 3 apps as rows
///  - systemLarge          → up to 6 apps as rows
///  - accessoryRectangular → Lock screen — 1 app, compact
///  - accessoryCircular    → Lock screen — count of apps in non-Live states
///  - accessoryInline      → Lock screen — one line above the clock
///
/// Tier-aware: the shared state's `proStatus` + `headline` fields are
/// rendered as a banner above the app rows for free/lapsed users. Pro
/// users see no banner.
///
/// Data source: `SharedAppStateLoader.load()` (App Group UserDefaults).
/// We reload every 15 minutes via `Timeline.atEnd(.after(...))` — that
/// matches the background-refresh cadence the main app uses for polling.
/// The main app also calls `WidgetCenter.shared.reloadAllTimelines()`
/// whenever fresh data arrives so the widget updates immediately.

struct ReleasesWidget: Widget {
    let kind = "ReleasesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ReleasesProvider()) { entry in
            ReleasesWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                // Deep-link tap → open Release Pilot. For multi-row
                // widgets we override per-row via Link below; this is
                // the catch-all (single-app widgets + empty states).
                .widgetURL(URL(string: "releasepilot://widget"))
        }
        .configurationDisplayName("Releases")
        .description("See the App Store status of your apps at a glance.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline,
        ])
    }
}

// MARK: - Timeline

struct ReleasesEntry: TimelineEntry {
    let date: Date
    let snapshot: SharedAppState?
}

struct ReleasesProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReleasesEntry {
        ReleasesEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (ReleasesEntry) -> Void) {
        completion(ReleasesEntry(date: Date(), snapshot: SharedAppStateLoader.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReleasesEntry>) -> Void) {
        let entry = ReleasesEntry(date: Date(), snapshot: SharedAppStateLoader.load())
        // Refresh every 15 minutes (worst case). The main app calls
        // `WidgetCenter.shared.reloadAllTimelines()` whenever fresh data
        // arrives, so this is just a fallback for backgrounded apps.
        let refreshAt = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(refreshAt)))
    }
}

// MARK: - View

struct ReleasesWidgetView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme
    let entry: ReleasesEntry

    var body: some View {
        switch family {
        case .accessoryRectangular: lockScreenRectangularView
        case .accessoryCircular:    lockScreenCircularView
        case .accessoryInline:      lockScreenInlineView
        case .systemSmall:          smallView
        case .systemMedium:         multiView(maxRows: 3)
        case .systemLarge:          multiView(maxRows: 6)
        default:                    multiView(maxRows: 3)
        }
    }

    private var apps: [WidgetAppRow] { entry.snapshot?.apps ?? [] }
    private var headline: String? { entry.snapshot?.headline }
    /// Defaults to `.pro` if the field is absent (old TS bundle wrote
    /// a payload before the tier-aware widget shipped). Means: render
    /// everything normally, don't show a banner.
    private var proStatus: WidgetProStatus { entry.snapshot?.proStatus ?? .pro }
    private var isLapsed: Bool { proStatus == .lapsed }

    // ----- Lock screen — accessoryRectangular ---------------------------
    private var lockScreenRectangularView: some View {
        let app = apps.first
        return VStack(alignment: .leading, spacing: 2) {
            Text("Release Pilot")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            if let app {
                Text(app.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text("\(app.stateShortLabel) · v\(app.versionString)")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else if let headline {
                Text(headline)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            } else {
                Text("Open Release Pilot to connect").font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // ----- Lock screen — accessoryCircular (count gauge) ----------------
    /// Renders the count of "in flight" apps (anything that isn't Live
    /// or empty). Solo devs glance at this to see "do I have stuff
    /// happening?".
    private var lockScreenCircularView: some View {
        let inFlight = apps.filter { isInFlight(stateKey: $0.state) }.count
        return ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -2) {
                Text("\(inFlight)")
                    .font(.system(size: 22, weight: .bold))
                Text("LIVE")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // ----- Lock screen — accessoryInline (above the clock) --------------
    private var lockScreenInlineView: some View {
        let app = apps.first
        if let app {
            return Text("\(app.name) · \(app.stateShortLabel)")
        } else if let headline {
            return Text(headline)
        } else {
            return Text("Release Pilot")
        }
    }

    // ----- Small — 1 hero app -------------------------------------------
    private var smallView: some View {
        guard let app = apps.first else { return AnyView(emptyOrHeadlineView) }
        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                headerRow(compact: true)
                Spacer(minLength: 0)
                Text(app.name).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                stateBadge(app)
                Text("v\(app.versionString)" + (app.buildNumber.map { " (\($0))" } ?? ""))
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                if let headline {
                    Text(headline)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(isLapsed ? .orange : .secondary)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        )
    }

    // ----- Medium / Large — list of apps --------------------------------
    private func multiView(maxRows: Int) -> some View {
        let shown = Array(apps.prefix(maxRows))
        return VStack(alignment: .leading, spacing: 8) {
            headerRow(compact: false)
            if shown.isEmpty {
                Spacer()
                if let headline {
                    Text(headline)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(isLapsed ? .orange : .secondary)
                } else {
                    Text("Open Release Pilot to connect").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
            } else {
                ForEach(shown) { app in
                    // Each row deep-links to that app's detail in the
                    // main app via the custom scheme.
                    Link(destination: URL(string: "releasepilot://app/\(app.ascId)")!) {
                        appRow(app)
                    }
                }
                if let headline {
                    Text(headline)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(isLapsed ? .orange : .secondary)
                        .padding(.top, 2)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func headerRow(compact: Bool) -> some View {
        HStack {
            Text("Release Pilot")
                .font(.system(size: compact ? 10 : 11, weight: .semibold))
                .foregroundStyle(.secondary)
            Spacer()
            if !compact, let updated = entry.snapshot?.lastUpdatedMs {
                Text(relativeShort(Date(timeIntervalSince1970: updated / 1000)))
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func appRow(_ app: WidgetAppRow) -> some View {
        HStack(spacing: 10) {
            Text(initial(of: app.name))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(Color.blue, in: RoundedRectangle(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 2) {
                Text(app.name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                HStack(spacing: 4) {
                    stateBadge(app, compact: true)
                    Text("v\(app.versionString)")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
        }
    }

    private func stateBadge(_ app: WidgetAppRow, compact: Bool = false) -> some View {
        let label = compact ? app.stateShortLabel : app.stateLabel
        return Text(label)
            .font(.system(size: compact ? 10 : 11, weight: .semibold))
            .foregroundStyle(app.fg.resolve(scheme))
            .padding(.horizontal, compact ? 5 : 7)
            .padding(.vertical, compact ? 1 : 2)
            .background(app.bg.resolve(scheme), in: Capsule())
    }

    /// Shown in `systemSmall` when there are no apps — uses the headline
    /// (free/lapsed CTA) when present, otherwise the generic empty state.
    private var emptyOrHeadlineView: some View {
        VStack(spacing: 6) {
            Text("Release Pilot")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(headline ?? "Open the app to connect")
                .font(.system(size: 11))
                .foregroundStyle(isLapsed ? .orange : .secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Helpers

/// "In flight" = anything actively moving through the release pipeline.
/// Matches the TS `SemanticState` keys in `src/constants/state-tokens.ts`.
/// Excludes idle states (`drafting`, `live`).
private func isInFlight(stateKey: String) -> Bool {
    switch stateKey {
    case "submitted", "in_review", "approved_waiting",
         "approved_scheduled", "rejected":
        return true
    default:
        return false
    }
}

private func initial(of name: String) -> String {
    String(name.trimmingCharacters(in: .whitespaces).first ?? "?").uppercased()
}

/// "5m ago" / "2h ago" / "3d ago" / "May 11"
private func relativeShort(_ date: Date) -> String {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f.localizedString(for: date, relativeTo: Date())
}
