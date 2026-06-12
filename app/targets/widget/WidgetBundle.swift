import SwiftUI
import WidgetKit

/// Top-level entry. Apple looks for an `@main`-annotated
/// `WidgetBundle` in the extension target and registers every widget
/// returned from `body`.
@main
struct ReleasePilotWidgetBundle: WidgetBundle {
    var body: some Widget {
        ReleasesWidget()
        ReleaseLiveActivity()
    }
}
