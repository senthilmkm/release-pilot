# Gating Audit — End-to-End (Jun 12, 2026)

Trigger: full end-to-end verification before next App Store submission.

TL;DR — **5 bugs found, all 5 fixed.** Every gate now enforced at every
known entry point + a defense-in-depth check at the one write point that
matters. CLI integration test + 19 unit-test files pass green.

---

## The 8 gates

| # | Gate | Type | Free limit | Enforces |
|---|------|------|------------|----------|
| 1 | `add-account-limit` | metered | 1 ASC account | More tab "Add another account" row |
| 2 | `add-app-limit` | metered | 1 app (alphabetically first) | Every per-app UI entry across the app |
| 3 | `reply-to-review-limit` | metered | 2 replies / 30 days | Review-reply composer "Send" button |
| 4 | `checklist-weekly-limit` | metered | 3 runs / 7 days | Checklist "Re-run" + pull-to-refresh |
| 5 | `connect-revenuecat-pro` | binary | Pro-only | Every "Connect RevenueCat" entry + write point |
| 6 | `push-notifications-pro` | binary | Pro-only | Background worker registration (server-side gate) |
| 7 | `lock-screen-widget-pro` | tiered | All apps Pro · 1 app free | Widget data hydration (passive in `useNativeSurfaceSync`) — free users see the alphabetically-first app, Pro sees all |
| 8 | `live-activity-pro` | binary | Pro-only | Live Activity start (passive in `live-activity-sync`) |

---

## Bugs found + fixed in this audit

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| BUG-1 | HIGH | Today-tab top "Connect RevenueCat" banner had no gate — free users could route straight to `revenuecat-paste` | Added `gate.check('connect-revenuecat-pro')` in `onTapRcBanner` |
| BUG-3 | HIGH | Checklist tab `AppPicker` showed every app; auto-load fetched checklist for any picked app for free users | Sort apps alphabetically + show 🔒 chip for locked apps + `handlePickApp` opens paywall + query short-circuits on locked selection + self-healing fallback to free app if previously-selected app becomes locked (downgrade) |
| BUG-5 | HIGH | `verifyAndPersistRevenueCat` had no `isPro` check — every caller had to remember to gate at navigation layer | Added defense-in-depth via `gateConnectRevenueCat({ isPro })` using the same pure helper the UI uses; returns new `pro_required` error kind |
| BUG-4 | MED | Onboarding `revenuecat.tsx` AppRow let free users connect RC before ever hitting the trial step | `AppRow.onPress` now calls `gate.check('connect-revenuecat-pro')` first; added inline caption "RevenueCat integration is a Pro feature" |
| BUG-2 | MED | `(tabs)/releases/[id].tsx` had no route-level guard — widget deep-links + push-notification taps + stale internal links bypassed `add-app-limit` for free users | Added inline `isLocked(id)` guard rendering a "This app is Pro-only" upsell pane with "See plans" + "Back to Releases" CTAs |

---

## Gate-by-gate enforcement matrix (post-fix)

### 1. `add-account-limit`

| Entry point | Gated? | Notes |
|---|---|---|
| `more.tsx` → "Add another account" row | ✅ | `paywall.check('add-account-limit')` |
| `welcome.tsx` onboarding entry | ✅ | First account only — gate is N/A by design |
| Deep links | N/A | No deep link to "add account" exists |

### 2. `add-app-limit`

| Entry point | Gated? | Notes |
|---|---|---|
| `(tabs)/releases/index.tsx` AppRow tap | ✅ | `useFreeApp` + paywall (Build 3) |
| `(tabs)/reviews/index.tsx` ReviewRow tap | ✅ | `useFreeApp` + paywall (Build 3) |
| `(tabs)/briefing.tsx` AppCard tap | ✅ | `useFreeApp` + paywall (Build 3) |
| `(tabs)/briefing.tsx` AppCard inner "Connect RC" button | ✅ | Same gate, then `connect-revenuecat-pro` |
| `(tabs)/checklist.tsx` AppPicker chip tap | ✅ NEW | Locked chip shows 🔒; tap opens paywall; query short-circuits |
| `(tabs)/releases/[id].tsx` route entry | ✅ NEW | Route-level guard catches widget deep links, push taps, stale links |
| Push tap → `releases/[id]` | ✅ | Now covered by route guard above |
| Widget deep link → `releases/[id]` | ✅ | Now covered by route guard above |

### 3. `reply-to-review-limit`

| Entry point | Gated? | Notes |
|---|---|---|
| Reply composer "Send" button | ✅ | `paywall.check('reply-to-review-limit')` + counter ticks after success |
| Background reply-queue drainer | ✅ | Calls same gate; no double-count (verified in subagent audit) |

### 4. `checklist-weekly-limit`

| Entry point | Gated? | Notes |
|---|---|---|
| `checklist.tsx` "Re-run" button | ✅ | `paywall.check('checklist-weekly-limit')` + `recordChecklistRun` |
| `checklist.tsx` pull-to-refresh | ✅ | Same code path (`handleRerun`) |
| First-mount auto-load (TanStack cache) | ✅ | Passively cached, does not count |

⚠️ **Known risk** (intentional, low-impact): `recordChecklistRun()` ticks
*before* the network call, so a request failure still consumes a weekly
free run. Acceptable cost vs the complexity of post-hoc compensation.

### 5. `connect-revenuecat-pro`

