# Release Pilot — V1 Tech Design

> Companion to `RELEASE_PILOT_V1_PLAN.md`
> Status: Draft 2 — stack pivoted to React Native + Expo (see § STACK PIVOT)
> Author: Senthil
> Last updated: 2026-06-11

## STACK PIVOT (2026-06-11)

Original draft assumed pure Swift/SwiftUI. Implementation pivoted to
**React Native + Expo SDK 56 + custom Swift modules + @bacons/apple-targets**
because Senthil's dev environment is Windows-only (Swift requires macOS).

The architecture guidance below remains valid as a north-star design.
For actual code organization, conventions, folder layout, and rules, the
authoritative source is `app/AGENTS.md`. When this doc and AGENTS.md
disagree, AGENTS.md wins. Specifically:

| Section here | Replaced by |
|---|---|
| §3 Xcode project layout | `app/AGENTS.md` § Folder conventions |
| §4 Swift module responsibilities | TS modules in `app/src/lib/`, Swift in `app/modules/` + `app/targets/` |
| §5 `@Observable` view models | Zustand stores + TanStack Query |
| §6 Keychain Services | `expo-secure-store` (wraps Keychain) |
| §11 SwiftData models | `expo-sqlite` schemas (Phase 2) |
| §15 XCTest | `tsx`-runnable `*.test.ts` (Recall pattern) |

Push proxy (§7), security model (§6), checklist rules (§12), risk register
(§20) are stack-agnostic and stay as-is.

---

---

## 0. Reading order

1. Read `RELEASE_PILOT_V1_PLAN.md` first (the WHAT / WHY).
2. Read this doc (the HOW).
3. Read `RELEASE_PILOT_V1_UX_FLOW.md` (the screens).

Anything in V1.5 / V2 plans is explicitly **out of scope** for this design; references here exist only so we don't paint ourselves into a corner.

---

## 1. Design principles (binding)

These are non-negotiable. Every code review checks against them.

