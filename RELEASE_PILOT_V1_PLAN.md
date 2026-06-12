# Release Pilot — V1 Plan

> Status: Draft — pending your review before build starts
> Target ship: 5–6 weeks of solo work (after validation gate is met)
> Umbrella plan: `~/.cursor/plans/release_pilot_ios_companion_e2f2c22f.plan.md`

## 1. Goal

Ship a focused, paid iOS app that becomes the iPhone home-screen layer for an indie iOS developer's App Store release workflow. V1 must justify a $9.99/mo subscription on day one through three things only: **release status that lives on the Lock Screen**, **mobile review reading + replying**, and **a pre-submission checklist that catches the top 10 mechanical rejections**.

Everything else is V1.5 or V2.

## 2. Target user (sharp persona)

- Solo indie iOS / Mac developer running 1–6 active apps in App Store Connect
- Ships 4–24 releases/year across the portfolio
- Already uses CLI tools (`asc`, `appctl`, or Fastlane) for the actual submission
- Lives in App Store Connect's web UI for everything else and dislikes it
- Already pays $40–$100/mo for the indie tool stack (RevenueCat, Plausible, AppFollow-or-similar, screenshot tool, etc.)
- Active in the indie iOS dev community on Twitter/X, IndieHackers, r/iOSProgramming, BlueSky

You are this persona.

## 3. Definition of Done for V1

V1 is complete when **all** of these are true:

- The user can paste a single ASC API key and see all their apps within 30 seconds of onboarding
- A Lock Screen Live Activity appears automatically when any of their versions enters a non-terminal state (`PREPARE_FOR_SUBMISSION` through `PENDING_DEVELOPER_RELEASE`)
- A push notification fires within 60 seconds of an ASC version-state change (validated against `IN_REVIEW` → `READY_FOR_SALE` transition)
- The user can read, filter, and reply to App Store reviews from their iPhone without opening App Store Connect
- The pre-submit checklist runs against the ASC API and surfaces at least 10 distinct kinds of mechanical rejection-causes before submission
- A user can start a 14-day Indie trial, convert to paid via StoreKit 2, and have the paywall behave correctly across reinstalls and family sharing
- The app passes Apple's own App Store review (we use Release Pilot to ship Release Pilot)

## 4. Feature scope (numbered, with acceptance criteria)

### 4.1 ASC API authentication & multi-team support

