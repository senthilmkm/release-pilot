/** @type {import('@bacons/apple-targets').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  // Xcode target name (also the build-product name). MUST be unique
  // from the main app target ("ReleasePilot") and MUST match the
  // `targetName` in app.json → extra.eas.build.experimental.ios.appExtensions.
  // The user-facing display name in the iOS widget gallery comes from
  // CFBundleDisplayName in Info.plist ("Release Pilot"), NOT this value.
  name: 'ReleasePilotWidget',
  // iOS 16.1 is the minimum for ActivityKit Live Activities.
  // 17 matches the rest of the app — keeps Swift APIs consistent.
  deploymentTarget: '17.0',
  // App Group entitlement so the widget can read SharedAppState
  entitlements: {
    'com.apple.security.application-groups': [
      'group.app.releasepilot.shared',
    ],
  },
  // What this target bundles
  // (Resources are auto-detected from the folder. Code files too.)
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
});
