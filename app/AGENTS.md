# Release Pilot — AI Agent Notes

This file is the source of truth for AI agents (Cursor, Claude, etc.) working
on this codebase. Read it before any change. Update it when conventions evolve.

## Project context

- **App:** Release Pilot — iPhone home-screen companion for App Store releases.
- **Audience:** Indie iOS developers shipping 1–6 apps via App Store Connect.
- **Plans live in:** `../*.md` (V1 / V1.5 / V2 / Tech Design / UX Flow).

## Tech stack (locked Phase 0)

- **Framework:** React Native + Expo SDK 56, TypeScript strict mode
- **Routing:** expo-router (file-based) with `(onboarding)` + `(tabs)` route groups
- **State:** Zustand (global) + TanStack Query (server cache) + MMKV (persistent KV)
- **Sensitive storage:** expo-secure-store (Keychain, biometric-locked)
- **DB:** expo-sqlite (cached ASC data, reviews, checklist runs)
- **Subscriptions:** react-native-purchases (RevenueCat) — **NEVER hardcode prices**; read from ASC via `getOfferings()`
- **JWT signing:** custom Expo module `asc-jwt` (CryptoKit ES256) with JS `jose` fallback for dev
- **Apple extensions (Widget, Live Activity, Notification Service):** `@bacons/apple-targets` in `targets/` folder, Swift code
- **Push proxy:** Cloudflare Worker (to be set up in Phase 6; under `worker/`)
- **Build:** EAS Build (1 dev-client build covers entire dev cycle; OTA via EAS Update for JS/TS changes)
- **iOS target:** 17.0+ (for full Live Activities + Dynamic Island support)

## Folder conventions

```
src/
├── app/                       # expo-router file routes (DO NOT add non-screen files here)
│   ├── _layout.tsx            # root: providers + Stack with (onboarding) | (tabs) | paywall
│   ├── index.tsx              # redirector based on `useHasAnyAccount`
│   ├── (onboarding)/          # 7-screen onboarding flow
│   ├── (tabs)/                # 4 tabs: releases, reviews, checklist, more
│   └── paywall.tsx            # modal — NO HARDCODED PRICES
├── components/                # shared dumb-presentational UI (no feature logic)
├── features/                  # feature-specific composed UI (e.g. onboarding-shell)
├── hooks/                     # reusable hooks (use-resolved-scheme, etc.)
├── constants/                 # theme tokens, env constants
├── lib/                       # all non-UI logic
│   ├── api/                   # ASC API client + DTOs (Phase 1)
│   ├── db/                    # SQLite schema + queries (Phase 2)
│   ├── domain/                # pure logic (state-machine, checklist rules)
│   ├── state/                 # Zustand stores + MMKV
│   └── utils/                 # small pure helpers

modules/                       # custom Expo native modules (Swift)
└── asc-jwt/                   # ES256 JWT signer for ASC API

targets/                       # @bacons/apple-targets configs (Swift extensions)
├── widget/                    # WidgetKit widgets
├── live-activity/             # ActivityKit Live Activity
└── notif-service/             # Notification Service Extension

worker/                        # Cloudflare Worker push proxy (Phase 6)
```

## Coding rules

1. **Color scheme:** ALWAYS use `useResolvedScheme()` from `@/hooks/use-resolved-scheme`. Never `useColorScheme() ?? 'light'`.
2. **State badges:** ALWAYS render via `<StateBadge state={...} />`. Never reach for `StateColors` directly.
3. **Theme tokens:** Pull from `@/constants/theme` (Colors, StateColors, Spacing, Radii, TypeScale, Fonts). Hard-coded `#hex` values are a code-review reject.
4. **Strict TS:** No `any`, no `as unknown as`. Use proper narrowing helpers.
5. **No comments that narrate code.** Comments explain non-obvious intent only.
6. **Tests:** Pure Node-runnable via `tsx`. Pattern: `*.test.ts` colocated with source. Run with `npm test`.
7. **Touch targets:** Minimum 44×44 pt (iOS HIG). Use `hitSlop` for visually smaller controls.
8. **Accessibility:** Every interactive element gets `accessibilityRole` + `accessibilityLabel`. Every screen reads top-to-bottom in VoiceOver.
9. **Sensitive data:** Goes to `expo-secure-store` with biometric prompt. Never to MMKV, AsyncStorage, or SQLite.

## Subscription rules

- **NO HARDCODED PRICES.** Use `Purchases.getOfferings()` (RevenueCat). Apple manages all prices in App Store Connect; the app reflects them.
- Paywall fires on 3 triggers only: adding 2nd app, replying to review, 4th checklist run/week.
- Free trial: 14 days. Restore purchases visible on paywall AND in Settings.

## Build process

- **Local Metro:** `npm start` → scan QR with Expo Go or dev-client on iPhone.
- **EAS dev client:** `eas build --profile development --platform ios` (one-time, ~30 min).
- **Production:** `eas build --profile production --platform ios` then `eas submit`.
- **OTA updates:** `eas update --branch production` (free, instant; works for JS/TS only).

## Git rules

- **NEVER commit / push without explicit user approval.**
- Local git is initialized; user will create remote repo + push when they're ready.
- `.gitignore` is preconfigured; do not commit `node_modules`, `.expo/`, `ios/build/`, `*.env`, `eas.json` containing sensitive IDs.

## Phase tracker

- ✅ Phase 0: scaffolding + design system + custom modules + tab skeleton + onboarding skeleton
- ✅ Phase 1: real onboarding content + ASC JWT auth + Keychain credentials + app list fetch
- ✅ Phase 2: Releases v2 (live state badges) + App detail + timeline + SQLite cache + pull-to-refresh
- ✅ Phase 3: Reviews inbox (filters + counts) + Review detail + Reply composer + Templates + Offline queue
- ✅ Phase 4: Checklist tab + 10 pre-submit rules + Re-run + ASC web deep-links per failure
- ✅ Phase 5: Live Activity (ActivityKit) + Widgets (WidgetKit) + App Group bridge + sync deriver
- ✅ Phase 6: Cloudflare Worker push proxy + APNs + device registration + background-fetch fallback
- ✅ Phase 7: RevenueCat paywall + 3 free-tier gates + restore + manage subscription
- ✅ Phase 8: Polish (skeletons + haptics + offline banner + diagnostics + a11y) + EAS dev-client runbook
- ✅ Phase 9: RevenueCat REST v2 (per-app overview) + Today briefing tab + 7am local push

## Phase 9 — RevenueCat REST v2 + Daily Briefing (where things live)

| Concern                              | File                                                       |
|--------------------------------------|------------------------------------------------------------|
| RC REST client + 200-projection      | `src/lib/api/revenuecat-client.ts`                         |
| RC TypeScript shapes                 | `src/lib/api/revenuecat-types.ts`                          |
| RC error taxonomy + describe()       | `src/lib/api/revenuecat-errors.ts`                         |
| RC TanStack hook (overview fan-out)  | `src/lib/api/revenuecat-queries.ts`                        |
| RC secret Keychain helpers           | `src/lib/auth/revenuecat-credentials.ts`                   |
| RC per-app metadata Zustand store    | `src/lib/state/app-revenuecat.ts` (wrapper)                |
| RC reducer pure functions + types    | `src/lib/state/app-revenuecat-reducers.ts` (tested)        |
| RC verify-and-persist orchestrator   | `src/lib/auth/verify-and-persist-revenuecat.ts`            |
| Briefing aggregator (pure)           | `src/lib/domain/briefing.ts`                               |
| Briefing snapshot persistence (MMKV) | `src/lib/domain/briefing-snapshot-store.ts`                |
| Today tab UI                         | `src/app/(tabs)/briefing.tsx`                              |
| RC onboarding list screen            | `src/app/(onboarding)/revenuecat.tsx`                      |
| RC per-app paste screen              | `src/app/(onboarding)/revenuecat-paste.tsx`                |
| 7am local push scheduler             | `src/lib/push/schedule-briefing.ts`                        |
| Tap-deeplink (notif → /briefing)     | `src/lib/push/setup-notifications.ts` `installResponseHandler` |