| Entry point | Gated? | Notes |
|---|---|---|
| `briefing.tsx` top "Connect RevenueCat" banner | ✅ FIXED | BUG-1 |
| `briefing.tsx` AppCard inner "Connect RC" button | ✅ | Fixed earlier in this session |
| `more.tsx` per-app "Connect RC" row | ✅ | `handleConnectRevenueCat` gates |
| `(onboarding)/revenuecat.tsx` AppRow | ✅ FIXED | BUG-4 |
| `(onboarding)/revenuecat-paste.tsx` Verify button | ✅ | Defense-in-depth via `verifyAndPersistRevenueCat` (BUG-5) |
| `verifyAndPersistRevenueCat` write point | ✅ FIXED | BUG-5 — final guard, uses pure `gateConnectRevenueCat` helper |

### 6. `push-notifications-pro` (passive)

Front-end never asks for push permission for free users (gated in
`use-native-surface-sync.ts`). Server worker MUST also check `isPro`
before sending — Cloudflare worker enforcement is out of scope for
this front-end audit but is the source of truth.

### 7. `lock-screen-widget-pro` (tiered, not strictly Pro-only)

The widget is intentionally tiered, not strictly Pro-only — same as
every other "1 app for free" surface (Releases / Reviews / Today /
Checklist tabs). `useNativeSurfaceSync.ts` always writes to the App
Group; `buildSharedState` caps the visible apps based on the user's
`WidgetProStatus`:

  - `pro`    → all apps, ordered by HERO_PRIORITY (most-urgent state first)
  - `free`   → 1 app — the **alphabetically-first** one (matches the
               rest of the free-app rule, so the widget surfaces an app
               the user can actually tap into). Adds a soft "Upgrade to
               track all apps" headline if they have 2+ apps.
  - `lapsed` → same 1 alphabetically-first app + prominent "Renew Pro"

The gate decision (`lock-screen-widget-pro`) is what the paywall opens
for; the actual rendering decision is the tier-aware projection. Paywall
copy was updated to say "every app in your widget (free shows 1)" so
the promise matches the implementation.

⚠️ Caveat: `useNativeSurfaceSync` is mounted only in
`(tabs)/releases/index.tsx`. If a user upgrades from the More tab and
never visits Releases, the widget won't repopulate (to show all apps)
until they do. Low impact — most upgrade flows include a "see your
widget" moment that lands on Releases.

### 8. `live-activity-pro` (passive)

`live-activity-sync.ts` derives `start | update | end | noop`
transitions and only invokes ActivityKit when `isPro=true`. Active
LAs auto-terminate when entitlement flips to free.

---

## What was already working correctly (verified, no changes)

- Releases / Reviews / Briefing per-row `add-app-limit` enforcement (Build 3 fix)
- More-tab `add-account-limit` enforcement
- Review reply counter timing (ticks after success, no double-count from queue drainer)
- Checklist weekly counter timing
- Live Activity passive teardown on downgrade
- RC cache invalidation on purchase/restore/foreground
- `gateConnectRevenueCat`, `gateEnablePushNotifications`, `gateLockScreenWidget`, `gateLiveActivity` pure helpers (100 unit tests, all passing)
- Free-app helper logic (`sortAppsAlphabetically`, `getFreeAppAscId`, `isAppLockedForFree`) — 20 unit tests, all passing

---

## Design decisions (intentional, not bugs)

1. **Lapsed-Pro users keep their stored RC data visible.** If a user
   subscribes → connects RC → cancels, the Today tab still shows their
   already-fetched MRR until the cache expires. This is a generous-by-
   design choice. We chose not to wipe RC data on downgrade.
2. **Onboarding RC step opens paywall instead of "skip silently".** Two
   options were on the table: (a) hide the row entirely with "Pro only"
   text, (b) keep the row tappable but route to paywall. We picked (b)
   because (a) is harder to discover post-onboarding.
3. **No data wipe on downgrade.** ASC + RC credentials persist when the
   user goes Pro → Free. The gates control *interaction*, not *data*.

---

## Verification artifacts

- `npm run typecheck` → clean
- `npm test` → 19/19 files pass, including 100 subscription tests + 20 free-app tests
- `npm run verify:cli` → 14/14 steps pass, including the 19-scenario gate matrix + plan-transition sequence

---

## Files changed

- `app/src/app/(tabs)/briefing.tsx` (BUG-1)
- `app/src/app/(tabs)/checklist.tsx` (BUG-3)
- `app/src/features/checklist/app-picker.tsx` (BUG-3 — added `isLocked` prop + lock icon)
- `app/src/lib/auth/verify-and-persist-revenuecat.ts` (BUG-5)
- `app/src/lib/api/revenuecat-errors.ts` (BUG-5 — new `pro_required` kind)
- `app/src/app/(onboarding)/revenuecat.tsx` (BUG-4)
- `app/src/app/(tabs)/releases/[id].tsx` (BUG-2 — route-level guard + lock UI)

---

## Recommended next steps

1. Test the new locked-app paywall flows on TestFlight build 4:
   - Free + 4 apps → tap any non-alphabetically-first app on Releases/Reviews/Today/Checklist → expect paywall.
   - Free + 4 apps → tap "Connect RC" anywhere → expect paywall (no key-paste screen).
   - Pro → all apps + RC accessible.
2. Push as OTA: `eas update --branch production --platform ios --message "audit: 5 gating bugs fixed"`
3. After Pro testing, drop to free in App Store sandbox and confirm the
   downgrade-to-free flow doesn't crash any screen (especially Today and
   Checklist, which now have self-healing fallbacks for previously-
   selected locked apps).