1. **Local-first, push-augmented.** The app must be useful even with a flaky network. Every read goes through SwiftData; the network refreshes the cache.
2. **No user account, no backend DB.** The user's ASC Issuer ID is the only identity. The Cloudflare Worker stores routing tables in KV, not users.
3. **Private keys never leave the device.** The `.p8` private key lives in Keychain. The JWT is minted on-device every 18 minutes. The push proxy never sees the key.
4. **Apple HIG, not Material, not custom.** SwiftUI defaults. SF Symbols. System fonts. System colors with semantic naming. The app must feel like it shipped with iOS.
5. **One job per screen.** No screen does two unrelated things. If a screen needs two jobs, split it.
6. **Trust through transparency.** Every API call is logged to an in-app debug console (off by default; enabled via Settings → Diagnostics). Indie devs trust apps they can audit.
7. **Latency budget: 100ms.** Every tap renders something within 100ms (even if it's a shimmer). Network UI never blocks navigation.
8. **No dark patterns.** Trial cancel is one tap. Restore purchases is visible on the paywall AND in Settings. No "Are you sure?" upsells.

---

## 2. System architecture (high-level)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          iPhone / iPad                                │
│                                                                       │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────────┐   │
│  │ Main App   │  │ Widget Ext  │  │ Live Act.  │  │ Notification │   │
│  │ (SwiftUI)  │  │ (WidgetKit) │  │ (ActKit)   │  │ Service Ext  │   │
│  └─────┬──────┘  └──────┬──────┘  └─────┬──────┘  └──────┬───────┘   │
│        │                │                │                │           │
│        └────────────────┴────────┬───────┴────────────────┘           │
│                                  │                                    │
│                       ┌──────────▼──────────┐                         │
│                       │  Shared Core (SPM)  │                         │
│                       │ ┌─────────────────┐ │                         │
│                       │ │  ASCClient      │ │                         │
│                       │ │  PushClient     │ │                         │
│                       │ │  Keychain       │ │                         │
│                       │ │  SwiftData      │ │                         │
│                       │ │  Domain Models  │ │                         │
│                       │ └─────────────────┘ │                         │
│                       └──────────┬──────────┘                         │
│                                  │                                    │
└──────────────────────────────────┼────────────────────────────────────┘
                                   │
                  ┌────────────────┴───────────────────┐
                  │                                    │
                  ▼                                    ▼
       ┌────────────────────┐               ┌─────────────────────┐
       │ App Store Connect  │               │  Cloudflare Worker   │
       │      REST API      │               │   (push proxy)       │
       │  api.appstore-     │               │ api.releasepilot.app │
       │  connect.apple.com │               │                      │
       └────────────────────┘               └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │   APNs HTTP/2       │
                                            │ api.push.apple.com  │
                                            └─────────────────────┘
```

### Trust boundaries

- **Device ↔ ASC API:** mutual trust via JWT signed with user's private key. Apple verifies signature.
- **Device ↔ Push Proxy:** anonymous; the device's APNs token is the only identifier. No user account.
- **Push Proxy ↔ APNs:** signed via Release Pilot's APNs auth key (Cloudflare Worker secret).
- **ASC webhook → Push Proxy:** authenticated via per-issuer `eventToken` (random secret generated on-device, stored in KV at registration time, sent by ASC in webhook payload).

### What the push proxy knows

- Issuer IDs (just the GUIDs — no metadata)
- APNs device tokens
- App IDs that this device subscribes to per Issuer
- `eventToken` per device (used to validate webhook authenticity)

### What the push proxy does NOT know

- ASC private keys (never leaves device)
- App names, review content, version strings, anything from the ASC API
- The user's email or Apple ID
- Anything in the user's draft submission

This is the "no user database" promise; verify in privacy policy + on landing page.

---

## 3. Project / target layout

Single Xcode workspace, multiple targets, shared core via Swift Package Manager.

```
ReleasePilot.xcworkspace
├── App/                            # iOS app target (bundle: app.releasepilot.ios)
│   ├── ReleasePilotApp.swift       # @main
│   ├── Features/
│   │   ├── Onboarding/
│   │   ├── ReleasesTab/
│   │   ├── ReviewsTab/
│   │   ├── ChecklistTab/
│   │   ├── MoreTab/
│   │   └── Paywall/
│   ├── Navigation/
│   │   └── RootCoordinator.swift
│   └── DesignSystem/
│       ├── Tokens.swift            # colors, spacing, type
│       ├── Components/             # Buttons, badges, cards
│       └── StateBadge.swift        # the single source of truth for state colors
│
├── Widget/                         # Widget extension target
│   ├── ReleasePilotWidgets.swift
│   ├── ReleaseStatusWidget.swift   # small / medium / large
│   └── ReleaseStatusIntent.swift   # app picker config
│
├── LiveActivity/                   # Live Activity extension target
│   ├── ReleasePilotActivity.swift
│   └── ReleaseStatusAttributes.swift
│
├── NotificationService/            # Notification Service extension target
│   └── NotificationService.swift   # for rich notifications + mute-actions
│
├── Packages/
│   ├── ASCClient/                  # SPM — App Store Connect API client
│   │   ├── ASCClient.swift
│   │   ├── JWTSigner.swift         # CryptoKit ES256
│   │   ├── Endpoints/              # one file per endpoint family
│   │   └── DTOs/                   # generated/hand-written response shapes
│   │
│   ├── Persistence/                # SwiftData stack + models
│   │   ├── ModelContainer+RP.swift
│   │   ├── Models/                 # Account, App, Version, Review, ChecklistRun, Settings
│   │   └── CloudKitConfig.swift
│   │
│   ├── Domain/                     # Pure Swift, no UIKit/SwiftUI
│   │   ├── ReleaseStateMachine.swift  # ASC enum → semantic state
│   │   ├── ChecklistRules/         # one file per rule
│   │   └── PushPayload.swift       # codable shapes shared with the Worker
│   │
│   ├── Push/                       # device registration + APNs token handling
│   │   ├── PushClient.swift        # calls our Cloudflare Worker
│   │   └── DeviceRegistration.swift
│   │
│   └── DesignSystem/               # If we want widgets to share tokens
│       └── (re-export of App/DesignSystem/Tokens.swift)
│
├── Tests/
│   ├── ASCClientTests/
│   ├── DomainTests/
│   ├── PersistenceTests/
│   └── SnapshotTests/
│
└── Worker/                         # Cloudflare Worker (TypeScript)
    ├── src/
    │   ├── index.ts
    │   ├── registerDevice.ts
    │   ├── webhook.ts
    │   ├── sendAPNs.ts
    │   └── jwt.ts                  # APNs JWT signer
    ├── wrangler.toml
    └── package.json
```

### Why SPM packages, not just folders?

1. Widget + Live Activity + Notification Service extensions have strict binary size limits. SPM lets us pull only what we need into each extension (e.g. Widget doesn't need `ASCClient` — it reads from SwiftData only).
2. Pure-Swift packages (`Domain`, `ASCClient`) are 10–100× faster to test than full app builds.
3. Future Mac Catalyst port (V2+) becomes mechanical.

---

## 4. Module responsibilities

### 4.1 `ASCClient`

Single-purpose: speak App Store Connect REST API over async/await.

```swift
public protocol ASCClient {
    func listApps() async throws -> [ASCApp]
    func appStoreVersions(appId: String) async throws -> [ASCVersion]
    func customerReviews(appId: String, limit: Int) async throws -> [ASCReview]
    func replyToReview(reviewId: String, body: String) async throws
    func runChecklist(versionId: String) async throws -> [ChecklistRuleResult]
    func registerWebhook(issuerId: String, callbackUrl: URL, eventToken: String) async throws -> String
    func deleteWebhook(id: String) async throws
}

public struct LiveASCClient: ASCClient {
    let credentialsProvider: () throws -> ASCCredentials  // pulls from Keychain
    let urlSession: URLSession
    let jwtCache: JWTCache  // mints JWT, caches for 18 minutes
}
```

- No URLSession outside this package
- All endpoints typed via Decodable DTOs in `DTOs/`
- Retry policy: 1 retry on 5xx with 500ms backoff; surface 4xx immediately
- Rate-limit handling: ASC returns `X-RateLimit-*` headers — capture in a `RateLimitMonitor` actor and throttle proactively
- Test fakes: `MockASCClient` returns stubbed data from JSON fixtures (recorded from a real ASC account at design-time)

### 4.2 `Persistence`

SwiftData container with CloudKit sync.

- **CloudKit database:** Private database, `com.releasepilot.shared` zone
- **Conflict resolution:** Last-writer-wins for `Settings` and per-app preferences; for `Review.response` we use a server-authoritative model — if ASC has a response we don't, treat ours as stale
- **What syncs:** `Account`, `App`, `Version` (last 5 per app), `Review` (last 100 per app), `Settings`
- **What does NOT sync:** `ChecklistRun` (ephemeral, local-only), raw API caches

### 4.3 `Domain`

Pure Swift, zero dependencies. Houses business logic that is testable in isolation.

- `ReleaseStateMachine`: ASC's 25+ raw state strings → 7 semantic states (Drafting / Submitted / In Review / Approved / Ready for Sale / Rejected / Live)
- `ChecklistRules`: protocol `ChecklistRule { func evaluate(version: VersionContext) -> Result }`. 10 concrete rules in V1. Adding a rule = adding one file + one line to a registry.
- `PushPayload`: shared codable struct between Worker and iOS app. Version-tagged with a `schema` field so we can evolve.

### 4.4 `Push`

Owns device registration with our Cloudflare Worker and APNs token lifecycle.

- Captures APNs token via `UIApplicationDelegate.didRegisterForRemoteNotificationsWithDeviceToken`
- On token refresh, re-registers with the Worker
- Generates `eventToken` (32-byte random) on first registration per Issuer; persists in Keychain
- Registers webhook with ASC API via `ASCClient.registerWebhook`, passing the eventToken

---

## 5. State management

### 5.1 In-app state

SwiftUI + `@Observable` (Swift 6) for view models. No third-party libraries (no Redux, no TCA in V1 — keep it boring).

Pattern:

```swift
@Observable
final class ReleasesViewModel {
    enum LoadState { case idle, loading, loaded([AppRow]), error(Error) }
    var state: LoadState = .idle

    func refresh() async { /* hits SwiftData first, then ASCClient */ }
}
```

### 5.2 Refresh strategy

Every list view has the same lifecycle:

1. **On appear:** load from SwiftData immediately (no shimmer).
2. **In parallel:** kick off `ASCClient` refresh in background.
3. **On response:** diff against SwiftData; write changes; UI auto-updates via SwiftData observation.
4. **On error:** show a non-blocking banner; SwiftData cache remains visible.

This is the "local-first, push-augmented" principle made concrete.

### 5.3 Background refresh

- `BGAppRefreshTaskRequest` scheduled every 15 minutes (system decides when to actually run it)
- On run: refresh active versions only (cheap), check for new reviews
- Polling is a **fallback**, not the primary path. Push is the primary signaling channel.

---

## 6. Security model

### 6.1 Credential storage

```
Keychain item layout:

Service:  "app.releasepilot.asc"
Account:  "<issuerId>"
Generic:  encoded as { keyId, p8PEM, eventToken } via Codable + JSONEncoder
Access:   kSecAttrAccessibleWhenUnlockedThisDeviceOnly
Auth:     LAContext with biometric + device passcode fallback
```

- The Keychain item is **device-bound** (`ThisDeviceOnly`), so even iCloud Keychain doesn't sync it. iCloud sync of the actual ASC key is a security smell we refuse.
- On a new device, the user re-pastes the key. (This is fine — pasting takes 30 seconds and only happens once per device.)
- Biometric prompt fires only when the JWT cache misses (every 18 minutes during active use; immediately on cold launch).

### 6.2 JWT minting

ES256 signing via CryptoKit's `P256.Signing.PrivateKey(pemRepresentation:)`. Cache the signed token for 18 minutes (Apple allows up to 20).

```swift
struct ASCJWT {
    static func mint(credentials: ASCCredentials, ttl: TimeInterval = 18*60) throws -> String {
        let header = ["alg": "ES256", "kid": credentials.keyId, "typ": "JWT"]
        let payload = [
            "iss": credentials.issuerId,
            "iat": Int(Date().timeIntervalSince1970),
            "exp": Int(Date().addingTimeInterval(ttl).timeIntervalSince1970),
            "aud": "appstoreconnect-v1"
        ]
        // base64URL encode + ES256 sign with CryptoKit
    }
}
```

### 6.3 Push proxy security

- All `/v1/devices/register` calls require a `X-Device-Attestation` header containing a DeviceCheck token (free, built into iOS). Prevents spam registrations.
- Webhook callbacks must include the `eventToken` (32 bytes, base64) we registered with ASC. Worker validates this matches the stored eventToken for that Issuer.
- Rate limits at the Worker: 10 registrations/hour per APNs token, 100 webhook fires/hour per Issuer.

### 6.4 What we do NOT collect

- No analytics SDK (no Firebase, no Mixpanel, no PostHog) in V1
- No crash reporting SDK in V1 (TestFlight crash reports + ASC API are enough)
- No third-party fonts, no third-party UI kits

When we add analytics in V1.5+: TelemetryDeck (privacy-first, no PII, EU-hosted) is the locked-in choice.

---

## 7. Push proxy: detailed protocol

### 7.1 Endpoints

```
POST  /v1/devices/register
      Body: { apnsToken, issuerId, appIds: [string], eventToken, bundleId }
      Headers: X-Device-Attestation: <DeviceCheck token>
      Response: 204 No Content

DELETE /v1/devices/register
      Body: { apnsToken, issuerId }
      Response: 204 No Content

POST  /v1/webhook/asc/:issuerId/:eventToken
      Body: ASC webhook payload (verbatim)
      Response: 204 No Content
```

### 7.2 KV schema

```
Key: "device:<apnsToken>:<issuerId>"
Val: { appIds: [string], eventToken, bundleId, lastSeenAt }

Key: "issuer:<issuerId>:devices"
Val: [apnsToken1, apnsToken2, ...]

Key: "issuer:<issuerId>:eventToken"
Val: "<eventToken>"  (the secret used to validate webhook calls)
```

### 7.3 Webhook → APNs flow

```
1. ASC fires webhook to /v1/webhook/asc/:issuerId/:eventToken
2. Worker validates :eventToken matches KV "issuer:<id>:eventToken"
3. Worker parses payload, extracts { appId, eventType, oldState, newState, versionString }
4. Worker fetches device list from KV "issuer:<id>:devices"
5. For each device:
   a. Filter: does this device subscribe to this appId? (check device record)
   b. Build APNs payload:
      {
        "aps": {
          "alert": { "title": "<appName> v<version>", "body": "<oldState> → <newState>" },
          "sound": "default",
          "mutable-content": 1,
          "category": "RELEASE_STATE_CHANGE"
        },
        "rp": {
          "schema": 1,
          "appId": "<id>",
          "newState": "<state>",
          "oldState": "<state>",
          "versionString": "<v>"
        }
      }
   c. POST to APNs HTTP/2 with bundle ID topic and APNs auth JWT
6. Log success/failure to Worker Analytics (no payload retention)
```

### 7.4 Fallback when push fails

- iOS app maintains a "last push received" timestamp per Issuer
- If > 15 minutes since last push AND a version is in an active state, app polls ASC API on next foreground
- Polling state changes also schedule a local notification (no proxy involved)

---

## 8. Notification design

### 8.1 Notification categories

```
RELEASE_STATE_CHANGE
  Actions: [ "view" (default open), "mute_1h" ]

LOW_RATING_REVIEW
  Actions: [ "view" (default open), "reply" (text input) ]

CHECKLIST_FAILED
  Actions: [ "view" (default open) ]
```

### 8.2 Rich notifications

Notification Service Extension downloads the app icon (cached from `App.iconUrl`), attaches as `UNNotificationAttachment`. Falls back to "RP" SF Symbol if download fails (no blank icons ever).

### 8.3 Notification dedup

- Each push includes a `payload.id` (UUID v4 from Worker)
- iOS app stores last 100 IDs; drops duplicates (defensive against APNs duplicate delivery)

---

## 9. Live Activity design

### 9.1 ActivityAttributes

```swift
struct ReleaseStatusAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let state: SemanticState         // enum from Domain
        let stateEnteredAt: Date
        let lastCheckedAt: Date
    }
    let appId: String
    let appName: String
    let appIconUrl: URL
    let versionString: String
    let teamName: String
}
```

### 9.2 Update sources

1. **Push:** Worker sends activity-update push (`liveactivity` flag in payload) to extend the activity with new state.
2. **Local:** When app is in foreground and detects a state change via polling, it calls `activity.update(...)` directly.

### 9.3 Lifecycle

- **Start:** Triggered when version transitions from `PREPARE_FOR_SUBMISSION` to any active state. App registers a push token for this specific Activity via `Activity.pushTokenUpdates`.
- **Update:** Each state change pushes a new ContentState. The `stateEnteredAt` updates only when the state actually changes.
- **End:** When state reaches `READY_FOR_SALE`, `REJECTED`, or `DEVELOPER_REJECTED`, app calls `activity.end(dismissalPolicy: .after(4 hours))`. The user sees the terminal state for 4 hours before it disappears.

### 9.4 Visuals

- Compact (Lock Screen): app icon (24×24) + state badge + "12m"
- Expanded (3D-pressed or in Dynamic Island): app name, full state label, time-since-submission, "View" deep link
- Dynamic Island Minimal: state-color dot
- Dynamic Island Compact (leading): app icon; (trailing): state badge mini
- Dynamic Island Expanded: same as expanded Lock Screen layout but constrained to ~120pt height

State badges use the same `StateBadge` component as the main app, ensuring visual parity.

---

## 10. Widget design

### 10.1 Widget intent (configuration)

`AppIntent`-based config:

```swift
struct ReleaseStatusIntent: AppIntent, WidgetConfigurationIntent {
    @Parameter(title: "App") var selectedApp: AppEntity?
    @Parameter(title: "Show review snippet", default: true) var showReview: Bool
}
```

`AppEntity` is populated from SwiftData (App Group container shared between app and widget).

### 10.2 Timeline strategy

- **Small/Medium:** New entry every 30 minutes OR on push (via `WidgetCenter.shared.reloadAllTimelines()`)
- **Large:** Same as above but with 5 entries per timeline (one per next 30-min slot)
- All entries pull from SwiftData; no network calls from the widget process

### 10.3 Reading SwiftData from the widget

- Widget and App share an App Group: `group.app.releasepilot.shared`
- SwiftData container points to the App Group's container URL
- CloudKit sync writes here too; widget sees updates within 1–2 sync cycles

### 10.4 Deep-linking

Each widget exposes a `widgetURL("releasepilot://app/<appId>")`. The main app handles via `.onOpenURL` → routes to `ReleasesTab → AppDetail`.

---

## 11. Data model (SwiftData)

```swift
@Model
final class Account {
    @Attribute(.unique) var issuerId: String
    var keyId: String
    var p8KeychainRef: String           // pointer; actual key in Keychain
    var teamName: String
    var addedAt: Date
    @Relationship(deleteRule: .cascade, inverse: \App.account) var apps: [App] = []
}