- User generates a p8 key in ASC (Admin or App Manager role)
- User pastes Key ID, Issuer ID, and p8 contents into the app once
- App stores all three in Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` and biometric-locked access
- App mints a fresh ES256-signed JWT on-device every 18 minutes (Apple's tokens last 20)
- User can add multiple Apple Developer accounts (Issuer IDs); UI switches "current team" via segmented control on the app list

**Acceptance:** User with 2 Apple Developer teams sees all apps from both teams in one merged list, with team-badge on each app row.

### 4.2 App library + per-app settings

- On first connect, fetch list of all apps via `GET /v1/apps`
- Display icon, name, bundle ID, current top version state
- Tap an app → app detail (Release Status + Reviews tabs)
- Per-app settings: push notifications on/off, low-rating alert threshold (default: notify on new ≤2-star review)
- SwiftData persisted locally, CloudKit synced across the user's iPhone + iPad

**Acceptance:** Adding an app on iPhone shows it on iPad within 30 seconds.

### 4.3 Release Status detail view

- Shows currently active version, state, time-in-state, time-since-submission
- Timeline: list of state transitions (build uploaded → submitted → in review → …) with timestamps
- Each transition pulled from `GET /v1/appStoreVersions/{id}` and stored locally
- Pull-to-refresh hits the ASC API directly (manual override of push-driven state)
- "Show previous versions" expansion view shows the last 5 versions of the app with their states

**Acceptance:** A version that just went to `IN_REVIEW` shows "In Review · 2 minutes" within 30 seconds of a pull-to-refresh, and the timeline shows the prior state.

### 4.4 Live Activity for active release

- Auto-starts when any version enters a non-terminal state
- Auto-ends when version reaches `READY_FOR_SALE`, `REJECTED`, or `DEVELOPER_REJECTED`
- Compact UI: app icon + state badge + time-in-state
- Expanded UI: app name, state, time-since-submission, "View" deep link
- Dynamic Island: compact + minimal + expanded variants
- ActivityKit content updates pushed via APNs (no polling in the background)

**Acceptance:** Submitting a build and waiting for it to transition to `IN_REVIEW` shows the state change in the Live Activity within 60 seconds of the actual ASC state change (assuming push proxy is healthy).

### 4.5 Lock Screen + Home Screen widgets

- Three sizes: small, medium, large
- Small: single-app icon + state badge + minutes elapsed
- Medium: app name + state + time elapsed + latest review snippet
- Large: 2-app status grid + 1 latest review row
- WidgetKit timeline entries refreshed by push and every 30 min by `WidgetCenter.shared.reloadAllTimelines()`
- Widget configuration intent: pick which app(s) to show

**Acceptance:** A user with 2 active versions can show both in a large widget; tapping a widget deep-links to that app's detail view.

### 4.6 Push notifications on state change

- User opts in to push on first onboarding screen
- Per-app toggle in settings (default ON)
- Rich notification: app icon, "Release Pilot — Recall v2.0", "Status changed to In Review"
- Notification actions: `View` (deep link), `Mute for 1 hour` (suppress next push for this app)
- Source: ASC webhook → push proxy (see §7)

**Acceptance:** A version state change from `WAITING_FOR_REVIEW` to `IN_REVIEW` results in a push within 60 seconds, end-to-end, including richness.

### 4.7 Mobile Review reader + replier

- List of reviews per app, sorted by date desc
- Filter by rating (1-5), filter by version (current vs older)
- Detail view: rating, body, author, version, territory, created date
- Reply textbox with 5,970-char limit (ASC API limit)
- Send → `POST /v1/customerReviewResponses`
- Reply persisted locally with `pendingSubmit` / `submitted` state for offline-resilient retries
- Canned response templates: store 5–20 templates locally; pick one to pre-fill the reply box
- Notification on new ≤2-star review (driven by polling every 15 minutes when app is alive + per-app webhook on the proxy)

**Acceptance:** Replying to a real review from the app shows the response in ASC web UI within 30 seconds, and the local list shows "Replied" with timestamp.

### 4.8 Pre-Submit Checklist

Runs against ASC API for the currently selected app's draft version. Each check has: status (pass / warn / fail / skipped), reason, and a deep link to the relevant ASC web page to fix.

The 10 V1 checks:

1. **Build attached** — version has a `relationships.build` association
2. **Build not expired** — build uploaded date < 90 days ago
3. **Export Compliance answered** — build's `usesNonExemptEncryption` is not null
4. **Required screenshot sizes present** — all currently-required device sizes have at least one screenshot (6.5", 6.7" iPhone; 12.9" iPad if iPad app)
5. **"What's New" present** — `releaseNotes` field is non-empty for every enabled locale
6. **Description, support URL, marketing URL set** — basic app metadata complete
7. **Age rating questionnaire completed** — `ageRatingDeclaration` exists
8. **Privacy manifest declared** — `privacyChoicesUrl` or app privacy details (`appPrivacyDetails`) declared in this version
9. **At least one TestFlight test session** — version's build has at least one beta test event
10. **All localizations have required fields** — each `appStoreVersionLocalization` has name + description + keywords + whatsNew

**Acceptance:** Running the checklist on a real draft version surfaces ≥1 actionable warning and produces 0 false positives on a known-clean version.

### 4.9 StoreKit 2 subscriptions

- Free: 1 app, basic widget, push notifications, read-only reviews, checklist runs limited to 3 per week
- Indie: $9.99/mo or $69/yr — up to 3 apps, all widgets, review replies, unlimited checklist runs, daily briefing (placeholder for V1.5)
- 14-day free trial of Indie tier; auto-converts unless cancelled
- Restore purchases button
- Family sharing enabled
- Manage subscription deep link
- Paywall surfaces at: adding 2nd app, replying to a review, running checklist for 4th time in a week

**Acceptance:** A fresh install can start a trial, hit the paywall after free tier limits, restore purchases on reinstall, and behave correctly with family sharing across two devices.

### 4.10 Onboarding flow

1. Welcome / 3-screen value prop carousel
2. "Connect your App Store Connect account" — explainer for what a p8 key is
3. Inline screenshots of where to find Issuer ID, Key ID, and how to download p8 in the ASC web UI
4. Paste credentials → verify connection (calls `GET /v1/apps`)
5. Enable push notifications (system prompt + per-app toggle)
6. "Add Lock Screen widget" walkthrough
7. Start free trial CTA

**Acceptance:** First-time user completes onboarding in under 4 minutes and sees their app list before reaching the home screen.

## 5. Out of scope for V1 (explicit)

These are V1.5 / V2 and are NOT to be built in V1, no matter how tempting:

- Daily Morning Briefing widget (yesterday MRR / installs / crashes)
- RevenueCat / Stripe integration for MRR
- Apple Watch app or complications
- TestFlight feedback inbox
- Review sentiment trending / clustering
- AI release notes generator
- Multi-locale review translation
- Crash log triage
- Per-release retrospective views
- Screenshot generation (we link out to ButterKit / ListingShots)
- ASO keyword tracking (we link out to AppTweak / AppFollow)
- Full submission workflow / build upload (we link out to `asc` / `appctl` CLI)
- Team / multi-user features (we are solo-dev focused)
- Android Play Console parity

## 6. Tech architecture

- **Platform:** iOS 17+ (Live Activities require iOS 16.1+ but newer APIs are smoother on iOS 17+)
- **UI:** SwiftUI, Swift 6, strict concurrency
- **Persistence:** SwiftData locally; CloudKit for cross-device sync
- **Subscriptions:** StoreKit 2
- **Live Activities:** ActivityKit + APNs push updates
- **Widgets:** WidgetKit (Lock Screen + Home Screen)
- **Notifications:** UserNotifications framework
- **Credentials:** Keychain Services with biometric unlock
- **Network:** URLSession + async/await; custom JWT minter (CryptoKit ES256 signing)
- **Backend:** Cloudflare Worker + KV (push proxy only; no user DB)
- **No analytics SDK in V1** — TelemetryDeck or PostHog can wait

## 7. Push proxy architecture

```
ASC Webhook  →  Cloudflare Worker  →  KV lookup  →  APNs HTTP/2  →  iPhone
```

- Single Cloudflare Worker, free tier, ~200 LOC
- Worker URL: `https://api.releasepilot.app/v1/webhook/asc/{issuerId}/{eventToken}`
- User-side: app POSTs `{deviceToken, issuerId, appIds, eventToken}` to `/v1/devices/register`
- Worker stores `issuerId → [{deviceToken, eventToken, appIds, apnsTopic}]` in KV
- On webhook fire, Worker queries KV by issuerId, sends APNs push to each matching device
- APNs auth: Apple Push certificate (renewed yearly); stored as Worker secret
- ASC webhook registration: app calls `POST /v1/webhooks` on the user's behalf at first-connect, persisting the webhook ID locally so we can clean it up if the user disconnects

