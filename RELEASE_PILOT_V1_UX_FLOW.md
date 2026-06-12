# Release Pilot — V1 UX Flow & Screens

> Companion to `RELEASE_PILOT_V1_PLAN.md` + `RELEASE_PILOT_V1_TECH_DESIGN.md`
> Status: Draft 2 — state model updated to 7 plain-English states
> Goal: Zero user confusion. Every tap leads to an obvious next step.
> Author: Senthil
> Last updated: 2026-06-11

## CHANGES vs Draft 1 (2026-06-11)

Per review with Senthil, the state model is now **7 plain-English states**
instead of 6 (Draft 1 conflated "Approved" and "Live on App Store"):

| Our label | Was in Draft 1 | Maps to ASC raw |
|---|---|---|
| Drafting | Drafting | PREPARE_FOR_SUBMISSION |
| Submitted | Submitted | WAITING_FOR_REVIEW |
| In Review | In Review | IN_REVIEW |
| **Approved · waiting for you** | _(missing)_ | PENDING_DEVELOPER_RELEASE |
| **Approved · scheduled** | _(missing)_ | PENDING_APPLE_RELEASE |
| **Live on App Store** | "Ready for Sale" _(confusing!)_ | READY_FOR_SALE |
| Rejected | Rejected | REJECTED / METADATA_REJECTED |