### Invariants for Phase 9 (DO NOT VIOLATE)

1. **Per-app, not per-account.** RC credentials are keyed by ASC `app.id`,
   NOT issuer ID. One Apple Developer Team can ship N apps each with its
   own RC project. The accounts store and the RC store are independent.
2. **Secret keys in Keychain only.** `expo-secure-store` (no Face ID — the
   briefing polls every refresh; biometric prompt would be hostile). Only
   the `projectId`, `lastVerifiedAtMs`, and `currency` live in MMKV.
3. **`charts_metrics:overview:read` scope is mandatory.** When the user
   creates a V2 secret in RevenueCat, this exact permission must be on it.
   The error-mapping layer (`forbidden_missing_scope`) tells the user
   exactly which scope to add if they picked the wrong one.
4. **Native fetch is fine** — CORS doesn't apply to native apps. Earlier
   advice about needing a proxy is browser-specific.
5. **Mixed currencies → no MRR rollup.** The briefing's `totals.totalMrr`
   is `null` when connected apps report different currencies. The
   per-app numbers still render; the rollup row hides.
6. **Briefing snapshot is versioned (`__v`).** Schema changes go through
   `briefing-snapshot-store.ts`'s version check, return `null` on mismatch.
   Never crash a render on a malformed snapshot.
7. **Daily 7am notification is LOCAL** (no APNs / no worker round-trip).
   `scheduleBriefingNotification()` is idempotent — re-cancels and
   re-creates the same identifier so re-launches don't duplicate.
8. **Briefing build is PURE.** `buildBriefing()` accepts `nowMs` as input
   (do NOT call `Date.now()` inside it). The Today tab captures `nowMs`
   via `useState(() => Date.now())` once per mount.
9. **Reducer pattern when zustand store needs tests.** See
   `app-revenuecat-reducers.ts` for the template — extract pure
   functions, test those, the store body is a 3-line wrapper.

## Useful commands

```bash
npm start                  # Metro bundler
npm test                   # auto-discovers every src/**/*.test.ts and runs via tsx
npm run typecheck          # tsc --noEmit (scripts/ excluded — that's tooling)
npm run lint               # expo lint
npx expo-doctor            # project config validation
npm run verify:cli         # integration test against real ASC API (see CLI section)
npm run verify:cli:bad-key # force a bad token to verify the error-mapping path
```

## CLI integration testing (Phase 1+)

`scripts/cli-verify.ts` runs the entire auth + API path against Apple's real
App Store Connect server, using the SAME source files the iOS app uses for
validators, error mapping, team-name derivation, and DTO types. The two
divergences:

- JWT signing uses `jose` directly (mirrors the spec the iOS `asc-jwt`
  Swift module implements)