@Model
final class App {
    @Attribute(.unique) var ascId: String
    var bundleId: String
    var name: String
    var iconUrl: URL?
    var lastSeenState: String?
    var lastSeenAt: Date
    var perAppSettings: AppSettings     // codable embedded struct
    @Relationship(deleteRule: .nullify) var account: Account?
    @Relationship(deleteRule: .cascade, inverse: \Version.app) var versions: [Version] = []
    @Relationship(deleteRule: .cascade, inverse: \Review.app) var reviews: [Review] = []
}

@Model
final class Version {
    @Attribute(.unique) var ascId: String
    var versionString: String
    var state: String                   // raw ASC enum
    var buildId: String?
    var lastUpdated: Date
    var timelineJSON: String            // [{state, enteredAt}] encoded
    @Relationship(deleteRule: .nullify) var app: App?
}

@Model
final class Review {
    @Attribute(.unique) var ascId: String
    var rating: Int
    var body: String
    var author: String
    var territory: String
    var versionString: String
    var createdAt: Date
    var response: String?
    var respondedAt: Date?
    var responseSyncState: String       // idle | pending | submitted | failed
    @Relationship(deleteRule: .nullify) var app: App?
}

@Model
final class ChecklistRun {
    @Attribute(.unique) var id: UUID
    var versionAscId: String
    var ranAt: Date
    var resultsJSON: String             // [{checkId, status, reason, fixUrl}]
}