**No user database needed.** Issuer ID is the identity. KV is leased-storage; if it goes down, we fall back to polling every 15 min.

## 8. Data model

```
Account
  id (uuid)
  issuerId (string, unique)
  keyId (string)
  p8KeychainRef (string)
  teamName (string)
  addedAt (date)

App
  id (string, ASC app id)
  accountId (FK Account)
  bundleId, name, iconUrl
  lastSeenState (string)
  lastSeenAt (date)
  perAppSettings (json)

Version
  id (string, ASC version id)
  appId (FK App)
  versionString, state, buildId
  lastUpdated (date)
  timeline (json array of {state, enteredAt})

Review
  id (string, ASC review id)
  appId (FK App)
  rating (int), body, author, territory, version (string)
  createdAt
  response (string?), respondedAt (date?)
  responseSyncState (enum: idle | pending | submitted | failed)

ChecklistRun
  id (uuid)
  versionId (FK Version)
  ranAt (date)
  results (json array of {checkId, status, reason, fixUrl})

Settings (singleton)
  notificationsEnabled (bool)
  defaultLowRatingThreshold (int = 2)
  cannedResponses (json array)
```

## 9. ASC API surface used in V1

- `POST /v1/apps` (well, `GET` — list apps)
- `GET /v1/apps/{id}/appStoreVersions`
- `GET /v1/appStoreVersions/{id}` (state)
- `GET /v1/apps/{id}/customerReviews`
- `POST /v1/customerReviewResponses`
- `GET /v1/builds`
- `GET /v1/preReleaseVersions`
- `GET /v1/apps/{id}/appStoreVersionLocalizations`
- `GET /v1/apps/{id}/appInfos`
- `POST /v1/webhooks` (register), `DELETE /v1/webhooks/{id}` (unregister)
- `GET /v1/ageRatingDeclarations/{id}`
- `GET /v1/appStoreVersions/{id}/build`
- `GET /v1/appStoreVersionSubmissions/{id}` (submission state)

