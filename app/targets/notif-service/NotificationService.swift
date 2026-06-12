import UserNotifications

/// Notification Service Extension — runs on each incoming APNs payload
/// BEFORE the user sees the banner, giving us a chance to mutate the
/// content (e.g. add a rich state-pill icon, attach a sound based on
/// severity, or update Live Activities in lock-step with the push).
///
/// Phase 5 ships a passthrough: we accept the original content as-is.
/// Phase 6 will use this to:
///   - Decode the custom payload `app_id` + `new_state`
///   - Update the running Live Activity for that app
///   - Tweak the banner title/subtitle to include the state pill emoji
class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        self.bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent

        guard let content = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // Phase 5: passthrough.
        // Phase 6 hook point — decode `content.userInfo["app_id"]` etc.

        contentHandler(content)
    }

    override func serviceExtensionTimeWillExpire() {
        // Apple gives us ~30s; if we run out, deliver whatever we have
        if let handler = contentHandler, let content = bestAttemptContent {
            handler(content)
        }
    }
}
