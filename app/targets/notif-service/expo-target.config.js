/** @type {import('@bacons/apple-targets').ConfigFunction} */
module.exports = (config) => ({
  type: 'notification-service',
  // Xcode target name. MUST be unique and MUST match `targetName` in
  // app.json → extra.eas.build.experimental.ios.appExtensions.
  // The notification banner the user sees uses CFBundleDisplayName
  // from Info.plist ("Release Pilot Notifications"), NOT this value.
  name: 'ReleasePilotNotificationService',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': [
      'group.app.releasepilot.shared',
    ],
  },
  frameworks: ['UserNotifications'],
});