Rate-limit awareness: ASC API is rate-limited; cache aggressively (5-min TTL for non-state-critical reads).

## 10. Pre-build validation gate (DO THIS BEFORE WRITING iOS CODE)

This is the most important section. Do not start building until all are met.

1. **Weekend prototype** — build a Mac CLI or Swift Playground that auths to your real ASC account (for Recall) and walks through: list apps, list versions, list reviews, reply to a review, list builds, hit `/webhooks`. Goal: verify nothing is undocumented or broken.
2. **5 indie iOS dev interviews** — DM 10 indie iOS devs on Twitter/X (target: people with 5k–50k followers actively shipping). Offer 20-min Zoom. Ask: "What do you actually do during the 7–30 day review wait? What review-on-mobile pain do you have?" Aim for 5 calls in 1 week.
3. **Landing page** — Carrd or Framer; 1-screen, value prop, email capture. Goal: 100 signups in 2 weeks from indie dev community posts.
4. **Pre-sell Founders Lifetime Studio** at $99 one-time to the first 50 wait-list members. Build is greenlit only if **20+ sales** in the pre-sell window.
5. **Decide product name** — Release Pilot, Pilot, Skipper, Liftoff, Hangar, Lighthouse, ReleaseRadar. Verify App Store name + `.com` availability before landing page goes live.

**Gate:** ≥100 wait-list emails AND ≥20 Founders pre-sales → start building. Otherwise, pivot or kill.

## 11. Build sequence (week-by-week)

### Week 1 — Foundation + ASC API
- Xcode project, SwiftUI scaffold, navigation
- Onboarding flow (basic — copy can be improved later)
- ASC API auth flow + JWT minting (CryptoKit)
- Keychain credential storage with biometric lock
- App list fetch + display
- SwiftData models for Account / App / Version / Review / ChecklistRun
- CloudKit container configured

### Week 2 — Release Status + Reviews (the core consumer surfaces)
- Version state polling
- Release Status detail view + timeline
- Pull-to-refresh
- Reviews list with filter + sort
- Review detail view
- Reply UI + ASC API integration
- Canned response templates

### Week 3 — Live Activity + Widgets
- ActivityKit Live Activity (compact + Dynamic Island variants)
- WidgetKit widgets (small / medium / large)
- Widget configuration intents
- Deep-link routing from widgets and Live Activity into the app

### Week 4 — Push proxy + Notifications
- Cloudflare Worker setup + deploy
- KV schema + device registration endpoint
- APNs HTTP/2 send path
- Webhook receiver + transform to APNs payload
- iOS side: device-token capture + register-with-proxy on first launch
- Rich notification UI + notification actions

### Week 5 — Pre-Submit Checklist + StoreKit
- Checklist rules engine (each rule is one ASC API call + decision logic)
- All 10 checks implemented
- Checklist UI with status badges + fix links
- StoreKit 2 product configuration (Free / Indie monthly + annual)
- Paywall view + entry points
- 14-day free trial flow
- Restore purchases + family sharing tests

### Week 6 — Polish + TestFlight beta
- Settings screens
- Error handling + offline mode
- Multi-app switcher polish
- App icon + launch screen finalized
- Privacy policy + terms (live URLs)
- TestFlight beta with the 50 Founders for 10–14 days
- Bug fix pass from beta feedback

## 12. Testing strategy