@Model
final class Settings {
    var notificationsEnabled: Bool = true
    var defaultLowRatingThreshold: Int = 2
    var cannedResponsesJSON: String     // [{title, body}]
    var diagnosticsEnabled: Bool = false
}
```

### Why JSON-blob fields (`timelineJSON`, `resultsJSON`)?

SwiftData supports CloudKit only when models are reasonably flat. Nested `@Model` relationships for ephemeral arrays add migration complexity for marginal benefit. JSON blobs keep schema migrations boring.

### Migration policy

V1 ships at schema version 1. Every schema bump after V1 ships a `Schema` migration plan. CloudKit's lightweight migration handles renames; anything destructive requires a `MigrationPlan` and is shipped in a dedicated app version.

---

## 12. The 10 V1 checklist rules — detail

Each rule lives in `Domain/ChecklistRules/<RuleName>.swift`. Common protocol:

```swift
protocol ChecklistRule {
    var id: String { get }
    var title: String { get }
    var helpURL: URL { get }
    func evaluate(context: VersionContext) async -> RuleResult
}

struct RuleResult {
    enum Status { case pass, warn, fail, skipped(reason: String) }
    let status: Status
    let detail: String
    let fixURL: URL?    // deep link to ASC web page
}
```

| ID | Rule | ASC API call | Pass criteria |
|----|------|--------------|----------------|
| `build_attached` | Build attached | `GET /v1/appStoreVersions/{id}?include=build` | `relationships.build.data` is non-null |
| `build_fresh` | Build not expired | (uses build from above) | `build.attributes.uploadedDate` < 90 days ago |
| `export_compliance` | Export Compliance answered | (uses build from above) | `build.attributes.usesNonExemptEncryption` is non-null |
| `screenshots_present` | Screenshot sizes covered | `GET /v1/appStoreVersionLocalizations/{id}/appScreenshotSets` | All currently-required device sizes have ≥1 screenshot |
| `whats_new_present` | "What's New" filled | (uses localizations) | `whatsNew` non-empty for every enabled locale |
| `metadata_complete` | Description / support URL / marketing URL | `GET /v1/apps/{id}/appInfos` | All 3 fields non-empty for primary locale |
| `age_rating_done` | Age rating questionnaire | `GET /v1/apps/{id}/ageRatingDeclarations` | Declaration exists, completed |
| `privacy_manifest` | Privacy details declared | `GET /v1/apps/{id}/appPrivacyDetails` | At least one privacy detail entry exists |
| `testflight_session` | At least one TestFlight test | `GET /v1/builds/{id}/betaBuildLocalizations` | Build has ≥1 beta tester group attached |
| `localizations_complete` | All locales have required fields | (uses localizations) | Every `appStoreVersionLocalization` has name, description, keywords, whatsNew |

### Rule execution

- Run in parallel (10 concurrent ASC API calls is well within rate limits)
- Cache results for 5 minutes (re-running 30 seconds later returns cached)
- "Run All" button on the Checklist tab; per-rule "Re-run" button on the result row

### Adding a rule (V1.5+ tax)

1. New file in `Domain/ChecklistRules/`
2. Add ID to `RuleRegistry.all`
3. Add help URL constant
4. Add unit test with stubbed `VersionContext` for pass + fail cases

---

## 13. Error handling + offline mode

### 13.1 Error taxonomy

```swift
enum RPError: Error {
    case noNetwork
    case ascUnauthorized            // bad credentials → re-onboard
    case ascForbidden               // wrong role → user-actionable message
    case ascRateLimited(retryAfter: TimeInterval)
    case ascServerError(status: Int)
    case ascMalformedResponse(detail: String)
    case keychainUnavailable
    case biometricCancelled
    case proxyUnreachable
}
```

Every error has a user-facing message defined in a single `ErrorMessages.swift` file. No `String(describing:)` shown to users.

### 13.2 Offline mode behavior

- App always launches into SwiftData-backed UI; the network state is irrelevant for the first paint
- Banner appears at top of any tab when `URLSession` reports `.notConnectedToInternet`: "Offline — showing last synced data"
- Pull-to-refresh shows "Can't refresh — you're offline" toast
- Reply-to-review: composed reply is queued (`responseSyncState = pending`); banner shows "1 reply waiting to send"; auto-sends on reconnect
- Checklist: shows last run results with timestamp; "Run again" disabled with reason

### 13.3 Background failure handling

- Push registration failures: silent retry on next foreground; surfaced in Settings → Diagnostics
- Webhook registration failure: surfaced as a banner on the app detail view ("Push not active for this app — taps to fix")

---

## 14. Performance budget

| Surface | Target | Hard ceiling |
|---|---|---|
| Cold launch to first paint | < 300 ms | 700 ms |
| Tab switch | < 50 ms | 100 ms |
| Pull-to-refresh start to spinner visible | < 16 ms | 33 ms |
| Pull-to-refresh ASC API roundtrip (single endpoint) | < 800 ms p50 | 2.5 s p95 |
| Widget timeline build | < 200 ms | 500 ms |
| Live Activity update on push receive | < 1 s end-to-end | 3 s |
| Memory footprint (main app, steady state) | < 80 MB | 150 MB |
| Memory footprint (widget extension) | < 30 MB | 60 MB (system limit) |

Instruments runs before every TestFlight beta build.

---

## 15. Testing strategy

### 15.1 Pyramid

```
                  ┌──────────────────┐
                  │   E2E (manual)   │    ~10 scripted scenarios
                  └──────────────────┘
                ┌──────────────────────┐
                │  Snapshot (UI)       │  ~50 snapshots (widgets + key screens)
                └──────────────────────┘
            ┌──────────────────────────────┐
            │  Integration (mocked ASC)    │  ~40 tests
            └──────────────────────────────┘
        ┌──────────────────────────────────────┐
        │    Unit (Domain + ASCClient parse)   │   ~150 tests
        └──────────────────────────────────────┘