Every state badge now also exposes a "?" info icon on long-press that shows
both the friendly explanation AND the raw ASC enum (for power users who
already know Apple's vocabulary).

**Source of truth:** `app/src/constants/theme.ts` — `StateColors`,
`StateLabels`, `StateShortLabels`, `StateIcons`, `StateHelp`. Every UI
surface (lists, detail views, widgets, Live Activity, notifications)
imports from there. There is one shared component: `<StateBadge />`.

The wireframes below still show "Ready for Sale" in places — treat that
as legacy text. The implementation uses the new labels.

---

---

## 0. UX north stars

Five rules every screen must follow:

1. **One job per screen.** If a screen does two unrelated things, split it.
2. **Empty states are real screens.** Not afterthoughts. They explain the value and offer the next action.
3. **Loading states never block thinking.** Skeleton/shimmer for lists; spinner only for explicit user-initiated actions.
4. **Error states are user-actionable.** Every error tells the user what to do next. Never `String(describing: error)`.
5. **Cancel is always one tap away.** No modal traps. No "are you sure?" upsells.

---

## 1. Information architecture

```
                            ┌─────────────────┐
                            │   Cold Launch    │
                            └────────┬────────┘
                                     │
                ┌────────────────────┴────────────────────┐
                │                                          │
       ┌────────▼────────┐                       ┌─────────▼────────┐
       │  No Account     │                       │   Has Account    │
       │  → Onboarding   │                       │   → Root Tabs    │
       └─────────────────┘                       └──────────────────┘

                  ROOT TAB BAR (4 tabs, iOS HIG max-meaningful = 5)

           ┌──────────────┬──────────────┬─────────────┬──────────────┐
           │   Releases   │   Reviews    │  Checklist  │     More     │
           │   ⬆.right    │ ⭐ star.bub  │ ✓ checkmark │  ⋯ ellipsis  │
           └──────────────┴──────────────┴─────────────┴──────────────┘
```

### Why this tab structure?

- **Releases (default tab):** The single most-checked surface — release status — is one tap from cold launch.
- **Reviews:** Unified inbox across all apps. Industry standard pattern (Gmail, Linear).
- **Checklist:** Pre-submit runner. Discrete job → discrete tab.
- **More:** Settings, Accounts, Subscription, Help. Apple's own pattern (Mail, Music, App Store).

We considered:
- 5 tabs (with Apps separate from Releases) → rejected; Apps and Releases are the same mental model
- Sidebar on iPad → V1.5; iPad uses split-view-friendly NavigationStack but no sidebar in V1
- Single root with custom segmented nav → rejected; tab bar is the iOS muscle memory

---

## 2. Onboarding flow (the make-or-break)

Goal: connected ASC account in **under 4 minutes**, including the user fetching their p8 key.

```
[Welcome] → [Why we need ASC] → [Get your key] → [Paste credentials]
   ↓             ↓                    ↓                  ↓
   ↓             ↓                    ↓        [Verifying...] (2-4s)
   ↓             ↓                    ↓                  ↓
   ↓             ↓                    ↓        [Success — N apps found]
   ↓             ↓                    ↓                  ↓
   ↓             ↓                    ↓        [Enable notifications]
   ↓             ↓                    ↓                  ↓
   ↓             ↓                    ↓        [Start free trial?]
   ↓             ↓                    ↓                  ↓
   ↓             ↓                    ↓        [Releases tab — done]
```

7 screens. Each can be skipped if non-blocking; only credentials is required.

---

### Screen 1 — Welcome

```
┌───────────────────────────────────┐
│                                   │
│                                   │
│         ✈ Release Pilot           │
│                                   │
│   App Store Connect, on your      │
│         home screen.              │
│                                   │
│   ┌─────────────────────────────┐ │
│   │  [animated mockup of a      │ │
│   │   Lock Screen showing a     │ │
│   │   Live Activity:            │ │
│   │   "Recall v2.0  ·  In       │ │
│   │   Review · 14m"]            │ │
│   └─────────────────────────────┘ │
│                                   │
│      ─────────────────────        │
│                                   │
│   ┌─────────────────────────────┐ │
│   │       Get Started            │ │  ← primary CTA
│   └─────────────────────────────┘ │
│                                   │
│   I already have an account →    │  ← tertiary, restore flow
│                                   │
└───────────────────────────────────┘
```

**Why this works:**
- Shows the differentiating feature (Lock Screen) within 2 seconds of opening
- Single primary action (no decision paralysis)
- "I already have an account" routes to restore-purchases, not signup

---

### Screen 2 — Why we need ASC API

```
┌───────────────────────────────────┐
│  ←                                │
│                                   │
│         🔑                        │
│                                   │
│   Connect your App Store          │
│   Connect account                 │
│                                   │
│   We need read-only access to     │
│   your apps, builds, and reviews  │
│   from App Store Connect.         │
│                                   │
│   ✓ Stays on your device          │
│     Your API key never leaves     │
│     your iPhone.                  │
│                                   │
│   ✓ Read-only by default          │
│     Only review replies write.    │
│                                   │
│   ✓ Revoke anytime                │
│     In App Store Connect → Users  │
│     and Access → Keys.            │
│                                   │
│   ┌─────────────────────────────┐ │
│   │     I'll set this up         │ │  ← primary
│   └─────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
```

**Why this works:**
- Addresses the #1 trust objection BEFORE asking for the key
- Three short bullet points; no wall of text
- "I'll set this up" sets expectation that this is a one-time setup

---

### Screen 3 — Get your key (instructional)

```
┌───────────────────────────────────┐
│  ←                                │
│                                   │
│   3 things to grab                │
│                                   │
│   Open App Store Connect on your  │
│   Mac (or iPad) and head to       │
│   Users and Access → Integrations │
│   → Keys.                         │
│                                   │
│   ┌─────────────────────────────┐ │
│   │  📷 [screenshot of ASC web  │ │
│   │      Keys page with         │ │
│   │      Issuer ID highlighted] │ │
│   └─────────────────────────────┘ │
│                                   │
│   1. Tap "Generate API Key"       │
│      Name: "Release Pilot"        │
│      Access: App Manager          │
│                                   │
│   2. Copy the Issuer ID (top of   │
│      page — looks like a GUID)    │
│                                   │
│   3. Copy the Key ID (under your  │
│      new key — 10 characters)     │
│                                   │
│   4. Download the .p8 file        │
│      You can only do this once!   │
│                                   │
│   ┌─────────────────────────────┐ │
│   │   I have all three           │ │  ← primary
│   └─────────────────────────────┘ │
│                                   │
│   Open ASC in Safari →           │  ← opens https://appstoreconnect.apple.com/access/integrations/api
│                                   │
└───────────────────────────────────┘
```

**Why this works:**
- Numbered steps (matches "3 things to grab" headline)
- Warning about ".p8 only downloadable once" surfaced inline (prevents the #1 onboarding-failure cause)
- Deep link to the exact ASC page

---

### Screen 4 — Paste credentials

```
┌───────────────────────────────────┐
│  ←                                │
│                                   │
│   Paste your credentials          │
│                                   │
│   Issuer ID                       │
│   ┌─────────────────────────────┐ │
│   │ 57246542-1234-5678-9abc...  │ │
│   └─────────────────────────────┘ │
│   Looks like a GUID               │
│                                   │
│   Key ID                          │
│   ┌─────────────────────────────┐ │
│   │ ABC123XYZ4                  │ │
│   └─────────────────────────────┘ │
│   10 characters                   │
│                                   │
│   Private Key (.p8)               │
│   ┌─────────────────────────────┐ │
│   │ -----BEGIN PRIVATE KEY----- │ │
│   │ MIGHAgEAMBMGByqGSM49AgEG... │ │
│   │ ...                          │ │
│   │ -----END PRIVATE KEY-----   │ │
│   └─────────────────────────────┘ │
│   Paste the entire .p8 file       │
│   contents (including header)     │
│                                   │
│   ┌─────────────────────────────┐ │
│   │        Connect               │ │  ← primary (disabled until all 3 valid)
│   └─────────────────────────────┘ │
│                                   │
│   🛡  Stored locally with Face ID │
│                                   │
└───────────────────────────────────┘
```

**Inline validation (as user types):**
- Issuer ID: regex `^[0-9a-fA-F-]{36}$` → green check or red note
- Key ID: regex `^[A-Z0-9]{10}$` → green check or red note
- p8: must start with `-----BEGIN PRIVATE KEY-----` and end with `-----END PRIVATE KEY-----` → green check or red note
- All three valid → "Connect" button enables

**Convenience:**
- Each field shows a "Paste" button when iOS clipboard contains likely-matching content (UIPasteboard hint)
- p8 field auto-grows; doesn't constrain to one line

---

### Screen 5 — Verifying (transient, 2–4s)

```
┌───────────────────────────────────┐
│                                   │
│                                   │
│                                   │
│         ⟳ (spinner)               │
│                                   │
│      Connecting to App Store      │
│            Connect...             │
│                                   │
│                                   │
│      Signing token...             │
│      ✓ Fetching apps...          │
│                                   │
│                                   │
└───────────────────────────────────┘
```

**Steps shown to user (each ticks off as it completes):**
1. Signing JWT
2. Fetching apps

If failure: jump to error screen 5b (below) rather than this success path.

---

### Screen 5b — Verifying error

```
┌───────────────────────────────────┐
│  ←                                │
│                                   │
│         ⚠                         │
│                                   │
│   Couldn't connect                │
│                                   │
│   The App Store Connect API       │
│   rejected these credentials.     │
│                                   │
│   Likely cause: the .p8 contents  │
│   don't match this Key ID. Did    │
│   you paste a different key file? │
│                                   │
│   ┌─────────────────────────────┐ │
│   │     Try again                │ │  ← primary, returns to screen 4 with values preserved
│   └─────────────────────────────┘ │
│                                   │
│   Get help →                      │  ← opens email composer to support
│                                   │
└───────────────────────────────────┘
```

**Failure-specific messages:**
- `401 Unauthorized` → "The .p8 contents don't match this Key ID"
- `403 Forbidden` → "This key has insufficient permissions. Generate a new key with 'App Manager' access."
- Network error → "Can't reach App Store Connect. Check your internet and try again."

---

### Screen 6 — Success / enable notifications

```
┌───────────────────────────────────┐
│                                   │
│       ✓ Connected                 │
│                                   │
│   Recall Studio                   │
│   3 apps found                    │
│                                   │
│   ┌──────┬──────┬──────┐         │
│   │ icon │ icon │ icon │         │  ← preview of the 3 apps
│   │Recall│ TVHub│ ScanX│         │
│   └──────┴──────┴──────┘         │
│                                   │
│   ─────────────────────           │
│                                   │
│   Get pushed when a release       │
│   changes state                   │
│                                   │
│   We'll send a notification when  │
│   a version moves through         │
│   review — no more F5'ing ASC.    │
│                                   │
│   ┌─────────────────────────────┐ │
│   │     Enable notifications     │ │  ← primary; triggers system prompt
│   └─────────────────────────────┘ │
│                                   │
│   Not now                         │  ← skip; can enable in Settings
│                                   │
└───────────────────────────────────┘
```

---

### Screen 7 — Start trial / paywall

```
┌───────────────────────────────────┐
│                                   │
│   Start your 14-day free trial    │
│                                   │
│   Indie                           │
│   $9.99/month   $69/year (-42%)   │
│                                   │
│   ✓ Up to 3 apps                  │
│   ✓ Lock Screen Live Activity     │
│   ✓ All widget sizes              │
│   ✓ Reply to reviews              │
│   ✓ Pre-submit checklist          │
│   ✓ Push notifications            │
│                                   │
│   ┌─────────────────────────────┐ │
│   │  Start 14-day free trial     │ │  ← primary; opens StoreKit sheet
│   │     then $9.99/month         │ │
│   └─────────────────────────────┘ │
│                                   │
│   Continue with free plan         │  ← tertiary
│                                   │
│   Restore purchases · Terms · Privacy │  ← legal row
│                                   │
└───────────────────────────────────┘
```

**Why this works:**
- Trial CTA shows price BELOW the button (no "gotcha" after tap)
- "Continue with free plan" is visible, not buried
- Restore purchases is on the paywall (Apple HIG requirement) AND in Settings

---

## 3. Root: Releases tab (default landing)

### 3a. With apps (the 95% case)

```
┌───────────────────────────────────┐
│  Releases                  + Add  │  ← +Add deep-links to Settings → Accounts
├───────────────────────────────────┤
│  [Recall Studio  ⌄]              │  ← team picker (hidden if 1 team)
├───────────────────────────────────┤
│                                   │
│  ┌─────────────────────────────┐ │
│  │ 📱 Recall                    │ │
│  │    v2.0 (45)                 │ │
│  │    ● In Review · 14m         │ │  ← yellow dot = in review
│  │    Submitted 2 hours ago     │ │
│  └─────────────────────────────┘ │
│                                   │
│  ┌─────────────────────────────┐ │
│  │ 📱 TVHub                     │ │
│  │    v1.8 (12)                 │ │
│  │    ● Ready for Sale          │ │  ← green dot
│  │    Released 3 days ago       │ │
│  └─────────────────────────────┘ │
│                                   │
│  ┌─────────────────────────────┐ │
│  │ 📱 ScanX                     │ │
│  │    v1.0 (3)                  │ │
│  │    ● Prepare for Submission  │ │  ← gray dot
│  │    Draft saved 5 days ago    │ │
│  └─────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
  [Releases] [Reviews] [Checklist] [More]
```

**Interactions:**
- Tap row → app detail (see §3c)
- Pull to refresh → re-fetches version states
- Long-press row → context menu: "Add widget for this app", "Mute notifications", "Open in ASC"
- Team picker only visible if 2+ teams; tapping shows action sheet to switch

---

### 3b. Empty state (first launch after onboarding)

If onboarding succeeded but the team has 0 apps (rare; happens for brand new dev accounts):

```
┌───────────────────────────────────┐
│  Releases                         │
├───────────────────────────────────┤
│                                   │
│        ✈                          │
│                                   │
│   No apps yet                     │
│                                   │
│   This Apple Developer team       │
│   doesn't have any apps in        │
│   App Store Connect yet.          │
│                                   │
│   Create your first app in ASC,   │
│   then pull to refresh.           │
│                                   │
│   ┌─────────────────────────────┐ │
│   │   Open App Store Connect    │ │
│   └─────────────────────────────┘ │
│                                   │
│   Add another team →              │
│                                   │
└───────────────────────────────────┘
```

---

### 3c. App detail

```
┌───────────────────────────────────┐
│  ←  Recall              ⋯         │  ← ⋯ menu: Add widget, Mute, Open in ASC
├───────────────────────────────────┤
│  ┌──┐  Recall                     │
│  │📱│  com.example.recall          │
│  └──┘  v2.0 (45)                   │
│                                   │
│  ● In Review                      │  ← state pill, full width, accent-tinted
│    14 minutes in this state       │
│    Submitted Wed 2:14 PM (2h ago) │
│                                   │
│  ─────────────────────            │
│                                   │
│  Timeline                         │
│                                   │
│  ●  In Review                     │
│  │  Wed 4:28 PM · 14m ago         │
│  │                                │
│  ●  Waiting for Review            │
│  │  Wed 2:14 PM · 2h 14m ago      │
│  │                                │
│  ●  Build uploaded                │
│     Wed 1:58 PM · 2h 30m ago      │
│                                   │
│  ─────────────────────            │
│                                   │
│  Previous versions          See all →
│                                   │
│  v1.9 (44) · Live since 3 days ago│
│  v1.8 (43) · Live since 2 weeks   │
│                                   │
│  ─────────────────────            │
│                                   │
│  ⭐ 4 new reviews                  │  ← deep links to Reviews tab filtered to this app
│  ✓ Last checklist run: 2 days ago │  ← deep links to Checklist tab
│                                   │
└───────────────────────────────────┘
```

**Interactions:**
- Pull-to-refresh
- Timeline rows are tappable → expands to show transition metadata (build number, submitter)
- "Add widget for this app" in ⋯ menu → screen 6 widget walkthrough sheet

---

### 3d. Loading state (cold launch with no cached data — rare after first use)

```
┌───────────────────────────────────┐
│  Releases                  + Add  │
├───────────────────────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░             │  ← shimmer placeholders
│  ░░░░░░░░░░░░░░░                  │
│  ░░░░░░░░░                        │
│                                   │
│  ░░░░░░░░░░░░░░░░░░░░             │
│  ░░░░░░░░░░░░░░░                  │
│  ░░░░░░░░░                        │
│                                   │
└───────────────────────────────────┘
```

Shimmer never lasts more than 2s; if API hangs, drop into error state.

---

### 3e. Error state (network)

```
┌───────────────────────────────────┐
│  Releases                  + Add  │
├───────────────────────────────────┤
│  ⚠  You're offline                │  ← banner at top
│     Showing last synced data      │
├───────────────────────────────────┤
│  [list of cached apps from        │
│   SwiftData — no shimmer needed]  │
└───────────────────────────────────┘
```

---

## 4. Root: Reviews tab

### 4a. Unified inbox

```
┌───────────────────────────────────┐
│  Reviews                          │
├───────────────────────────────────┤
│  [All apps ⌄]  [All ratings ⌄]   │  ← filter chips
├───────────────────────────────────┤
│                                   │
│  TODAY                            │
│                                   │
│  ⭐ ⭐                              │
│  Bug after update                 │
│  Recall v2.0 · 2h ago             │
│  ──────────────────────           │
│                                   │
│  ⭐ ⭐ ⭐ ⭐ ⭐                       │
│  Love this app!                   │
│  TVHub v1.8 · 5h ago              │
│  ──────────────────────           │
│                                   │
│  YESTERDAY                        │
│                                   │
│  ⭐ ⭐ ⭐                            │
│  Could be better                  │
│  Recall v1.9 · 1d ago             │
│  ─ Replied ─                      │  ← indicator
│  ──────────────────────           │
│                                   │
│  ...                              │
│                                   │
└───────────────────────────────────┘
  [Releases] [Reviews] [Checklist] [More]
```

**Filter chips:**
- App: "All apps", or specific app
- Rating: "All ratings", "1-2 ★ (low)", "3 ★", "4-5 ★"
- (V1.5: Reply state filter)

**Sort:** Newest first (no sort UI in V1; locked).

---

### 4b. Review detail

```
┌───────────────────────────────────┐
│  ←  Review              ⋯         │  ← ⋯: Mark spam, Open in ASC
├───────────────────────────────────┤
│                                   │
│  Recall v2.0 · US                 │
│                                   │
│  ⭐ ⭐                              │
│  Bug after update                 │
│                                   │
│  by AppFan23 · 2 hours ago        │
│                                   │
│  ─────────────────────            │
│                                   │
│  Since the v2.0 update the app    │
│  crashes when I try to add a new  │
│  reminder. iPhone 15 Pro,         │
│  iOS 17.5.                        │
│                                   │
│  ─────────────────────            │
│                                   │
│  Your reply                       │
│                                   │
│  ┌─────────────────────────────┐ │
│  │ Pick a template ⌄            │ │  ← canned response menu
│  └─────────────────────────────┘ │
│                                   │
│  ┌─────────────────────────────┐ │
│  │                              │ │
│  │  [empty textbox]             │ │
│  │                              │ │
│  │                              │ │
│  └─────────────────────────────┘ │
│  0 / 5970                          │
│                                   │
│  ┌─────────────────────────────┐ │
│  │       Send reply             │ │  ← disabled until non-empty
│  └─────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
```

**Behaviors:**
- Picking a template prefills the textbox; user can edit before sending
- Sending shows transient toast "Reply sent" + row in inbox updates to "Replied"
- Offline: tapping Send queues the reply; toast "Reply queued — will send when online"

---

### 4c. Already-replied detail

```
┌───────────────────────────────────┐
│  ←  Review              ⋯         │
├───────────────────────────────────┤
│  [review content as above]        │
│                                   │
│  ─────────────────────            │
│                                   │
│  Your reply · 3 hours ago         │
│                                   │
│  Sorry to hear about that — can   │
│  you email support@example.com    │
│  so we can take a look?           │
│                                   │
│  Edit reply →                     │  ← opens edit composer; ASC supports edits
│                                   │
└───────────────────────────────────┘
```

---

### 4d. Empty state (no reviews)

```
┌───────────────────────────────────┐
│  Reviews                          │
├───────────────────────────────────┤
│                                   │
│        ⭐                          │
│                                   │
│   No reviews yet                  │
│                                   │
│   When customers leave reviews,   │
│   they'll appear here.            │
│                                   │
│   We'll notify you on low-rating  │
│   reviews automatically.          │
│                                   │
│   Notification settings →         │
│                                   │
└───────────────────────────────────┘
```

---

## 5. Root: Checklist tab

### 5a. Picker (initial state)

```
┌───────────────────────────────────┐
│  Checklist                        │
├───────────────────────────────────┤
│                                   │
│  Run pre-submit checks            │
│                                   │
│  Pick an app and version to       │
│  validate against the 10 most-    │
│  common rejection causes.         │
│                                   │
│  App                              │
│  ┌─────────────────────────────┐ │
│  │ Recall                  ⌄    │ │
│  └─────────────────────────────┘ │
│                                   │
│  Version                          │
│  ┌─────────────────────────────┐ │
│  │ v2.1 (46) — draft        ⌄  │ │
│  └─────────────────────────────┘ │
│                                   │
│  ┌─────────────────────────────┐ │
│  │     Run all checks           │ │  ← primary
│  └─────────────────────────────┘ │
│                                   │
│  ─────────────────────            │
│                                   │
│  Last run                         │
│  v2.0 — 2 days ago                │
│  6 pass · 2 warn · 0 fail         │
│  View →                           │
│                                   │
└───────────────────────────────────┘
  [Releases] [Reviews] [Checklist] [More]
```

---

### 5b. Running

```
┌───────────────────────────────────┐
│  ←  Recall v2.1 (46)              │
├───────────────────────────────────┤
│                                   │
│  Running checks...                │
│  ⟳ 6 of 10                        │
│                                   │
│  ✓  Build attached                │
│  ✓  Build not expired             │
│  ⟳  Export compliance answered    │
│  ⟳  Screenshot sizes covered      │
│  ⟳  What's New present            │
│  ⟳  Metadata complete             │
│  ⟳  Age rating done               │
│  ⟳  Privacy details declared      │
│  ⟳  TestFlight session            │
│  ⟳  Localizations complete        │
│                                   │
└───────────────────────────────────┘
```

Checks fire in parallel; complete in ~2–4s.

---

### 5c. Results

```
┌───────────────────────────────────┐
│  ←  Recall v2.1 (46)        ⟳     │  ← top-right re-run all
├───────────────────────────────────┤
│                                   │
│  8 pass · 2 warn · 0 fail         │
│  Ran 2 minutes ago                │
│                                   │
│  ─────────────────────            │
│                                   │
│  ✓  Build attached                │
│  ✓  Build not expired             │
│      Uploaded 3 days ago          │
│  ⚠  Export compliance unanswered  │
│      We don't know if your build  │
│      uses non-exempt encryption.  │
│      Fix in ASC →                 │  ← opens ASC web URL
│      Re-run                       │
│  ✓  Screenshot sizes covered      │
│  ⚠  What's New empty for Spanish  │
│      en-US, fr-FR look good       │
│      Fix in ASC →                 │
│      Re-run                       │
│  ✓  Metadata complete             │
│  ✓  Age rating done               │
│  ✓  Privacy details declared      │
│  ✓  TestFlight session            │
│  ✓  Localizations complete        │
│                                   │
└───────────────────────────────────┘
```

**Result row interactions:**
- Tap row → expands the detail in place
- "Fix in ASC" → opens browser to the deep-linked ASC page
- "Re-run" → re-runs just that one check (cheap, single API call)

---

### 5d. Empty state (no draft version)

```
┌───────────────────────────────────┐
│  Checklist                        │
├───────────────────────────────────┤
│                                   │
│        ✓                          │
│                                   │
│   No draft versions               │
│                                   │
│   The checklist runs against a    │
│   draft version in ASC.           │
│                                   │
│   Create a new version in ASC     │
│   first, then pull to refresh.    │
│                                   │
│   Open App Store Connect →        │
│                                   │
└───────────────────────────────────┘
```

---

### 5e. Free tier gate

After 3 runs in a calendar week, free users see this when they tap "Run all checks":

```
┌───────────────────────────────────┐
│                                   │
│        ✦                          │
│                                   │
│   You've used your 3 free runs    │
│   this week                       │
│                                   │
│   Indie subscribers get unlimited │
│   checklist runs and reply to     │
│   reviews from mobile.            │
│                                   │
│   ┌─────────────────────────────┐ │
│   │  Start 14-day free trial    │ │
│   │    then $9.99/month          │ │
│   └─────────────────────────────┘ │
│                                   │
│   Maybe later                     │  ← dismisses; weekly counter persists
│                                   │
└───────────────────────────────────┘
```

---

## 6. Root: More tab

```
┌───────────────────────────────────┐
│  More                             │
├───────────────────────────────────┤
│  ACCOUNTS                         │
│  ┌─────────────────────────────┐ │
│  │ Recall Studio          ⌄    │ │  ← team name, tap to view detail
│  │ 3 apps                       │ │
│  └─────────────────────────────┘ │
│  + Add Apple Developer team       │
│                                   │
│  SUBSCRIPTION                     │
│  ┌─────────────────────────────┐ │
│  │ Indie · 14-day free trial   │ │
│  │ 11 days remaining            │ │
│  │ Manage subscription →        │ │
│  └─────────────────────────────┘ │
│  Restore purchases                │
│                                   │
│  NOTIFICATIONS                    │
│  Per-app settings →               │
│  Low-rating threshold: 2★ →       │
│                                   │
│  TEMPLATES                        │
│  10 canned replies →              │
│                                   │
│  WIDGETS & LIVE ACTIVITIES        │
│  Add a widget →  (instructional)  │
│  Set up Lock Screen →             │
│                                   │
│  DIAGNOSTICS                      │
│  Enable debug logging  [ ]        │  ← toggle, off by default
│  View logs →                      │
│  Share diagnostics →              │
│                                   │
│  ABOUT                            │
│  Privacy policy →                 │
│  Terms of service →               │
│  Send feedback →                  │
│  Version 1.0.0 (build 1)          │
│                                   │
└───────────────────────────────────┘
  [Releases] [Reviews] [Checklist] [More]
```

---

### 6a. Account detail

```
┌───────────────────────────────────┐
│  ←  Recall Studio                 │
├───────────────────────────────────┤
│                                   │
│  Team name      Recall Studio     │
│  Issuer ID      57246542-...      │
│  Key ID         ABC123XYZ4        │
│  Added          June 11, 2026     │
│  Last refresh   2 minutes ago     │
│                                   │
│  ─────────────────────            │
│                                   │
│  Apps in this team (3)            │
│                                   │
│  ▢ Recall                         │  ← checkboxes; uncheck to hide
│  ▢ TVHub                          │
│  ▢ ScanX                          │
│                                   │
│  ─────────────────────            │
│                                   │
│  Push notifications  ✓ Active     │
│  Webhook ID  whk_abc123 →         │
│  Test push delivery →             │
│                                   │
│  ─────────────────────            │
│                                   │
│  ⚠  Remove this team              │  ← destructive; confirms in alert
│                                   │
└───────────────────────────────────┘
```

**Why this works:**
- All sensitive data visible (so user can verify what we have)
- "Test push delivery" sends a no-op push so user can confirm notifications work
- Remove team is destructive and confirmed

---

## 7. Lock Screen / Home Screen widget (instructional)

This is the screen shown when user taps "Add a widget →" from Settings or during onboarding.

```
┌───────────────────────────────────┐
│  ✕                                │
│                                   │
│   Add a Release Pilot widget      │
│                                   │
│   1. Long press your Lock Screen  │
│      or Home Screen               │
│                                   │
│   2. Tap "Customize"              │
│      or the + button              │
│                                   │
│   3. Search "Release Pilot"       │
│                                   │
│   4. Pick a size and which app    │
│      to track                     │
│                                   │
│   [animated GIF showing the       │
│    process on iPhone Lock Screen] │
│                                   │
│   ┌─────────────────────────────┐ │
│   │       Got it                 │ │
│   └─────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
```

We cannot programmatically add a widget for the user (iOS restriction), so the best UX is clear instructions + an animated demo.

---

## 8. Widget designs

### 8a. Small widget (single app)

```
┌──────────────┐
│ 📱 Recall    │
│              │
│ ● In Review  │  ← state badge with state color
│ 14m          │
│              │
└──────────────┘
```

### 8b. Medium widget (single app + review)

```
┌─────────────────────────────────┐
│ 📱 Recall · v2.0 (45)            │
│                                  │
│ ● In Review · 14m                │
│ Submitted 2h ago                 │
│                                  │
│ ─────────────                    │
│                                  │
│ ⭐⭐ "Bug after update..." · 2h   │  ← latest low-rating review
│                                  │
└─────────────────────────────────┘
```

### 8c. Large widget (up to 2 apps + 1 review)

```
┌─────────────────────────────────┐
│ 📱 Recall · v2.0 (45)            │
│ ● In Review · 14m                │
│ ─────────────                    │
│ 📱 TVHub · v1.8 (12)             │
│ ● Ready for Sale                 │
│ ─────────────                    │
│                                  │
│ Latest review                    │
│ ⭐⭐⭐⭐⭐ "Love this app!"          │
│ TVHub · 5h ago                   │
│                                  │
└─────────────────────────────────┘
```

**Configuration intent:**
- User picks 1 app for small/medium
- User picks 1–2 apps for large
- Toggle: "Show latest review" (default on)

---

## 9. Live Activity designs

### 9a. Lock Screen (compact)

```
┌─────────────────────────────────────────┐
│ 📱 Recall                ● In Review     │
│    v2.0 (45)             14m             │
└─────────────────────────────────────────┘
```

### 9b. Lock Screen (expanded — pressed)

```
┌─────────────────────────────────────────┐
│ 📱  Recall                               │
│     v2.0 (45) · Recall Studio            │
│                                          │
│  ●  In Review                            │
│     14 minutes in this state             │
│     Submitted Wed 2:14 PM (2h ago)       │
│                                          │
│  [  View in Release Pilot  ]             │
└─────────────────────────────────────────┘
```

### 9c. Dynamic Island

**Minimal (when other Live Activities are present):**
```
●  (state-color dot)
```

**Compact (when alone):**
```
[📱]                          [● 14m]
 leading                       trailing
```

**Expanded (on 3D press):**
```
┌─────────────────────────────────────────┐
│  📱  Recall                              │
│      v2.0 (45)                           │
│                                          │
│  ●  In Review · 14 minutes               │
│                                          │
│  [  View  ]                              │
└─────────────────────────────────────────┘
```

---

## 10. Push notification designs

### 10a. State change

```
┌─────────────────────────────────────────┐
│ 📱  Release Pilot              now       │
│ Recall v2.0                              │
│ Status changed: Waiting for Review →     │
│ In Review                                │
└─────────────────────────────────────────┘

Notification actions (long press):
  [ View ]    [ Mute for 1 hour ]
```

### 10b. Low-rating review

```
┌─────────────────────────────────────────┐
│ 📱  Release Pilot              now       │
│ New 1★ review · Recall                   │
│ "The app keeps crashing on iPhone 12..." │
└─────────────────────────────────────────┘

Notification actions (long press):
  [ View ]    [ Quick reply ]    ← inline text input
```

---

## 11. Paywall (in-app, post-onboarding)

This is shown when user hits a free-tier gate:

```
┌───────────────────────────────────┐
│  ✕                                │
│                                   │
│        ✦                          │
│                                   │
│   Unlock Indie                    │
│                                   │
│   ✓ Up to 3 apps                  │
│   ✓ Lock Screen Live Activity     │
│   ✓ All widget sizes              │
│   ✓ Reply to reviews              │
│   ✓ Unlimited checklist runs      │
│   ✓ Push notifications            │
│                                   │
│   ─────────────────────           │
│                                   │
│   ○ Monthly         $9.99/mo      │
│   ● Yearly         $69/yr (-42%)  │  ← preselected
│                                   │
│   ┌─────────────────────────────┐ │
│   │  Start 14-day free trial    │ │
│   │      then $69/year           │ │
│   └─────────────────────────────┘ │
│                                   │
│   Maybe later                     │
│                                   │
│   Restore purchases · Terms · Privacy │
│                                   │
└───────────────────────────────────┘
```

**Paywall triggers (only ever from a meaningful action):**
- Add a 2nd app (free = 1 app)
- Tap "Send reply" on a review
- 4th checklist run in a calendar week

**NEVER triggers paywall:**
- App launch
- Tab switch
- Settings open
- Reading a review

---

## 12. Notification permission flow

Standard iOS pattern. Already covered in Onboarding screen 6. Re-prompt rules:

- If user denied on onboarding: re-prompt only when they tap "Enable notifications" in Settings → Notifications
- We never automatically re-prompt (iOS doesn't allow it anyway after one denial)
- Settings → Notifications shows a "Notifications are off — open Settings" banner when system permission is denied, deep-linking to iOS Settings via `UIApplication.openSettingsURLString`

---

## 13. State color system

These are the **only** colors used to indicate release state. Used in lists, detail views, widgets, Live Activities, and notifications.

| Semantic state | Color (Light) | Color (Dark) | SF Symbol prefix |
|---|---|---|---|
| Drafting | `systemGray` | `systemGray` | `pencil` |
| Submitted | `systemBlue` | `systemBlue` | `paperplane.fill` |
| In Review | `systemYellow` | `systemYellow` | `eye.fill` |
| Approved | `systemMint` | `systemMint` | `checkmark` |
| Ready for Sale | `systemGreen` | `systemGreen` | `checkmark.seal.fill` |
| Live | `systemGreen` | `systemGreen` | `app.badge.checkmark` |
| Rejected | `systemRed` | `systemRed` | `xmark.octagon.fill` |

A single component, `StateBadge`, renders all of these consistently. WCAG AA verified for normal and large text in both light and dark mode.

---

## 14. Type scale

iOS system, with semantic naming:

| Token | iOS Text Style | Use |
|---|---|---|
| `displayLarge` | `largeTitle` | Onboarding headlines |
| `headline` | `headline` | Card titles, section headers |
| `body` | `body` | Default body |
| `bodyEmphasized` | `body.bold` | Emphasis within body |
| `caption` | `caption1` | Timestamps, metadata |
| `captionEmphasized` | `caption1.bold` | State badges |

All scale with Dynamic Type (verified at smallest and xxxLarge).

---

## 15. Spacing

8-point grid:

| Token | Value | Use |
|---|---|---|
| `xs` | 4 | Inside chip padding |
| `s` | 8 | Tight stacks |
| `m` | 16 | Default padding |
| `l` | 24 | Card spacing |
| `xl` | 32 | Section breaks |
| `xxl` | 48 | Onboarding screen padding |

---

## 16. Animations

Locked-in motion design (don't reinvent):

- **Tab switch:** none — iOS default
- **Push transition:** none — iOS default
- **Pull-to-refresh:** iOS default
- **Live Activity update:** smooth interpolation via ActivityKit defaults
- **Widget update:** instantaneous
- **State badge color change:** 200ms ease-in-out crossfade
- **Reply send success:** 1-shot checkmark animation (300ms) + toast

No bouncy springs. No parallax. No interactive transitions in V1.

---

## 17. Accessibility (must-haves)

- VoiceOver: every screen has a logical reading order; state badges read as "In Review status" not "yellow dot"
- Dynamic Type: every text element scales; widgets clamp at xxxLarge
- Reduce Motion: respects user preference; widget refreshes don't animate
- Color blind: state badges include SF Symbol shape, never color alone
- Increase Contrast: respects; state badges add borders when enabled
- VoiceControl: every actionable element has a clear label

Audited via Xcode Accessibility Inspector before every TestFlight.

---

## 18. Empty state catalog (every empty state, in one place)

| Surface | Empty trigger | Headline | Body | CTA |
|---|---|---|---|---|
| Releases | No apps in team | "No apps yet" | "This team doesn't have any apps in ASC." | "Open App Store Connect" |
| Reviews | No reviews | "No reviews yet" | "When customers leave reviews, they'll appear here." | "Notification settings" |
| Checklist | No drafts | "No draft versions" | "The checklist runs against a draft version in ASC." | "Open App Store Connect" |
| App detail timeline | Single state, no transitions | "Timeline starts on next state change" | (none) | (none) |
| Account detail (no apps selected) | All apps hidden | "All apps hidden" | "Pick at least one app to show in the Releases tab." | (none — local fix) |

---

## 19. Error state catalog

| Trigger | UI | Recovery |
|---|---|---|
| No network | Banner at top of tab + cached data shown | Auto-clears when online |
| ASC 401 | Full-screen error in Settings → Account; "Re-enter credentials" CTA | Re-paste credentials |
| ASC 403 | Inline message + "Generate new key with App Manager role" CTA | Generate new key |
| ASC 429 (rate limit) | Toast: "Hit App Store Connect's rate limit — try again in 30s" | Auto-retry after backoff |
| Push registration failed | Banner in Settings: "Push not active — taps to fix" | Re-register |
| Webhook registration failed | Banner on app detail: "Real-time updates off — using 15-min checks" | Manual retry |
| Reply send failed (network) | Toast: "Reply queued — will send when online" + persistent banner | Auto-send on reconnect |
| Reply send failed (4xx) | Inline error on review: "ASC rejected this reply: [reason]" | User edits + retries |

---

## 20. Deep link map

All deep links use `releasepilot://` scheme. Universal links to `releasepilot.app/*` map identically.

| URL | Destination |
|---|---|
| `releasepilot://` | Releases tab (root) |
| `releasepilot://app/<appId>` | App detail (Releases) |
| `releasepilot://reviews` | Reviews tab |
| `releasepilot://reviews/<reviewId>` | Review detail |
| `releasepilot://checklist` | Checklist tab |
| `releasepilot://checklist/<runId>` | Checklist results |
| `releasepilot://settings` | More tab |
| `releasepilot://settings/account/<issuerId>` | Account detail |
| `releasepilot://paywall` | Paywall sheet |

Used by: widget taps, Live Activity taps, push notification actions, marketing links.

---

## 21. Critical user journeys (the 5 we MUST nail)

### J1: First-time setup → see release status (3 mins)
Welcome → Why ASC → Get key → Paste → Verify → Enable notifs → Trial → Releases tab
**Success metric:** ≥90% of users who complete "Paste credentials" reach the Releases tab.

### J2: Submit a build → see push within 60s of state change
Real ASC state change → Worker webhook → APNs → notification on user's phone
**Success metric:** p95 latency < 90s in production telemetry.

### J3: Read low-rating review → reply from phone (<60s)
Notification tap → Review detail → Pick template → Edit → Send → Toast
**Success metric:** ≥40% of low-rating notifications result in a reply within 24h.

### J4: Run pre-submit checklist → identify a problem → fix it
Checklist tab → Pick app + version → Run → See warning → Tap "Fix in ASC" → Re-run → Pass
**Success metric:** ≥1 actionable warning surfaced per real draft version.

### J5: Convert from free trial to paid subscription
Use app for ~10 days during trial → Day 13 reminder → Day 14 charges → Continued use
**Success metric:** ≥30% trial → paid conversion in first 30 days.

These five journeys get the most QA, the most snapshot tests, and the most live monitoring after launch.

---

## 22. What's deliberately NOT in V1 UX

To prevent feature creep, here's the explicit "no" list:

- Search across reviews
- Bulk actions (multi-select reviews, batch reply)
- Custom themes / app icon alternates
- Onboarding tour beyond the 7 screens
- Tooltips / coach marks on first-launch
- Tutorial videos in the app
- Achievement / streak system
- Social sharing of release milestones (V2: per-release retrospective)
- Drag-and-drop reorder of apps
- iPad-specific layouts (uses iPhone layout with regular size class — fine for V1)
- Today widget (deprecated; not building)
- watchOS app (V1.5)
- AI features (V2)

---

## 23. Sign-off checklist

This UX doc is complete when:

- [ ] Senthil reviewed and approved the 7-screen onboarding flow
- [ ] Senthil reviewed and approved the 4-tab IA
- [ ] State color palette confirmed (light + dark mode mockups)
- [ ] Empty state copy reviewed
- [ ] Error state copy reviewed
- [ ] All 5 critical user journeys agreed
- [ ] Paywall surface points (3 triggers) confirmed
- [ ] App icon direction picked (or explicitly deferred to Week 6)

After sign-off:

1. Build click-through prototype in SwiftUI Previews (1 day)
2. Sense-check on real device (own iPhone)
3. Start Week 1: Foundation + ASC API