- Keychain is skipped (that's a device-only test)

Setup:

```bash
cp .local-credentials.example.json .local-credentials.json
# then fill in real issuerId / keyId / p8PEM (gitignored)
npm run verify:cli
```

Future phases should add their own CLI test steps to this same script
rather than spawning new ones (App detail fetch, review list, etc.).

## Phase 1 quick-reference (where things live)

| Concern               | File                                           |
|-----------------------|------------------------------------------------|
| ASC API HTTP client   | `src/lib/api/asc-client.ts`                    |
| Typed error taxonomy  | `src/lib/api/asc-errors.ts` + `.test.ts`       |
| TanStack Query hooks  | `src/lib/api/asc-queries.ts`                   |
| Keychain p8 storage   | `src/lib/auth/credentials.ts`                  |
| Pure credential regex | `src/lib/auth/credentials-format.ts` + `.test` |
| JWT in-memory cache   | `src/lib/auth/jwt-cache.ts`                    |
| Verify orchestration  | `src/lib/auth/verify-and-persist.ts`           |
| Team-name heuristic   | `src/lib/auth/team-name.ts` + `.test.ts`       |
| Draft form state      | `src/lib/state/onboarding-draft.ts` (ephemeral)|
| Connected accounts    | `src/lib/state/accounts.ts` (Zustand + MMKV)   |
| Onboarding screens    | `src/app/(onboarding)/*.tsx` (7 files)         |
| Releases tab          | `src/app/(tabs)/releases.tsx` + `features/releases/app-row.tsx` |
| Form primitives       | `src/components/text-field.tsx`, `info-bullet.tsx` |

**Hot-path UX guardrails:**
- Face ID prompts only fire when the in-memory JWT is missing/expired (~ every 17 min).
- Onboarding paste state is never persisted to disk — it lives in `useOnboardingDraft` and is reset on successful verify.
- The Releases tab handles all 5 states cleanly: no-accounts, loading, error, empty-team, app-list.

## Phase 2 quick-reference

| Concern                          | File                                                          |
|----------------------------------|---------------------------------------------------------------|
| Version + Build + Submission DTOs| `src/lib/api/asc-types.ts` (ASCAppStoreVersion, ASCBuild)     |
| listAppStoreVersions API call    | `src/lib/api/asc-client.ts`                                   |
| Per-app + aggregated state query | `src/lib/api/asc-queries.ts` (`useVersionsQuery`, `useLatestStatesQuery`) |
| Raw ASC → semantic state         | `src/lib/domain/state-machine.ts` (unchanged from Phase 0)    |
| Versions → timeline projection   | `src/lib/domain/version-events.ts` + `.test.ts`               |
| SQLite cache (stale-while-revalidate) | `src/lib/db/cache.ts` + `cache-utils.ts` + `.test.ts`    |
| Pure state tokens (Node-safe)    | `src/constants/state-tokens.ts` (re-exported by `theme.ts`)   |
| Relative-time formatter          | `src/lib/utils/date-format.ts` + `.test.ts`                   |
| Releases list                    | `src/app/(tabs)/releases/index.tsx`                           |
| App detail (drill-down)          | `src/app/(tabs)/releases/[id].tsx`                            |
| Releases tab Stack               | `src/app/(tabs)/releases/_layout.tsx`                         |
| AppRow with live StateBadge      | `src/features/releases/app-row.tsx`                           |
| Timeline row                     | `src/features/app-detail/version-row.tsx`                     |
| App detail header                | `src/features/app-detail/detail-header.tsx`                   |
| State help modal (`?` icon)      | `src/features/app-detail/state-help-modal.tsx`                |

**Pattern: pure-tokens split.** Whenever a constants/domain file needs to be
imported by Node-side tooling (CLI verifier, future server code), split the
RN-free parts into a sibling `*-tokens.ts` or `*-format.ts` file and have
the original file re-export. See: `credentials.ts` / `credentials-format.ts`,
`theme.ts` / `state-tokens.ts`, `verify-and-persist.ts` / `team-name.ts`.

**Pattern: stale-while-revalidate cache.** Queries that need cold-start
speed use this template:
```ts
const [initialData, setInitialData] = useState<T | undefined>(undefined);
useEffect(() => { void getCachedX(key).then(c => c && setInitialData(c.x)); }, [key]);
return useQuery({ queryKey: [...], placeholderData: initialData, queryFn: async () => {
  const fresh = await fetchFromASC(...);
  void setCachedX(key, fresh);
  return fresh;
}});
```

## Phase 3 quick-reference

| Concern                              | File                                                       |
|--------------------------------------|------------------------------------------------------------|
| Review + Response DTOs               | `src/lib/api/asc-types.ts` (ASCCustomerReview, ASCCustomerReviewResponse) |
| listReviews + submitReviewResponse   | `src/lib/api/asc-client.ts`                                |
| Reviews queries + reply mutation     | `src/lib/api/asc-queries.ts` (`useAllReviewsQuery`, `useReviewsQuery`, `useSubmitReplyMutation`) |
| Pure project + filter + count        | `src/lib/domain/review-feed.ts` + `.test.ts` (43 tests)    |
| Reply body validator                 | `src/lib/domain/review-feed.ts` (`validateReplyBody`, `REPLY_BODY_MAX_CHARS`) |
| Reviews cache + offline reply queue  | `src/lib/db/reviews-cache.ts`                              |
| Canned templates (built-in + custom) | `src/lib/state/canned-templates.ts` (Zustand + MMKV)       |
| Inbox screen                         | `src/app/(tabs)/reviews/index.tsx`                         |
| Review detail + composer             | `src/app/(tabs)/reviews/[id].tsx`                          |
| Reviews tab Stack                    | `src/app/(tabs)/reviews/_layout.tsx`                       |
| Filter bar (chips)                   | `src/features/reviews/filter-bar.tsx`                      |
| ReviewRow with reply-state badge     | `src/features/reviews/review-row.tsx`                      |
| 5-star display                       | `src/features/reviews/rating-stars.tsx`                    |
| Reply composer                       | `src/features/reviews/reply-composer.tsx`                  |
| Template picker (bottom sheet)       | `src/features/reviews/template-picker.tsx`                 |

**Pattern: optimistic reply with offline fallback.** `useSubmitReplyMutation`
swallows network/server errors and enqueues the reply in `reply_queue` (SQLite).
The inbox immediately shows the local pending state via `projectReview`'s
`pendingLocal` argument, so the user never sees a "Send failed" error for
recoverable failures. Hard auth errors (`unauthorized`, `forbidden`) still
throw so the UI can prompt the user to fix their key.

**Permission gotcha.** The customerReviews collection requires the API
key to have "Customer Support" or "Admin" role. Keys with only the
"Developer" role get a 403 — the inbox handles this with a friendly
"Reviews are locked" empty state instead of an error.

## Phase 4 quick-reference

| Concern                              | File                                                       |
|--------------------------------------|------------------------------------------------------------|
| Localization + Screenshot DTOs       | `src/lib/api/asc-types.ts` (ASCAppStoreVersionLocalization, ASCAppScreenshotSet) |
| listVersionLocalizations + listScreenshotSets | `src/lib/api/asc-client.ts`                       |
| Checklist orchestrator query         | `src/lib/api/asc-queries.ts` (`useChecklistQuery`)         |
| **The 10 pure rules + summary**      | `src/lib/domain/checklist-rules.ts` + `.test.ts` (40 tests)|
| Checklist screen                     | `src/app/(tabs)/checklist.tsx`                             |
| App picker (chips)                   | `src/features/checklist/app-picker.tsx`                    |
| Per-rule expandable row              | `src/features/checklist/rule-row.tsx`                      |
| Hero summary card                    | `src/features/checklist/summary-card.tsx`                  |

**The 10 rules** (in display order):

1. `draft-exists`      — A version draft exists in ASC
2. `build-attached`    — A build is attached (and not INVALID/FAILED/PROCESSING)
3. `description`       — Description present, 10–4000 chars
4. `keywords`          — Keywords ≤ 100 chars
5. `support-url`       — Support URL present and URL-shaped
6. `marketing-url`     — Marketing URL present (warn, not fail)
7. `promo-text`        — Promotional text ≤ 170 chars (if set)
8. `whats-new`         — Release notes present (skipped for first version)
9. `screenshots`       — At least one modern iPhone screenshot set (6.1–6.9")
10. `encryption`       — Encryption export compliance answered (always `unknown` — API limitation)

**Severity ladder.** `fail` (Apple will reject) → `warn` (commonly rejected)
→ `unknown` (can't verify from API alone) → `na` (rule doesn't apply) →
`pass` (verified OK). Aggregate severity rule: any `fail` → overall fail;
else any `warn` → warn; else any `unknown` → unknown; else pass.

**Pattern: "unknown" is honest.** When the ASC API doesn't expose enough
info for confident pass/fail (e.g. encryption compliance), the rule
returns `unknown` with explicit "verify in ASC" remediation. This is
better than guessing "pass" — users would trust the wrong answer.

**Cache strategy.** Checklist uses TanStack Query in-memory only (no
SQLite). Users only run it right before submitting, where freshness
beats stale-while-revalidate cleverness.

## Phase 5 quick-reference

| Concern                                  | File                                                            |
|------------------------------------------|-----------------------------------------------------------------|
| Shared App Group state shape (TS source) | `src/lib/native/shared-app-state.ts`                            |
| JS → SharedAppState projector            | `src/lib/native/widget-app-state.ts`                            |
| Pure LA decision deriver + tests         | `src/lib/domain/live-activity-sync.ts` + `.test.ts` (21 tests)  |
| MMKV bookkeeping (last state + LA ids)   | `src/lib/state/active-live-activities.ts`                       |
| One hook to rule them all                | `src/hooks/use-native-surface-sync.ts` (call from Releases tab) |
| ActivityKit bridge (Swift module)        | `modules/live-activity/ios/LiveActivityModule.swift` + `index.ts` |
| App Group writer (Swift module)          | `modules/widget-data/ios/WidgetDataModule.swift` + `index.ts`   |
| Shared App Group reader (Swift, mirrors TS) | `targets/widget/SharedAppState.swift`                        |
| WidgetBundle entry point                 | `targets/widget/WidgetBundle.swift`                             |
| Home/Lock-screen widget (3 sizes)        | `targets/widget/ReleasesWidget.swift`                           |
| Live Activity attrs + DI views           | `targets/widget/ReleaseLiveActivity.swift`                      |
| Notification Service Extension stub      | `targets/notif-service/NotificationService.swift` (Phase 6)     |

**Sync pattern.** `useNativeSurfaceSync({ apps, snapshots })` is the
single integration point. Called from `(tabs)/releases/index.tsx` where
TanStack Query already has fresh data. On every successful fetch it:
  1. Writes the projected `SharedAppState` to the App Group + nudges WidgetKit
  2. For each app, diffs `previous` vs `current` semantic state and fires
     start / update / end against ActivityKit via the pure deriver
The bookkeeping lives in MMKV (`live-activity.records.v1` + `live-activity.last-state.v1`).

**Cross-target attribute sharing.** `ReleaseActivityAttributes` is defined
in `targets/widget/ReleaseLiveActivity.swift` and referenced by
`modules/live-activity/ios/LiveActivityModule.swift`. The
`@bacons/apple-targets` plugin handles the cross-target compile-sources
wiring. If you ever hit "Cannot find ReleaseActivityAttributes in scope"
at build time, that's the bridge — re-check `expo-target.config.js`.

**No-EAS-build testing.** The pure deriver (`live-activity-sync.ts`) +
the projector (`widget-app-state.ts`) are JS-only, so the CLI verifier
(`step 10`) exercises them against real ASC data. Swift extensions
themselves only render on a real device — they're validated at the
Phase 8 dev-client build step.

**iOS minimums.**
- Live Activities: iOS 16.1+ (ActivityKit). Our deployment target is 17.0
  so we don't need version-gating except inside the module itself.
- Dynamic Island: iPhone 14 Pro+ only. Lock Screen banner is the
  universal fallback (all iPhones, all iOS 16.1+).
- Frequent updates entitlement (`NSSupportsLiveActivitiesFrequentUpdates`)
  is set in `app.json` so Apple's rate-limiter allows updates more often
  during the in-flight window.

## Phase 6 quick-reference

### iOS (`app/src/lib/push/`)

| Concern                              | File                                                       |
|--------------------------------------|------------------------------------------------------------|
| Worker HTTP client (typed)           | `worker-client.ts`                                         |
| Device-registration orchestration    | `register-device.ts`                                       |
| Permission + token + foreground handler | `setup-notifications.ts`                                |
| 15-min background fetch fallback     | `background-poll.ts`                                       |
| Registration bookkeeping (MMKV)      | `state/push-registration.ts`                               |
| Wired at app start                   | `app/_layout.tsx` (effect + `defineBackgroundPollTask`)    |
| Registered on notif-grant            | `app/(onboarding)/notifications.tsx`                       |

### Worker (`worker/`)

| Concern                              | File                                                       |
|--------------------------------------|------------------------------------------------------------|
| HTTP + cron entry                    | `src/index.ts`                                             |
| HTTP handlers                        | `src/handlers/{register,unregister,refresh,health}.ts`     |
| Cron polling cycle                   | `src/cron/poll-cycle.ts`                                   |
| ASC poller                           | `src/ascpoll/poll.ts`                                      |
| APNs HTTP client + failure classify  | `src/apns/client.ts`                                       |
| APNs ES256 JWT signer                | `src/apns/jwt.ts` + `ec-sign.ts`                           |
| APNs payload + headers               | `src/apns/payload.ts` + `headlines.ts`                     |
| Pure push-diff + cooldown            | `src/lib/push-diff.ts` + `.test.ts` (24 tests)             |
| Semantic-state mapping (mirrors iOS) | `src/lib/semantic-state.ts` + `.test.ts` (23 tests)        |
| AES-GCM creds envelope               | `src/crypto/creds.ts` + `.test.ts` (8 tests)               |
| D1 schema + repo                     | `src/storage/d1-schema.sql` + `repo.ts`                    |
| Wrangler config + cron               | `wrangler.toml` (cron: `*/15 * * * *`)                     |
| Env binding types                    | `src/lib/env.ts`                                           |

### Deployment runbook (first time only)

```bash
cd worker
npm install
wrangler login                                       # opens browser

# 1. Create the D1 database, copy the returned id into wrangler.toml
wrangler d1 create release-pilot
# → paste the database_id into wrangler.toml under [[d1_databases]]

# 2. Initialise schema
npm run db:migrate:prod

# 3. Set secrets (interactive — they never get committed)
wrangler secret put APNS_TEAM_ID                     # e.g. 2KJK6895B3
wrangler secret put APNS_KEY_ID                      # 10 chars
wrangler secret put APNS_KEY_P8                      # paste full .p8 PEM
wrangler secret put APNS_BUNDLE_ID                   # app.releasepilot.ios
# 32 random bytes, base64-encoded (Node: `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`)
wrangler secret put CREDS_MASTER_KEY_B64

# 4. Deploy
npm run deploy
# → workers.dev URL is printed; copy into app's `Constants.expoConfig.extra.workerUrl`
```

### Trust model

The worker stores users' encrypted ASC `.p8` blobs in D1 so it can poll
ASC on the user's behalf — that's the only way to wake a sleeping phone
when Apple changes a release state.

- Encryption: AES-256-GCM with a key derived per-row via HKDF from a
  server-side master secret (`CREDS_MASTER_KEY_B64`) + a per-row 16-byte
  salt. A leaked D1 dump alone cannot decrypt — you'd also need the
  master secret out of Worker Secrets.
- Rotation: bump `CREDS_MASTER_KEY_B64` to a new value and force
  re-registration from the iOS app. (Re-encrypt-in-place is Phase 6.5.)
- Threat model NOT covered: a malicious worker operator with root access
  to Cloudflare Secrets can decrypt all rows. Document this in the
  privacy policy when we ship publicly.

### Push lifecycle

```
                                     ┌──────────────────┐
                                     │  iOS device      │
                                     │  (Release Pilot) │
                                     └────────┬─────────┘
                                              │ /v1/register (deviceToken + p8)
                                              ▼
┌──────────────────┐  cron */15 min  ┌──────────────────┐  HTTP/2 POST  ┌────────┐
│  ASC API         │ ◄──────────────►│  Cloudflare      │ ─────────────►│  APNs  │
│  /v1/apps + ...  │                 │  Worker          │               │ (Apple)│
└──────────────────┘                 │  + D1 (states +  │               └───┬────┘
                                     │   push log)      │                   │
                                     └──────────────────┘                   ▼
                                                                ┌──────────────────┐
                                                                │  iOS device      │
                                                                │  (banner + LA    │
                                                                │   + widget       │
                                                                │   refresh)       │
                                                                └──────────────────┘
```

Fallback path when push is unreliable: `expo-background-fetch` task
`app.releasepilot.poll` (every ~15 min when iOS allows) calls
`POST /v1/refresh` to force the worker to re-poll right now.

### What "Phase 6 complete" means

- 103 worker tests passing (`cd worker && npm test`)
- Worker code compiles + deploys (manual: needs `wrangler login` from user)
- iOS push handler captures device token + registers with worker after
  permission grant
- Background-fetch task registered with correct identifier matching
  `BGTaskSchedulerPermittedIdentifiers` in `app.json`
- Foreground pushes trigger query invalidation → UI updates without manual refresh
- CLI verifier step 11 simulates the full worker push pipeline against
  live ASC data (no actual APNs send — that needs a real device + provisioning)

## Phase 7 quick-reference (subscriptions + paywall)

| Concern                                  | File                                                                |
|------------------------------------------|---------------------------------------------------------------------|
| RC API key (NO secrets)                  | `app.json` → `expo.extra.revenueCat.{iosApiKey,entitlementId}`      |
| RC config reader + boot                  | `src/lib/subscription/{config,init}.ts`                             |
| Pure entitlement deriver (+ trial flag)  | `src/lib/subscription/entitlements.ts`                              |
| Pure offering normalizer (sort + perMo)  | `src/lib/subscription/offerings.ts`                                 |
| Pure gate logic (3 triggers)             | `src/lib/subscription/gates.ts` (+ `gates.test.ts`, 71 tests)       |
| MMKV checklist-run counters              | `src/lib/subscription/gate-counters.ts`                             |
| purchase / restore / trial-eligibility   | `src/lib/subscription/purchase.ts` (error normalization)            |
| Reactive Zustand store (with persist)    | `src/lib/state/subscription.ts`                                     |
| `useEntitlement()` hook                  | `src/hooks/use-entitlement.ts`                                      |
| `useCurrentProductId()` hook (for paywall)| `src/hooks/use-current-product-id.ts`                              |
| `usePaywallGate()` hook (check + open)   | `src/hooks/use-paywall-gate.ts`                                     |
| Paywall modal (3 plans, trial, switch)   | `src/app/paywall.tsx`                                               |
| Trial step (final onboarding screen)     | `src/app/(onboarding)/trial.tsx`                                    |
| Subscription card + change / manage      | `src/app/(tabs)/more.tsx`                                           |
| Gate wired into "Add account"            | `src/app/(tabs)/more.tsx` → `handleAddAccount`                      |
| Gate wired into "Reply to review"        | `src/app/(tabs)/reviews/[id].tsx` → `handleSubmit`                  |
| Gate wired into "4th checklist run/wk"   | `src/app/(tabs)/checklist.tsx` → `handleRerun`                      |

### App Store Connect setup checklist (one-time, in ASC dashboard)

For all subscription flows — especially **Monthly ↔ Yearly plan switching** —
to work without double-billing, the products MUST be configured correctly in
App Store Connect. This is independent of the code:

1. **Create a single Subscription Group** named e.g. "Release Pilot Pro".
   Apple uses subscription groups to enforce mutual exclusivity — a user
   can only have ONE active subscription per group. Without this, a
   user on Monthly who taps "Switch to Yearly" gets charged for BOTH.
2. **Put both products in that one group:**
   - `release_pilot_pro_monthly` — Monthly auto-renewing, $4.99
   - `release_pilot_pro_yearly`  — Yearly auto-renewing, $39.99
3. **Pricing tiers:** set localized prices per territory in ASC (the app
   never hardcodes them; `Purchases.getOfferings()` reads live values).
4. **Free trial / intro offer:** configure as an "Introductory Offer" on
   the yearly product → 14 days Free. Apple grants the trial ONCE per
   subscription group, per Apple ID. The paywall calls
   `Purchases.checkTrialOrIntroductoryPriceEligibility()` on mount and
   hides the "Start free trial" CTA copy for ineligible users.
5. **In RevenueCat dashboard:**
   - Map both ASC products into a single offering called `default`
   - Use the package identifiers `$rc_monthly` and `$rc_annual` (RC defaults)
   - Single entitlement called `pro` that both products grant
   - Public iOS API key → paste into `app.json` → `expo.extra.revenueCat.iosApiKey`

### Plan-switch (cross-grade) flow — what actually happens on iOS

```
User on Monthly opens paywall (taps "Change plan" in More tab)
            │
            ▼
  Paywall preselects their CURRENT plan card (CURRENT PLAN badge)
            │
            ▼
  User taps the OTHER plan (Yearly) → CTA becomes "Switch to Pro Yearly"
            │
            ▼
  `purchasePlan(yearlyPlan, { currentProductId: 'release_pilot_pro_monthly' })`
            │
            ▼
  Apple's native "Modify Subscription" sheet appears (StoreKit)
            │
            ▼  user confirms
  RC's customerInfo updates → Zustand entitlement updates →
  paywall shows "Plan updated" alert → routes home
            │
            ▼
  Apple bills: upgrade = immediate w/ prorated credit
                downgrade = takes effect end of current period
```

If the user taps their OWN current plan + CTA, the wrapper short-circuits
with `{ kind: 'already-on-plan' }` so we show our own friendly error
instead of letting Apple's confusing "you're already subscribed" alert
appear.

### NO HARDCODED PRICES

The single source of truth for prices is **App Store Connect**. To change pricing:

1. Edit the product in App Store Connect → My Apps → Subscriptions
2. RevenueCat dashboard syncs within ~5 minutes
3. App reads the new price on next launch via `Purchases.getOfferings()`

If you ever find a `$X.XX` literal in this codebase outside of `gates.test.ts`
fixtures, it's a bug — open an issue.

### Free tier (`FREE_TIER_LIMITS` in `gates.ts`)

| Feature              | Free                      | Pro            |
|----------------------|---------------------------|----------------|
| ASC accounts         | 1                         | unlimited      |
| Review replies       | 0 (read-only)             | unlimited      |
| Checklist runs / wk  | 3 (rolling 7-day window)  | unlimited      |
| Live Activity + push | yes                       | yes (same)     |

### Paywall trigger flow

```
user taps "send reply" / "add account" / "re-run checklist"
            │
            ▼
   usePaywallGate().check(reason)   ← pure, no I/O
            │
            ▼
   ┌────────┴────────┐
   │ allowed?         │
   ▼                  ▼
proceed         usePaywallGate().openPaywall(reason)
                  └─ router.push('/paywall', { reason })
                       └─ PaywallScreen reads `reason` URL param
                            → loads localized headline via `paywallCopyFor(reason)`
                            → renders sorted plans (annual / monthly / lifetime)
                            → user purchases → RC updates → store fires → modal dismisses
```

### What "Phase 7 complete" means

- 71 subscription tests passing (`npm run test:subscription`) — includes
  18 plan-switch + trial-eligibility scenarios
- App tests total: 303 across 11 files
- CLI verifier step 12 exercises all 3 gates + offering normalizer +
  entitlement deriver against mock RC shapes (no network needed; RC is
  device-only)
- Paywall modal renders 3 lifecycle states cleanly: `loading` /
  `unconfigured` / `ready`. Errors surface inline; no Alert dialogs for
  pricing failures.
- **All four subscription transitions code-complete:**
  - Free → Monthly: `purchasePlan(monthlyPlan)` → Apple sheet → entitlement.tier='pro_monthly'
  - Free → Yearly: `purchasePlan(yearlyPlan)` → Apple sheet → entitlement.tier='pro_yearly'
  - Monthly → Yearly: `purchasePlan(yearlyPlan, { currentProductId: 'release_pilot_pro_monthly' })` → Apple cross-grade sheet → immediate switch
  - Yearly → Monthly: `purchasePlan(monthlyPlan, { currentProductId: 'release_pilot_pro_yearly' })` → Apple cross-grade sheet → defers to renewal
- Restore + Manage/Cancel + Change-plan all reachable from BOTH the
  paywall and the More tab subscription card.
- Trial eligibility checked on paywall mount via RC's
  `checkTrialOrIntroductoryPriceEligibility` — "Start free trial" CTA
  copy hides automatically for users who already used their trial.
- Trial screen in onboarding pulls live price; falls back to "Loading…"
  when RC hasn't responded yet (graceful, no crash).
- Verified on-device flows still need iOS hardware (Phase 8 dev-client
  build): actual purchase / receipt validation / showManageSubscriptions.

## Phase 8 quick-reference (polish + EAS dev-client)

| Concern                                  | File                                                                |
|------------------------------------------|---------------------------------------------------------------------|
| Online/offline detection                 | `src/hooks/use-is-online.ts` (`@react-native-community/netinfo`)    |
| Global offline banner (floating overlay) | `src/components/offline-banner.tsx`                                 |
| Shimmer skeletons (row/review/checklist) | `src/components/skeleton.tsx`                                       |
| Centralised haptic helpers               | `src/lib/utils/haptics.ts` (selection / light / medium / success / warning / error) |
| Diagnostics screen (copy-to-clipboard)   | `src/app/diagnostics.tsx` + linked from `(tabs)/more.tsx`           |
| iPhone-only target                       | `app.json` → `ios.supportsTablet: false`                            |

### What changed in Phase 8

- **Loading states.** Replaced every `ActivityIndicator` in the four tabs
  with structured skeleton rows that mirror the real content shape.
  Detail screens (`releases/[id]`, review composer) still use a spinner
  because their loads are usually warm.
- **Offline UX.** Floating amber banner appears at the top of any screen
  the moment NetInfo reports no internet; auto-hides on reconnect.
  Cached data + offline reply queue mean the app stays usable.
- **Pull-to-refresh.** Now on every list (releases index, releases detail,
  reviews inbox, checklist). Each fires a light haptic on successful
  refetch — matches Apple Mail's tactile model.
- **Haptics.** Centralised in `haptics.ts`. Refresh = light; paywall block
  = warning; purchase success = success; purchase failure = error; reply
  sent = success; offline-queued reply = light. Silent no-ops on Android
  and in simulators.
- **Diagnostics.** New `More → Support → Diagnostics` screen surfaces
  build version, online status, subscription state, connected accounts,
  push registrations (first 8 chars of token only), and recent
  checklist-run count. One-tap copy-to-clipboard makes support emails
  trivial. No secrets, no PII — safe to screenshot publicly.
- **`useAllReviewsQuery`** now exposes `isFetching` and `refetch`
  separately from `isLoading`, so refresh control + skeletons can be
  styled independently.
- **Accessibility.** Filter-bar chips now have explicit `accessibilityLabel`
  (with count) and `accessibilityHint`. Skeletons are
  `accessibilityElementsHidden` so VoiceOver skips the placeholder
  ornaments.

### Dev-client EAS build runbook

The whole app is now code-complete. To run it on a real iPhone, you need
exactly **one** EAS build (it becomes your dev-client; afterwards, every
JS/TS change ships via `npm start` over LAN — no rebuild needed).

Prerequisites:

```powershell
# One-time, only if you don't have eas-cli installed
npm install -g eas-cli

# Interactive login (opens browser)
eas login

# Links this project to a new Expo project (writes projectId into app.json)
eas init --id <leave-blank-to-let-EAS-create-one>
```

Build:

```powershell
# Triggers a cloud build on EAS's macOS workers (Xcode 26 image already pinned in eas.json)
eas build --profile development --platform ios

# When it asks "Generate a new Apple Distribution Certificate?" → yes
# When it asks "Generate a new ASC API key?" → use existing if you already have one
# Build takes ~25-40 mins on EAS free tier
```

Install on device:

1. Open the URL EAS prints when the build finishes (or run `eas build:list`)
2. On the iPhone, open that URL in Safari → tap "Install" → enter your passcode
3. Trust the developer profile under Settings → General → VPN & Device Management

Run the JS:

```powershell
# Start Metro
npm start

# In the dev-client app on the phone, tap "Enter URL manually" and paste
# the LAN URL Metro prints (e.g. http://192.168.1.42:8081)
```

Required runtime config before launch:

| Setting                      | Where                                                          |
|------------------------------|----------------------------------------------------------------|
| RevenueCat Apple public key  | `app.json` → `expo.extra.revenueCat.iosApiKey`                |
| Worker URL                   | `app.json` → `expo.extra.workerUrl` (after worker deploy)      |
| EAS project ID               | `app.json` → `expo.extra.eas.projectId` (auto-filled by `eas init`) |
| Updates URL                  | `app.json` → `expo.updates.url` (auto-filled by `eas init`)   |
| ASC submit appId             | `eas.json` → `submit.production.ios.ascAppId` (after app reg) |

### Post-build test checklist (on the real iPhone)

Verify these by walking through the app once on device:

- [ ] Onboarding flow completes; Face ID prompt fires on first ASC fetch
- [ ] Releases tab loads with skeleton → real data → live state badges
- [ ] Pull-to-refresh fires a light haptic
- [ ] Reviews tab shows aggregated inbox; filters work; reply submits (and
      queues if you toggle airplane mode mid-send)
- [ ] Checklist tab runs all 10 rules; failures surface ASC deep links
- [ ] More tab: tap "Upgrade to Pro" → paywall opens with live prices
      (NOT $X.XX placeholders); restore button works
- [ ] Diagnostics screen renders; copy-to-clipboard puts data into Notes
- [ ] Toggle airplane mode → offline banner appears within ~1s; cached
      data still renders; banner auto-hides on reconnect
- [ ] Long-press the app icon → "Open Diagnostics" works (TODO: add
      Shortcuts integration in V1.5 — out of scope for MVP)
- [ ] Add widget to home screen → renders 1-3 app states from App Group
- [ ] Trigger a release state change in ASC (e.g. submit a build) → push
      arrives within 15 min; Live Activity starts; widget refreshes

### Known limitations shipped as v1

- **iPhone-only** by design (`supportsTablet: false`). iPad support is a
  V1.5 feature gate decision; the layouts already adapt fine but we
  haven't audited iPad-specific assets.
- **No Apple Watch app.** Watch companion was descoped from MVP per the
  RELEASE_PILOT_V1_PLAN.md scope cuts.
- **No widget configuration UI** (IntentConfiguration). The widget shows
  all connected apps in priority-state order; a future version will let
  users pick which apps appear.
- **No localizations.** English-only. RC handles localized currency on
  the paywall automatically.

## Pre-build audit (last run before EAS development build)

Run on Windows host; mirrors what an EAS macOS worker would see.

### Versions — MUST stay in lockstep

| File                 | Field                         | Value     |
|----------------------|-------------------------------|-----------|
| `app.json`           | `expo.version`                | `1.0.0`   |
| `package.json`       | `version`                     | `1.0.0`   |
| `package-lock.json`  | `version` + `packages[""]`    | `1.0.0`   |

iOS-specific build numbers:

| File       | Field                          | Value             |
|------------|--------------------------------|-------------------|
| `app.json` | `expo.ios.buildNumber`         | `"1"`             |
| `app.json` | `expo.version`                 | `"1.0.0"`         |

When you bump `version`, bump it in **all three** files and increment
`ios.buildNumber` by 1.

### Native module ↔ plugin / autolink matrix

| Module                         | Status                              |
|--------------------------------|-------------------------------------|
| `expo-router`                  | Config plugin ✅                    |
| `expo-splash-screen`           | Config plugin ✅                    |
| `expo-local-authentication`    | Config plugin (FaceID copy) ✅     |
| `expo-notifications`           | Config plugin ✅                    |
| `expo-build-properties`        | Config plugin (static frameworks) ✅|
| `expo-secure-store`            | Config plugin ✅                    |
| `expo-sqlite`                  | Config plugin ✅                    |
| `expo-web-browser`             | Config plugin ✅                    |
| `@bacons/apple-targets`        | Config plugin (widget + notif-svc) ✅|
| `expo-haptics`                 | Autolink only ✅                    |
| `expo-application`             | Autolink only ✅                    |
| `expo-clipboard`               | Autolink only ✅                    |
| `expo-background-fetch`        | Autolink only (modes in infoPlist) ✅|
| `expo-task-manager`            | Autolink only (BGTask IDs in infoPlist) ✅|
| `expo-dev-client`              | Autolink only ✅                    |
| `react-native-purchases` v10   | Autolink only (no plugin since v8) ✅|
| `react-native-mmkv` v4         | Autolink only (Nitro modules) ✅    |
| `react-native-nitro-modules`   | Autolink only ✅                    |
| `@react-native-community/netinfo` | Autolink only ✅                  |
| `react-native-reanimated` v4   | Babel plugin (`react-native-worklets/plugin`) auto-included by `babel-preset-expo` ✅|
| `react-native-svg`             | Autolink only ✅                    |
| `react-native-safe-area-context` | Autolink only ✅                  |
| `react-native-screens`         | Autolink only ✅                    |
| `react-native-gesture-handler` | Autolink only ✅                    |
| `@react-native-async-storage/async-storage` | Autolink only ✅       |
| `asc-jwt` (local Expo module)  | `expo-module.config.json` registers `AscJwtModule` ✅|
| `live-activity` (local)        | Registers `LiveActivityModule` ✅   |
| `widget-data` (local)          | Registers `WidgetDataModule` ✅     |

No `babel.config.js` is needed — `babel-preset-expo` v56 auto-detects
`react-native-worklets` and registers its Babel plugin. Adding an
explicit babel config would risk losing this auto-detection.

### Config files audited

| File                       | Status                                              |
|----------------------------|-----------------------------------------------------|
| `app.json`                 | iOS-only, valid bundleId, all 9 plugins resolve ✅  |
| `eas.json`                 | Development + production profiles, Xcode 26 pinned ✅|
| `tsconfig.json`            | Strict mode + path aliases ✅                       |
| `eslint.config.js`         | `eslint-config-expo/flat` ✅                        |
| `package.json` + lock      | Versions match, all deps Expo-SDK-compatible (`npx expo install --check` clean) ✅|
| `targets/widget/expo-target.config.js` | App Group entitlement, iOS 17, WidgetKit + ActivityKit ✅|
| `targets/notif-service/expo-target.config.js` | UserNotifications framework ✅|
| `modules/*/expo-module.config.json` | Each registers exactly one iOS module ✅|

There is intentionally no `babel.config.js`, no `metro.config.js`, and
no `ios-build.yml` — Expo's defaults are correct, and CI runs through
the `eas` CLI rather than a custom GitHub Actions workflow.

### Native target hygiene (cleaned this pass)

- **Removed** `targets/widget/Widget.swift` — Phase 0 stub that had its
  own `@main` annotation, which would have collided with
  `WidgetBundle.swift`'s `@main` and broken the Xcode build.
- **Removed** `targets/live-activity/` entirely — vestigial duplicate
  extension defining `ReleasePilotActivityAttributes`, conflicting with
  the real `ReleaseActivityAttributes` in `targets/widget/`. Its
  `expo-target.config.js` also referenced a non-existent
  `assets/widget-icon.png`.

After cleanup, exactly **two** native extensions ship:

1. `targets/widget/` — single WidgetBundle that registers both
   `ReleasesWidget` (home + lock screen) and `ReleaseLiveActivity`
   (Dynamic Island + lock-screen banner).
2. `targets/notif-service/` — Notification Service Extension for push
   payload mutation in Phase 5+.

### Apple iOS standards

| Item                                          | Status |
|-----------------------------------------------|--------|
| Privacy strings (FaceID)                      | ✅ `NSFaceIDUsageDescription` |
| Required-reason API declarations              | ✅ UserDefaults, FileTimestamp, DiskSpace, SystemBootTime |
| `ITSAppUsesNonExemptEncryption`               | ✅ `false` (HTTPS-only; standard crypto exempt) |
| `aps-environment` entitlement                 | ✅ `development` (eas.json), `production` (release builds) |
| App Group entitlement                         | ✅ `group.app.releasepilot.shared` (main + widget + notif-svc) |
| `NSSupportsLiveActivities`                    | ✅ `true` |
| `NSSupportsLiveActivitiesFrequentUpdates`     | ✅ `true` |
| Background modes                              | ✅ fetch, processing, remote-notification |
| BGTask identifiers in infoPlist match registered task | ✅ `app.releasepilot.poll` |
| Minimum touch target 44×44 pt                 | ✅ Audited; bumped `minHeight: 44` on reply composer Send/Templates and checklist app-picker chip; filter chips have `hitSlop={8}` (effective 46pt) |
| iPhone-only                                   | ✅ `supportsTablet: false` |
| Native iOS slide transitions                  | ✅ Set explicitly on inner Stacks (releases, reviews) and onboarding |
| Keyboard avoidance                            | ✅ `KeyboardAvoidingView` wraps reply composer + p8 paste field |
| Pressable feedback                            | ✅ Every Pressable applies opacity on `pressed` |
| VoiceOver labels + hints                      | ✅ All interactive elements; skeletons hidden |

### Quality gates (all green this pass)

```text
npm run typecheck   → 0 errors
npm run lint        → 0 problems
npm test            → 285/285 passing across 11 files
npx expo-doctor     → 21/21 checks passed
npx expo install --check → Dependencies are up to date
```

### What still needs human input before / after the build

1. **Before `eas build`**:
   - `eas init` to write the EAS `projectId` into `app.json`.
   - Fill `expo.extra.revenueCat.iosApiKey` with the real RC public Apple key.
   - (Optional) Fill `expo.extra.workerUrl` once the Cloudflare Worker is deployed.

2. **After the build is installed on a real iPhone**:
   - Walk the post-build test checklist above.
   - The placeholder `eas.json` → `submit.production.ios.ascAppId` only
     matters when you run `eas submit` for the App Store — not for dev.

## Edge-case hardening pass (post-Phase 8)

The following user-confusion paths are now explicitly handled. Each has a
test and/or runtime check; do not regress these without re-validating.

| Edge case                                                            | Where it's handled                                                                                                              | What the user sees                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **One ASC account fails, others work**                               | `useAllAppsQuery` (`asc-queries.ts`) → `Promise.allSettled`; failures surfaced in Releases tab as amber `ErrorBanner`           | Working apps still render; banner names the broken account and offers Retry                                 |
| **All ASC accounts fail**                                            | Same hook re-throws the first error; existing Releases-tab error banner triggers                                                | Full-screen error banner + Retry CTA                                                                        |
| **App name or bundleId empty/null in ASC response**                  | `useAllAppsQuery` maps to `(Unnamed app)` / `—`; covered by `multi-account-degradation.test.ts`                                 | Row still renders; no blank chips                                                                           |
| **User cancels subscription in iOS Settings, returns to app**        | `useSubscriptionLifecycleWatcher` (root layout): AppState listener calls `refreshSubscriptionState()` on every foreground       | One-shot Alert: "Pro is no longer active …" with path to re-subscribe                                       |
| **Apple billing retry / grace period**                               | `GracePeriodBanner` (root layout) reads `entitlement.isInGracePeriod`                                                           | Persistent amber banner; tap → opens iOS Subscriptions to update payment                                    |
| **Notifications were denied, user enables in Settings, returns**     | `useNotificationPermission` re-polls on app foreground                                                                          | More tab status row flips from red `BellOff` "Disabled" → green `CheckCircle2` "Enabled" without app reload |
| **Reply queued offline, network returns later**                      | `useReplyQueueDrainer` (root layout): NetInfo offline→online and AppState→active drain the queue                                | Pending replies flip from "Sending…" to "Replied" automatically; auth failures dropped so user can re-send  |
| **Reply queued, account was removed before drain**                   | Drainer drops orphaned replies (no key to sign with)                                                                            | Pending state disappears; review goes back to "no reply"                                                    |
| **Onboarding interrupted mid-paste (app backgrounded)**              | `useOnboardingDraft` persists `issuerId` + `keyId` to MMKV via `partialize`; **p8 is NEVER persisted**                          | On return, the two GUID fields are pre-filled; only the private key needs re-paste                          |

### Files added in this pass

- `src/hooks/use-subscription-lifecycle-watcher.ts` — AppState refresh + Pro→Free alert
- `src/hooks/use-reply-queue-drainer.ts` — NetInfo + AppState driven offline-queue drainer
- `src/hooks/use-notification-permission.ts` — reactive notification permission status
- `src/components/grace-period-banner.tsx` — floating banner for billing-retry state
- `src/lib/api/multi-account-degradation.test.ts` — 16 new tests for the partial-failure path

### Test count after this pass

| File                                          | Tests   |
| --------------------------------------------- | ------- |
| `asc-errors.test.ts`                          | 24      |
| **`multi-account-degradation.test.ts`** (new) | **16**  |
| `credentials.test.ts`                         | 25      |
| `team-name.test.ts`                           | 7       |
| `cache-utils.test.ts`                         | 21      |
| `checklist-rules.test.ts`                     | 40      |
| `live-activity-sync.test.ts`                  | 21      |
| `review-feed.test.ts`                         | 43      |
| `state-machine.test.ts`                       | 17      |
| `version-events.test.ts`                      | 21      |
| `subscription` (`gates.test.ts`)              | 71      |
| `date-format.test.ts`                         | 13      |
| **Total**                                     | **319** |

### Build environment requirement (do NOT downgrade)

`eas.json` pins the iOS build image to **`macos-tahoe-26.4-xcode-26.4`** for ALL
profiles (development / preview / production). This is the minimum supported
toolchain for Expo SDK 56 / React Native 0.85.

**Why this matters:** `expo-modules-jsi@56.0.x` uses `weak let` declarations
(per [SE-0481](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0481-weak-let.md))
and `Sendable` mutable properties that the Swift 6.3 compiler shipped in
Xcode 26.4 understands correctly. Older images:

- `macos-sequoia-15.6-xcode-26.0` → Swift 6.2, rejects `weak let` with
  **15 hard compile errors** in `expo-modules-jsi/apple/Sources/...` —
  build fails in the Run Fastlane phase. Confirmed by Expo issue #46242.
- `macos-sequoia-15.6-xcode-26.1` → same Swift 6.2.x, same failure.

If you ever see the error `'weak' must be a mutable variable, because it
may change at runtime`, **the fix is the image, not the source code** — do
NOT patch-package node_modules/expo-modules-jsi.

### ActivityKit cross-target type sharing (READ BEFORE EDITING)

`ReleaseActivityAttributes` is defined in **two physical files** with
byte-identical contents:

| File | Compiled into | Used by |
| --- | --- | --- |
| `modules/live-activity/ios/ReleaseActivityAttributes.swift` | Pod `LiveActivity` (main app) | `LiveActivityModule.swift` calls `Activity<ReleaseActivityAttributes>.request(...)` |
| `targets/widget/ReleaseActivityAttributes.swift` | Extension `ReleasePilotWidget` | `ReleaseLiveActivity.swift` calls `ActivityConfiguration(for: ReleaseActivityAttributes.self)` |

**Why two copies, not one shared file?** Swift modules are isolated.
The Pod and the widget extension compile into **different Swift modules**
(`LiveActivity` and `ReleasePilotWidget`), so they cannot import each
other's types. The two practical alternatives are:

1. Add the same file to both targets via Xcode Target Membership — **not
   editable** from `expo-target.config.js` (apple-targets regenerates the
   project on every prebuild).
2. Create an SPM package both targets depend on — apple-targets does not
   currently emit a real SPM, and Pods cannot easily depend on a local
   package added to the extension.

Duplication is the only pragmatic path. **ActivityKit bridges the two
types at the system level via Codable serialization** — as long as field
names + types + Codable encoding match, the widget process correctly
decodes the payloads the app sends.

If you change ANY field, you MUST update BOTH files in the same commit.
A divergence between them silently drops activity payloads on the widget
side — the Lock-Screen banner just disappears.

Past build failure that proves this: build `56106af9` failed with
12 errors of the form `cannot find type 'ReleaseActivityAttributes' in
scope` because the struct only existed inside `ReleaseLiveActivity.swift`
in the widget target. Resolved by extracting it into a sibling file in
both `modules/live-activity/ios/` and `targets/widget/`.

### CryptoKit vs swift-crypto API surface (READ BEFORE EDITING `AscJwtModule.swift`)

Apple's **built-in `CryptoKit`** framework and the open-source
**`swift-crypto`** package look interchangeable in source but have
**different API surfaces**. Some methods that exist in `swift-crypto`
are NOT in Apple's `CryptoKit`:

| Initializer | Apple CryptoKit | swift-crypto | Accepts PKCS#8? |
| --- | --- | --- | --- |
| `init(rawRepresentation:)` | iOS 13+ | yes | no — 32-byte scalar only |
| `init(x963Representation:)` | iOS 13+ | yes | no — ANSI X9.63 only |
| `init(derRepresentation:)` | iOS 14+ | yes | **yes** (tries PKCS#8 first, falls back to SEC1) |
| `init(pemRepresentation:)` | iOS 14+ | yes | **yes** (both PKCS#8 and SEC1 envelopes) |
| `init(pkcs8DERRepresentation:)` | ❌ **NOT AVAILABLE** | yes | n/a |
| `init(pkcs8PEMRepresentation:)` | ❌ **NOT AVAILABLE** | yes | n/a |

We use Apple's built-in `CryptoKit` (no `swift-crypto` dependency).

**Canonical pattern for App Store Connect / APNs `.p8` keys**
(used by `APNSwift`, Apple's WWDC2020 sample code, and every published
ASC JWT-signing example in Swift):

```swift
let key = try P256.Signing.PrivateKey(pemRepresentation: p8PEM)
```

This is what `parseP8PrivateKey(pem:)` uses as its primary path.
A defense-in-depth fallback strips headers and tries
`init(derRepresentation:)` for users who paste a malformed PEM.

**Pitfall:** if you ever see `error: no exact matches in call to
initializer` on `P256.Signing.PrivateKey(...)`, you almost certainly
wrote `pkcs8DERRepresentation:` — that's swift-crypto-only.
Change it to `pemRepresentation:` (preferred) or `derRepresentation:`.
Confirmed by build 7506a588 (Xcode 26.4, Swift 6.3).

### Don't-regress invariants

1. Every hook in the "Files added in this pass" list is mounted exactly
   once, inside the `<GlobalWatchers />` component in `app/_layout.tsx`.
   Don't duplicate-mount them inside tabs. CRITICAL: `<GlobalWatchers />`
   MUST live INSIDE `<QueryClientProvider>` because
   `useReplyQueueDrainer` calls `useQueryClient()` — moving it up to
   `RootLayout` itself throws "No QueryClient set" on first render.
2. The grace-period banner must stack BELOW the offline banner when both
   are visible (see `GracePeriodBanner.tsx` `top` calc).
3. `useOnboardingDraft.partialize` MUST only persist `issuerId` and
   `keyId`. Never add `p8PEM` to that list — it would write the private
   key to MMKV (un-encrypted) in violation of the trust model.
4. `useAllAppsQuery` returns `{ apps, failures }`, NOT a bare array. Any
   new consumer must read `data?.apps`.
5. The subscription lifecycle watcher throttles the Pro→Free alert at
   30s to avoid duplicate alerts during RC sync storms.
6. `ReleaseActivityAttributes` MUST stay byte-identical in both
   `modules/live-activity/ios/` and `targets/widget/`. See "ActivityKit
   cross-target type sharing" above.
7. `AscJwtModule.swift` MUST use `P256.Signing.PrivateKey(pemRepresentation:)`
   as the primary parse path (canonical Apple pattern), with
   `derRepresentation:` as a fallback. NEVER use `pkcs8DERRepresentation:` —
   see "CryptoKit vs swift-crypto API surface" above.