```

### 15.2 Unit tests

- `JWTSigner` — golden-value tests (known input + known key → known JWT)
- `ReleaseStateMachine` — every raw ASC state → semantic state mapping
- Each `ChecklistRule.evaluate(context:)` — pass + warn + fail + skipped cases via stubbed `VersionContext`
- ASC DTO decoding — 1 JSON fixture per endpoint, asserted against expected Swift types

### 15.3 Integration tests

`MockASCClient` returns recorded responses from a real ASC account (Recall's account, scrubbed of sensitive data). Used to test:

- Onboarding → first-fetch path
- Pull-to-refresh diffing logic
- Reply-to-review flow (mocked POST returns 201)
- Checklist run with realistic version data
- Webhook payload decoding

### 15.4 Snapshot tests

`swift-snapshot-testing` (Point-Free's library) for:

- Widget (small/medium/large) × (active state / no apps / error)
- Live Activity (compact / expanded / Dynamic Island variants)
- Empty states for every list view
- State badges for all 7 semantic states

Snapshot tests run on iPhone 16 Pro simulator at 3× scale, light + dark mode.

### 15.5 Manual E2E checklist (run before every TestFlight)

1. Fresh install → onboarding → connect Recall's ASC → see app list
2. Trigger a real submission on a sandbox app → watch Live Activity appear
3. Push notification received within 60s of real ASC state change
4. Reply to a review → verify in ASC web UI
5. Run checklist on a clean draft → 0 false positives
6. Run checklist on a deliberately broken draft → catches the issue
7. Force-quit during onboarding → relaunch → state restored
8. Toggle airplane mode mid-fetch → graceful offline mode
9. Restore purchases on a fresh device with the same Apple ID → trial state correct
10. Family Sharing: paying member → free family member → entitlements correct

---

## 16. Build, CI, and release for Release Pilot itself

### 16.1 Repository

- Single git repo, single Xcode workspace
- `main` is always TestFlight-ready
- Feature branches → PR → merge to `main`
- Tags `v1.0.0`, `v1.0.1`, etc. trigger CI release pipeline

### 16.2 CI (GitHub Actions, free tier sufficient for solo)

```
on push to any branch:
  - swift build (all packages)
  - swift test (Domain, ASCClient, Persistence)
  - xcodebuild -scheme ReleasePilot -destination 'iOS 17 simulator' test