- **Unit tests** on the JWT minter, checklist rules engine, and ASC API response parsing
- **Snapshot tests** on widget + Live Activity rendering (multiple sizes, dark/light)
- **Integration tests** against a mocked ASC server (vapor-test or local Swift server stub)
- **Manual E2E** on a sandbox app in App Store Connect — full lifecycle: submit → review → ready for sale
- **TestFlight beta** with Founders, structured feedback form linked from in-app menu

## 13. App Store submission for Release Pilot itself

Yes — we use Release Pilot to ship Release Pilot, as the most credible possible dogfood.

- Bundle ID: `app.releasepilot.ios` (or whatever the locked-in name dictates)
- Icon: simple, memorable; black/yellow flight-strip aesthetic is one direction
- Screenshots: 8 device sizes via ButterKit (we eat what we sell — link to ButterKit on our landing page as a friendly competitor we recommend)
- Subscription products configured in ASC: `indie_monthly_999`, `indie_annual_69`
- Privacy details (App Privacy section): user-provided ASC keys are stored locally, device tokens transmitted to push proxy, no other PII
- Review notes: explain the ASC API integration to the reviewer; provide a test ASC account
- Allow 7–14 days for review

## 14. Launch plan (when V1 ships)

Day 0 = App Store approval

- **Day -14:** TestFlight live, Founders onboarded, start collecting testimonials
- **Day -7:** Press kit live on landing page (screenshots, video demo, fact sheet, founder bio)
- **Day -3:** Email Founders + wait-list with launch date and 50%-off-first-year code
- **Day 0 (morning ET):**
  - Show HN post (best between 8–10am ET on a Tue/Wed)
  - IndieHackers "Show IH" post
  - r/iOSProgramming post
  - Twitter/X thread (your account + tag 10 indie iOS devs you've spoken with)
  - BlueSky #iOSDev post
- **Day 0–7:** Reply to every comment, every email, every DM
- **Day +7:** Reach out to indie iOS dev podcasts (Under the Radar, Sketchnote, Stacktrace) with traction numbers

## 15. Success metrics for V1

- **Pre-build gate:** 100+ wait-list emails AND 20+ Founders Lifetime sales
- **Beta:** 80%+ Founders retention after 14 days; ≥4.3/5 average satisfaction
- **Trial conversion:** 30%+ trial-to-paid in first 30 days
- **First 60 days post-launch:** 50+ paying subscribers
- **App Store rating:** 4.5+ average

If these aren't hit, V1.5 doesn't happen — we either iterate V1 or sunset.

## 16. Open decisions (need answers before/during build)

1. **Product name** — locked before Week 1 starts
2. **iOS minimum version** — recommendation: iOS 17; confirm before Week 1
3. **Push proxy infrastructure** — Cloudflare Workers + KV (lean) vs Fly.io + Postgres (more standard). Recommendation: Cloudflare. Confirm.
4. **Multi-team account UX** — segmented control vs. team-switcher modal. Recommendation: segmented control on top of app list.
5. **ASC webhook registration** — auto vs. user-instructed. Recommendation: auto via API on first-connect; document that we'll auto-clean if user disconnects.
6. **Privacy manifest check** — true ASC API support is sparse; fallback is a manual checkbox in the checklist with an info link. Confirm acceptance.
7. **Canned response templates** — preset library vs. user-only. Recommendation: ship 10 presets (greetings, common bug-fix-in-progress, thanks for the bug report) + user can edit/add.
8. **Pricing locale handling** — App Store auto-converts $9.99 to local equivalents. Confirm we accept Apple's tier system rather than custom per-country pricing.

## 17. Risk register

- **Apple ships a better Connect iOS app** — counter: stay 12–18 months ahead on Lock Screen / Live Activity / Watch surface
- **ASC API rate limits in real workflow** — counter: cache aggressively, push-driven invalidation, not polling-driven
- **Webhook flakiness** — counter: 15-min poll fallback when push hasn't arrived in expected window
- **Devflair or Stora.sh ship a mobile companion** — counter: iOS-platform-only features are our moat; refuse to build a cross-platform anything in V1
- **Pre-sell gate fails** — counter: kill or pivot before sinking 6 weeks of build time
