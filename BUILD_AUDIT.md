# Release Pilot — Pre-Production Build Audit

> **Purpose:** Reusable pre-flight checklist + diagnostic findings for every `eas build --profile production --platform ios` run.
> Run through this **before** kicking off the EAS prod build. Each section has a current-status snapshot below the template.

**Last audit:** Jun 12, 2026 · re-audit before Build 3 (post-ITMS-90894)
**Audit owner:** Senthil
**App:** Release Pilot (`app.releasepilot.ios`)

---

## Build 3 — what changed and why

After Build 2 was accepted by Apple with a single ITMS-90894 warning, a **deeper orphan-config audit** was performed. The original audit verified internal consistency (entitlement A in file X also appears in file Y) but did not cross-reference each value against actual code usage. **That's the gap that let ITMS-90894 slip through.**

The deeper audit found **four orphan config values** (declared in `app.json` but never referenced by any code path):

| Removed in Build 3 | Why |
|---|---|
| `com.apple.developer.usernotifications.communication` entitlement | Caused ITMS-90894 (Apple's validator) — only valid for chat/call apps |
| `BGTaskSchedulerPermittedIdentifiers` → `app.releasepilot.refresh` | No `TaskManager.defineTask("app.releasepilot.refresh", ...)` call exists |
| `UIBackgroundModes` → `processing` | No `BGProcessingTaskRequest` submission exists |
| `LSApplicationQueriesSchemes` → `mailto`, `https` | No `Linking.canOpenURL(...)` calls exist (only `Linking.openURL`, which doesn't require declaration) |

Only ITMS-90894 was strictly necessary to fix — Apple's automated validator did not flag the other three. They were removed defensively to make the audit pattern bulletproof going forward.

The `BUILD_AUDIT.md` checklist (section "Privacy + Info.plist", "Orphan-config check") was updated to make this cross-reference mandatory on every future audit.

**ITMS rules that COULD have been triggered but weren't (verified against the Build 2 IPA Apple already validated):**
- ITMS-90713 (missing app privacy manifest) → ✅ `PrivacyInfo.xcprivacy` present with 4 API reasons + tracking flag
- ITMS-91065 / ITMS-91068 (third-party SDK manifest / signature) → ✅ RC, PurchasesHybridCommon, ReachabilitySwift, React-Core, all Expo modules ship privacy bundles
- ITMS-90683 (missing usage description) → ✅ Only Face ID is requested, and it's declared
- ITMS-90049 / ITMS-90107 (bundle ID / provisioning mismatch) → ✅ Build 2 accepted
- ITMS-90186 (build number reuse) → ✅ EAS auto-increment is on
- Export compliance prompt → ✅ `ITSAppUsesNonExemptEncryption: false` is correct (JWT + TLS are exempt)

---

## TL;DR — Current state

| Area | Status | Action |
|---|---|---|
| Code quality (lint / typecheck / tests / cli-verify) | ✅ **GREEN** | Zero errors, zero warnings, 18/18 test files pass |
| Native config (app.json / eas.json / targets / modules) | ✅ **GREEN** | All bundle IDs, app groups, entitlements consistent |
| In-app code references | 🟡 **YELLOW** | Hardcoded `releasepilot.app` URL in paywall — will 404 |
| Worker / push infrastructure | 🔴 **RED** | Worker NOT deployed; URL doesn't resolve; push won't work in prod |
| Hosted URLs (privacy / support / marketing) | 🔴 **RED** | `releasepilot.app` DNS doesn't exist; ASC will reject |
| Asset hygiene | 🟡 **YELLOW** | Unused Expo template defaults in `assets/images/`; icon is 983 KB |

**You can RUN the build** — it will succeed. But you **cannot submit to App Store** until the RED items are resolved.

---

## 🔴 BLOCKERS — must fix before ASC submission

### 1. `releasepilot.app` domain doesn't exist (DNS)

**Where it's referenced:**

| File | Line | Reference |
|---|---|---|
| `app/src/app/paywall.tsx` | 73 | `const PRIVACY_URL = 'https://releasepilot.app/privacy';` |
| `app-store/REVIEW_NOTES.md` | 134 | Privacy URL for Apple's reviewer |
| `app-store/LISTING.md` | 218, 226-228 | Privacy/Support/Marketing URLs for ASC submission |
| `app-store/SUBMISSION_CHECKLIST.md` | 16, 20 | Pre-flight check |
| `app/modules/*/podspec` | 11 (×3) | Cosmetic homepage in podspecs (low impact) |
| `docs/index.html` | 13 | og:url tag |
| `README.md` | 5, 11 | Project links |

**Two fix paths (pick one):**

**Path A — Buy the domain (~30 min + DNS propagation):**
1. Buy `releasepilot.app` (Cloudflare Registrar = $12/yr, free privacy)
2. Cloudflare DNS → add CNAME `releasepilot.app` → `senthilmkm.github.io`
3. In `senthilmkm/release-pilot` repo: **Settings → Pages → Custom domain** = `releasepilot.app`
4. Wait for HTTPS cert to provision (15-60 min)
5. Verify: `curl -I https://releasepilot.app/privacy.html` returns `200`
6. No code change needed

**Path B — Use GitHub Pages URL directly (5 min):**
1. Change `paywall.tsx:73` → `'https://senthilmkm.github.io/release-pilot/privacy.html'`
2. Update ASC submission form to use the GitHub Pages URLs
3. Update `REVIEW_NOTES.md` and `LISTING.md` references
4. No DNS / cost. URL is ugly but works

> **Recommendation: Path B for v1.0** — ship fast, swap to custom domain post-launch via a metadata-only update (no resubmit needed).

---

### 2. Cloudflare Worker is not deployed

**Symptoms:**

| Check | Result |
|---|---|
| DNS lookup `release-pilot.workers.dev` | ❌ Does not resolve |
| `worker/wrangler.toml` line 16 | `database_id = "REPLACE_AFTER_DB_CREATE"` |
| Push notifications in prod | ❌ Would silently fail in `worker-client.ts` |

**Impact:**
- Pro users sign up expecting push notifications (your #1 differentiator vs Apple's free ASC app) → **they get nothing**
- App Store reviewer enables push, never gets any notification → **rejection risk** for "feature doesn't work as advertised"

**Fix (one-time, ~20 min):**
```bash
cd worker
wrangler login
wrangler d1 create release-pilot      # paste the id into wrangler.toml
wrangler d1 execute release-pilot --file=src/storage/d1-schema.sql

wrangler secret put APNS_TEAM_ID         # 2KJK6895B3
wrangler secret put APNS_KEY_ID          # from ASC → APNs auth key
wrangler secret put APNS_KEY_P8          # paste .p8 PEM contents
wrangler secret put APNS_BUNDLE_ID       # app.releasepilot.ios
wrangler secret put CREDS_MASTER_KEY_B64 # 32 random bytes base64

wrangler deploy
```

Then verify: `curl -I https://release-pilot.<YOUR_CF_ACCOUNT>.workers.dev` returns 200. Update `app.json` extras.workerUrl if the worker URL differs from `release-pilot.workers.dev`.

---

## 🟡 YELLOW — fix before submission ideally, but won't block build

### 3. Asset hygiene

**Findings:**

| File | Size | Status |
|---|---|---|
| `assets/icon.png` | 983 KB | ⚠️ Large but within iOS bundle limits. Optimize with `pngquant` to ~150 KB |
| `assets/splash-icon.png` | 637 KB | ⚠️ Same — optimize |
| `assets/images/react-logo*.png` (×3) | ~40 KB total | 🗑️ Expo template default — not referenced anywhere, safe to delete |
| `assets/images/tutorial-web.png` | 57 KB | 🗑️ Template default |
| `assets/images/expo-badge*.png`, `expo-logo.png` | ~11 KB total | 🗑️ Template defaults |
| `assets/images/icon.png` | 780 KB | 🗑️ Duplicate (app.json points to `./assets/icon.png` at root) |

**Action:**
```bash
cd app/assets/images
rm react-logo.png react-logo@2x.png react-logo@3x.png
rm tutorial-web.png expo-badge.png expo-badge-white.png expo-logo.png
rm icon.png  # the duplicate one in images/ subfolder
```

Bundle size win: ~1 MB smaller `.ipa`. Won't affect functionality.

### 4. Icon PNG optimization (optional but recommended)

```bash
# Install pngquant: brew install pngquant (macOS) | choco install pngquant (Win)
pngquant --quality=65-90 --skip-if-larger assets/icon.png --output assets/icon.png --force
pngquant --quality=65-90 --skip-if-larger assets/splash-icon.png --output assets/splash-icon.png --force
```

Typically cuts icon to 100-200 KB without visible loss.

---

## ✅ GREEN — verified clean

### Code quality

| Check | Command | Result |
|---|---|---|
| TypeScript typecheck | `npm run typecheck` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Unit tests | `npm test` | ✅ 18/18 files passing (100+ assertions) |
| End-to-end CLI verify | `npm run verify:cli` | ✅ All 8 phases + 14 RC checks |
| `console.log` in production code | grep | ✅ Only inside `if (__DEV__)` guards |
| TODO/FIXME/XXX/HACK | grep `src/` | ✅ 0 occurrences |

### Native configuration consistency

| Check | Source of truth | Other places | Status |
|---|---|---|---|
| Apple Team ID | `app.json` → `2KJK6895B3` | `eas.json` submit block → `2KJK6895B3` | ✅ Match |
| Main bundle ID | `app.json` → `app.releasepilot.ios` | `eas.json` submit `ascAppId: 6779403942` | ✅ Match |
| Widget bundle ID | `app.json` extra → `app.releasepilot.ios.widget` | `targets/widget/expo-target.config.js` name `ReleasePilotWidget` | ✅ Match |
| Notification Service bundle ID | `app.json` extra → `app.releasepilot.ios.notification-service` | `targets/notif-service/expo-target.config.js` name `ReleasePilotNotificationService` | ✅ Match |
| App Group | `group.app.releasepilot.shared` | Same value in main app entitlements + widget + notif-service entitlements | ✅ Match (3 places) |
| iOS deployment target | `app.json` → `17.0` (via expo-build-properties plugin) | `targets/widget` → `17.0`, `targets/notif-service` → `17.0` | ✅ Match |
| Scheme | `app.json` → `releasepilot` | Used by deep links in app | ✅ Match |

### iOS entitlements + Info.plist

| Required for | Value | Status |
|---|---|---|
| `aps-environment` | `production` (in `app.json`) | ✅ Correct for prod |
| `com.apple.security.application-groups` | `[group.app.releasepilot.shared]` | ✅ Present |
| ~~`com.apple.developer.usernotifications.communication`~~ | REMOVED in Build 3 | Was triggering ITMS-90894 warning — only required for chat/call apps that send Communication Notifications. Release Pilot sends regular state-change pushes, so this entitlement is wrong. Removed. |
| `NSFaceIDUsageDescription` | "Release Pilot uses Face ID to protect your App Store Connect API key." | ✅ Present |
| `NSSupportsLiveActivities` | `true` | ✅ Present |
| `NSSupportsLiveActivitiesFrequentUpdates` | `true` | ✅ Present |
| `UIBackgroundModes` | `['fetch', 'remote-notification']` (Build 3 trimmed `processing` — not used; BGProcessingTask is never submitted) | ✅ Verified against code |
| `BGTaskSchedulerPermittedIdentifiers` | `['app.releasepilot.poll']` (Build 3 trimmed `.refresh` — never registered via `TaskManager.defineTask`) | ✅ Verified against code (`background-poll.ts:32,44`) |
| `ITSAppUsesNonExemptEncryption` | `false` | ✅ Correct — only TLS + JWT auth (both exempt under Category 5A.992.a) |
| ~~`LSApplicationQueriesSchemes`~~ | REMOVED in Build 3 — no `Linking.canOpenURL(...)` call exists for `mailto:` or `https:`. `Linking.openURL` doesn't need this declaration. | ✅ Removed (cruft) |

### Privacy manifests (required since iOS 17)

`NSPrivacyAccessedAPITypes` — declared for every API category your app touches:

| Category | Reason code | Why |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | MMKV-backed Zustand stores |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | SQLite cache + Expo Updates |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1` | SQLite cache size checks |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | MMKV + RC SDK internals |

✅ All 4 declared with valid Apple reason codes.

### Plugins ↔ Dependencies parity

Every plugin in `app.json` → `plugins[]` has a matching dependency:

| Plugin | Dependency | Status |
|---|---|---|
| `expo-router` | `expo-router@~56.2.10` | ✅ |
| `expo-splash-screen` | `expo-splash-screen@~56.0.10` | ✅ |
| `expo-local-authentication` | `expo-local-authentication@~56.0.4` | ✅ |
| `expo-notifications` | `expo-notifications@~56.0.17` | ✅ |
| `expo-build-properties` | `expo-build-properties@~56.0.18` | ✅ |
| `expo-secure-store` | `expo-secure-store@~56.0.4` | ✅ |
| `expo-sqlite` | `expo-sqlite@~56.0.5` | ✅ |
| `expo-web-browser` | `expo-web-browser@~56.0.5` | ✅ |
| `@bacons/apple-targets` | `@bacons/apple-targets@^4.0.7` (devDep) | ✅ |

### Native modules (local `file:./modules/*`)

| Module | Folder exists? | `expo-module.config.json` valid? | Imported in code? |
|---|---|---|---|
| `asc-jwt` | ✅ | ✅ `{platforms: ['ios'], ios: {modules: ['AscJwtModule']}}` | ✅ |
| `live-activity` | ✅ | ✅ `{platforms: ['ios'], ios: {modules: ['LiveActivityModule']}}` | ✅ |
| `widget-data` | ✅ | ✅ `{platforms: ['ios'], ios: {modules: ['WidgetDataModule']}}` | ✅ |

### Apple Targets (extensions)

| Target | Folder | `expo-target.config.js` | `Info.plist` | Listed in `app.json` extra.eas.experimental | Status |
|---|---|---|---|---|---|
| Widget + Live Activity | `targets/widget/` | ✅ `type: 'widget'`, frameworks: `[SwiftUI, WidgetKit, ActivityKit]` | ✅ `com.apple.widgetkit-extension` | ✅ `ReleasePilotWidget` | ✅ |
| Notification Service | `targets/notif-service/` | ✅ `type: 'notification-service'`, frameworks: `[UserNotifications]` | ✅ `com.apple.usernotifications.service` + `NSExtensionPrincipalClass` | ✅ `ReleasePilotNotificationService` | ✅ |

### Build numbering

| Setting | File | Value | Effect |
|---|---|---|---|
| `appVersionSource` | `eas.json` | `"remote"` | EAS owns the build number, not your local code |
| `autoIncrement` | `eas.json` → `build.production` | `true` | Every prod build gets a fresh, monotonic build number |
| `runtimeVersion.policy` | `app.json` | `"appVersion"` | OTA updates only ship to matching `version` (`1.0.0`) |
| `version` | `app.json` | `"1.0.0"` | App Store visible version |

✅ **You don't need to touch build numbers manually.** EAS handles it. Bump `version` in `app.json` only when releasing 1.0.1, 1.1, etc.

### Subscription configuration

| Item | Value | Status |
|---|---|---|
| RC `iosApiKey` | `appl_JbvUHiRqdtvVRdXDXBcNKDgQnRe` | ✅ Real, prefixed `appl_` (correct), in `app.json` extras |
| RC `entitlementId` | `pro` | ✅ Matches RC dashboard entitlement |
| RC `currentOfferingId` | `default` | ✅ Matches RC dashboard offering |
| Product IDs in code | `release_pilot_pro_monthly`, `release_pilot_pro_yearly` | ✅ Match RC + ASC |

---

## 🧹 Optional cleanup (not blocking)

- `assets/images/` template defaults removal (see Section 3)
- Icon PNG optimization (see Section 4)
- Worker `database_id` placeholder cleanup (after deploy)

---

# 🔁 REUSABLE PRE-PROD BUILD CHECKLIST

> **Run this before every `eas build --platform ios --profile production`.**
> Copy this section into a fresh `BUILD_AUDIT_<date>.md` for each build.

## A. Code quality gates (must all pass)

```bash
cd app
npm run typecheck    # tsc --noEmit            → must say 0 errors
npm run lint         # expo lint               → must say 0 errors (warnings OK)
npm test             # all unit tests          → all files must pass
npm run verify:cli   # end-to-end gates        → all phases must pass
```

| Check | Pass criteria |
|---|---|
| `typecheck` | Exit code 0, no error output |
| `lint` | Exit code 0, 0 errors (warnings non-blocking) |
| `npm test` | "All N test files passed" line at end |
| `verify:cli` | Final line shows "✓ Phase 1 + 2 + ... PASSED" |

## B. Native config sanity

- [ ] `app.json` → `expo.version` bumped (only if shipping a new App Store version)
- [ ] `app.json` → `expo.ios.bundleIdentifier` matches your ASC app
- [ ] `app.json` → `expo.ios.appleTeamId` matches your Apple Developer team
- [ ] `app.json` → `expo.ios.entitlements.aps-environment` is `"production"`
- [ ] `app.json` → all App Group strings match across main app + widget + notif-service
- [ ] `app.json` → `extra.eas.build.experimental.ios.appExtensions[*].bundleIdentifier` are unique and match the widget/notif-service target names
- [ ] `app.json` → `extra.eas.projectId` is set to your real EAS project UUID
- [ ] `eas.json` → `submit.production.ios.appleId`, `ascAppId`, `appleTeamId` all filled in
- [ ] `eas.json` → `cli.appVersionSource = "remote"` and `build.production.autoIncrement = true`

## C. Permissions / privacy

- [ ] Every iOS permission your code requests has a matching `NS*UsageDescription` string in `app.json` → `expo.ios.infoPlist`
- [ ] `ITSAppUsesNonExemptEncryption` is set (true OR false — Apple needs to know)
- [ ] `NSPrivacyAccessedAPITypes` array declares every API category you use (UserDefaults, FileTimestamp, DiskSpace, SystemBootTime — minimum for RN apps)
- [ ] **🔑 ORPHAN-CONFIG CHECK** — every single value below must have a corresponding `Grep` hit in `app/src/**`:
  - [ ] Every entry in `ios.entitlements` → referenced by code that uses that capability
    - `com.apple.developer.usernotifications.communication` ONLY for chat/call apps with `INSendMessageIntent` / `INStartCallIntent` in `NSUserActivityTypes` (ITMS-90894)
    - `aps-environment` only if `setNotificationHandler` / `getDevicePushTokenAsync` is called
    - `com.apple.security.application-groups` only if `UserDefaults(suiteName:)` is read by app or extension
  - [ ] Every entry in `UIBackgroundModes`:
    - `fetch` only if `BackgroundFetch.registerTaskAsync` is called
    - `processing` only if `BGProcessingTaskRequest` is submitted (rare in RN apps)
    - `remote-notification` only if silent push (`"content-available": 1`) is sent to the app
    - `audio`, `location`, `voip`, `external-accessory`, `bluetooth-*` only with real implementations
  - [ ] Every entry in `BGTaskSchedulerPermittedIdentifiers` → has a matching `TaskManager.defineTask(<id>, ...)` call
  - [ ] Every entry in `LSApplicationQueriesSchemes` → has a matching `Linking.canOpenURL("<scheme>:...")` call (NOT just `Linking.openURL`, which doesn't need declaration)
  - [ ] Every `NSXxxUsageDescription` → has corresponding code that requests/uses that permission
  - [ ] Every plugin in `plugins[]` → has a real `import` somewhere in `src/`
- [ ] **Why this matters:** Apple flags unused / mismatched config in delivery emails (ITMS-90894, etc.). The most reliable way to prevent this class of warning is to delete config you can't tie to a code path. *This is the audit gap that caused ITMS-90894 in Build 2.*

## D. Native modules + targets

- [ ] Every `file:./modules/*` entry in `package.json` has a real folder with `expo-module.config.json`
- [ ] Every Swift target in `targets/*/` has both `expo-target.config.js` and `Info.plist`
- [ ] Each target's `name` in `expo-target.config.js` matches its `targetName` in `app.json` → `extra.eas.build.experimental.ios.appExtensions`
- [ ] Each target's `deploymentTarget` is `>=` the main app's deployment target
- [ ] Each plugin listed in `app.json` → `plugins[]` has a matching entry in `package.json` dependencies
- [ ] No duplicate native module names across `modules/` folders

## E. URLs and external dependencies

- [ ] All hardcoded URLs in `src/` (`grep -r 'https://' src/`) point to live, reachable endpoints
- [ ] Privacy Policy URL is hosted and returns 200
- [ ] Support URL is hosted and returns 200
- [ ] Marketing/landing URL (if used) is hosted and returns 200
- [ ] Cloudflare Worker URL resolves and the deployed code is the version you expect
- [ ] RevenueCat dashboard has matching product IDs + entitlement + offering for what `app.json` and code expect

## F. Subscription / IAP readiness

- [ ] All IAP product IDs in ASC are in "Ready to Submit" (NOT `MISSING_METADATA`)
- [ ] Each IAP has product-level localization filled in
- [ ] Each IAP has a review screenshot uploaded
- [ ] Each IAP has Availability configured (all territories selected)
- [ ] All IAPs are in the same Subscription Group (if upgrade/downgrade matters)
- [ ] RevenueCat dashboard shows the IAPs as "Active" with no errors
- [ ] Sandbox test purchase succeeds end-to-end on a fresh device

## G. Assets

- [ ] App icon exists at the path referenced in `app.json` (1024×1024 PNG, no alpha, no rounded corners)
- [ ] Splash screen icon exists and is ≤512 KB ideally
- [ ] No unreferenced template defaults in `assets/` (`react-logo`, `tutorial-web`, etc.)

## H. Git / source state

- [ ] Working tree is clean OR every uncommitted change is intentional for this build
- [ ] You're on the branch you want to ship from (typically `main`)
- [ ] No secrets or `.env*` files staged

## I. ASC submission readiness (only when about to submit, not just build)

- [ ] App Information complete (Categories, Age Rating, Privacy Practices)
- [ ] App Privacy nutrition labels completed
- [ ] Screenshots uploaded for at least the 6.9" device size
- [ ] App Review Notes filled (with real reviewer credentials if your app requires auth)
- [ ] Demo account provided OR explicit reason in notes why one isn't needed
- [ ] IAPs attached to the v1.0 version page
- [ ] Build attached to the v1.0 version page
- [ ] Export Compliance answered (matches `ITSAppUsesNonExemptEncryption`)

---

## Run the prod build

Once **every BLOCKER is resolved** and **all gates pass**:

```bash
cd app
eas build --profile production --platform ios
```

EAS will:
- Use the `production` profile from `eas.json`
- Auto-increment the build number (you keep `version` constant)
- Build the `.ipa` on macos-tahoe-26.4-xcode-26.4 image
- Sign with your stored credentials
- Upload to EAS dashboard for download / TestFlight submission

**Don't run** `eas submit` until you've smoke-tested the build via TestFlight Internal.

---

## Appendix: Audit history

| Date | Version | Auditor | Notes |
|---|---|---|---|
| 2026-06-12 | v1.0.0 | Senthil + Cursor | First prod build audit. 3 blockers identified: missing custom domain, undeployed worker, broken in-app privacy URL. Code quality green. |