on tag v*:
  - run above
  - xcodebuild archive
  - xcrun altool upload to TestFlight
  - (manual gate before promoting to App Store)
```

### 16.3 Release Pilot ships Release Pilot

This is the dogfood loop. Once v0.1 is on TestFlight, every subsequent build is monitored by the app itself. Bug found = fix tracked in the app.

### 16.4 Versioning

Semantic versioning, but with release-train cadence:

- `1.0.x` — V1 launch + bug fixes (weeks 1–8)
- `1.1.x` — V1 polish + minor adds (weeks 9–14)
- `1.5.x` — V1.5 features (after gate met)
- `2.0.x` — V2 features (after V1.5 gate met)

---

## 17. Telemetry & diagnostics (V1)

### 17.1 What we collect

**Nothing automatic in V1.**

### 17.2 Opt-in diagnostics

Settings → Diagnostics toggle (off by default). When enabled, the app:

- Logs every ASC API call (URL, status, latency) to an in-app rolling buffer (last 200 entries, in-memory only)
- Logs Live Activity start/update/end events
- Logs push notifications received
- Provides a "Share Diagnostics" button that exports the log as a `.txt` file for user to send to support email

No data leaves the device unless the user explicitly shares it.

### 17.3 V1.5+ telemetry plan (not now, planning only)

When we add telemetry, the choice is **TelemetryDeck**:

- EU-hosted, GDPR-friendly
- No PII collection by design
- Free up to 10k signals/month
- Events to track: onboarding completion rate, paywall view → trial start rate, checklist run rate, review reply rate

Add this in V1.5 after V1 product-market fit is confirmed.

---

## 18. App Store submission for Release Pilot itself

### 18.1 Metadata

- **Bundle ID:** `app.releasepilot.ios`
- **Display name:** Release Pilot
- **Subtitle:** "App Store Connect companion"
- **Category:** Developer Tools (primary), Productivity (secondary)
- **Keywords:** asc, app store connect, indie dev, ios, release, testflight, reviews, widget
- **Age rating:** 4+
- **Privacy details:**
  - "Data Not Collected" for everything except optional Diagnostics (which is on-device only and never transmitted)
  - Data linked to user: none
  - Data used to track user: none

### 18.2 Subscription products

```
indie_monthly_999       $9.99/mo   (14-day free trial, eligible for new subscribers)
indie_annual_69         $69/yr     (14-day free trial)
founders_lifetime_studio (V0.5)    $99 one-time (Studio tier permanent; configured at launch via promo codes for pre-sell)
```

### 18.3 Review notes for Apple's app reviewer

Provide:
- A test ASC account (a junk Apple Developer account with a test app)
- Step-by-step: 1) Open app, 2) Paste test credentials (provided), 3) View app list, 4) Tap an app to see release status
- Explanation of why we need ASC API access (this is critical — Apple reviewers may not understand a developer-tool app's need for these scopes)

### 18.4 Anticipated rejection risks

- **Encryption disclosure:** Yes (HTTPS + JWT signing) — declare standard encryption use
- **3.1.1 In-App Purchase:** Subscription must be StoreKit, not external. We are. ✓
- **5.1.1 Data Collection:** We must surface the "we don't collect data" claim accurately. Have privacy policy live before submission.
- **Review responses content moderation:** Apple may worry about us facilitating spam replies. Counter in review notes: "All replies go through ASC's existing review pipeline — same content rules apply."

---

## 19. Open technical decisions (need to lock before Week 1)

1. **iOS minimum version:** iOS 17 (recommended) vs iOS 16.1 (broader reach). Locking in **iOS 17** — Live Activities are smoother, SwiftData is more mature, the cost is leaving behind ~8% of users who haven't upgraded.

2. **SwiftData vs Core Data:** SwiftData (recommended) — newer, less boilerplate, CloudKit-native. Risk: SwiftData has known bugs in iOS 17.0–17.2; we use iOS 17.5+ APIs and pin minimum to iOS 17.4 if bugs bite. **Lock: SwiftData.**

3. **Cloudflare Worker vs Fly.io:** Cloudflare Worker (recommended) — free tier handles 100k req/day, no cold starts, KV is enough for V1. Fly.io would need Postgres + an app — overkill. **Lock: Cloudflare Worker + KV.**

4. **State color palette:** 7 semantic states need 7 distinguishable colors. Constraint: WCAG AA contrast on both light and dark backgrounds. Proposed palette:
   - Drafting → systemGray
   - Submitted → systemBlue
   - In Review → systemYellow
   - Approved → systemGreen (light)
   - Ready for Sale → systemGreen
   - Rejected → systemRed
   - Live → systemMint
   Confirm in UX doc.

5. **Multi-team UX:** Segmented control above app list (recommended) vs. Filter sheet vs. Separate tab per team. **Lock: segmented control above app list (only shown when 2+ teams connected; otherwise hidden).**

6. **Auto webhook registration vs user-instructed:** Auto (recommended) — happens silently on first connect. User-visible only if registration fails. **Lock: auto.**

7. **Canned reply templates:** Ship 10 presets + user-editable. Presets cover: thank-you, bug-acknowledged, fix-in-next-release, please-contact-support, lost-data-help, crash-info-needed, low-rating-apology, feature-noted, language-not-supported-yet, generic-positive-thanks. **Lock: 10 presets + user can add/edit/delete.**

8. **App icon design direction:** Three candidates to mock up before Week 1:
   - Flight-strip aesthetic (yellow/black tower marshalling stripes — matches "Pilot" naming)
   - Cockpit window (radar-screen feel)
   - Minimal "RP" monogram in SF Pro
   **Decision deferred to Week 6 polish; placeholder icon until then.**

---

## 20. Risk register (technical)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ASC API changes break the client | Medium | High | Vendor the API client; pin DTO shapes; integration tests against recorded fixtures |
| Cloudflare KV consistency lag (eventual consistency) | Low | Medium | Webhook validation reads KV; if cold, treat as authorization failure → ASC will retry the webhook |
| APNs delivery delay > 60s | Medium | Medium | 15-min poll fallback; never claim "real-time" in marketing |
| SwiftData + CloudKit sync bugs | Medium | High | Aggressive snapshot tests; opt-in toggle to disable CloudKit sync if buggy |
| Live Activity dismissed by iOS before terminal state | Low | Low | Polled local state; can re-create activity if state still active |
| ASC webhooks unreliable (anecdotal reports in dev community) | Medium | High | 15-min poll fallback; auto-degrade gracefully without alerting user every time |
| Apple ships ASC.app refresh with Live Activities | Medium | Critical | Stay 12–18 months ahead; double down on cross-account, AI replies, sentiment trends (V1.5+) |
| User's Cloudflare Worker secret leaks | Low | Critical | Rotate quarterly; eventToken validation ensures leak alone can't spoof pushes |
| StoreKit 2 sandbox tests pass but production fails | Low | High | Buy a fresh production sub on day 1; test restore on a second device |

---

## 21. Definition of "tech design complete"

This document is complete when:

- [ ] All 21 sections reviewed by Senthil
- [ ] All 8 open technical decisions in §19 are locked (or explicitly deferred with date)
- [ ] UX flow doc (`RELEASE_PILOT_V1_UX_FLOW.md`) cross-referenced for any UI claims here
- [ ] No section says "TBD" without a follow-up owner + date

After this doc is signed off:

1. Generate Xcode project skeleton matching §3
2. Stand up Worker repo + deploy to dev environment
3. Begin Week 1 (Foundation + ASC API)

---

## 22. Glossary

| Term | Meaning |
|------|---------|
| ASC | App Store Connect |
| APNs | Apple Push Notification service |
| JWT | JSON Web Token (used to auth ASC API calls) |
| `eventToken` | Random 32-byte secret per (device, issuer); validates webhook authenticity |
| `Issuer ID` | The GUID identifying a developer team in ASC |
| `Key ID` | The 10-char ID identifying a specific API key in ASC |
| `p8` | The Elliptic Curve private key file downloaded from ASC; used to sign JWTs |
| Live Activity | iOS feature surfacing dynamic content on Lock Screen + Dynamic Island |
| Worker | Cloudflare Workers — serverless runtime running our push proxy |
| KV | Cloudflare Workers KV — key-value store (eventual consistency, 60s read replication) |
| Semantic State | Our 7-state simplification of ASC's 25+ raw enum strings |
