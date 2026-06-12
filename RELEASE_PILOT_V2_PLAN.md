# Release Pilot — V2 Plan

> Status: Future — gated on V1.5 success
> Gate to start: V1.5 shipped + 500+ paying subscribers (combined Indie + Studio) + Studio represents ≥25% of subscribers
> Estimated build: 4–6 weeks solo (or first hire)
> Pricing impact: minor — V2 may justify a price bump or a new "Pro" tier for power users

## 1. Goal

Move from "the iPhone home-screen layer" to "the indie iOS dev's everyday operating system" by adding AI-driven content generation, deeper analytics, and localization tools. V2 features make the app harder to leave once a user is in.

## 2. Features

### 2.1 AI release notes generator

User connects a GitHub repo (via OAuth or PAT) per app. On a new build:

- App pulls git commits since last published build's tag/date
- Categorizes commits (feature / fix / chore / perf / docs) via Conventional Commits parsing + LLM fallback
- Generates user-friendly "What's New" copy via a server LLM call
- Per-locale translation (uses Apple's on-device translation for free, or OpenAI/Anthropic for higher quality)
- One-tap "Apply to ASC" pushes the notes via `PATCH /v1/appStoreVersionLocalizations/{id}`

Dependencies on V1: ASC API client. New: GitHub integration, LLM call infrastructure (BYO API key option for privacy-conscious users).

### 2.2 Multi-locale review monitoring + translation

V1 showed reviews in the user's primary locale. V2 fully embraces global apps:

- Reviews grouped by territory
- Non-English reviews auto-translated on-device via `Translation` framework (iOS 18+)
- Per-locale rating trend
- Localized canned response templates
- Auto-suggest a translated reply when user composes in English to a non-English review

Dependencies on V1: review storage. New: `Translation` framework, locale-aware UI.

### 2.3 Crash log triage

- Pull crash diagnostics from ASC API (`diagnosticSignatures`, `diagnosticLogs`)
- Group by signature
- Show crash trend per release (which release introduced the crash)
- Stack trace viewer with on-device symbolication (uses user's dSYM uploaded via Xcode Organizer)
- Deep-link to Xcode Organizer for full debugging via `xcode://` URL scheme

Dependencies on V1: ASC API client. New: dSYM lookup logic, stack trace parser.

### 2.4 Per-release retrospective view

After a release goes `READY_FOR_SALE` for 7+ days:

- Generate a per-release card: review delta, rating change, install delta, crash count delta
- Highlight the top 3 new reviews mentioning the release
- "Build → Ship → Result" timeline
- Shareable image for Twitter/X "build in public" posts (generated on-device via `ImageRenderer`)

Dependencies on V1.5: sentiment trend data. New: image rendering for sharing.

### 2.5 Cross-app insights (portfolio view)

For devs with multiple apps, a portfolio dashboard:

- Combined MRR (across all apps) trend
- Release cadence by app
- Which app has the best/worst review trend
- "Time to review" across the portfolio

Dependencies on V1.5: per-app data already pulled.

## 3. Pricing impact

V2 features distribute across existing Indie and Studio tiers — no new tier needed initially. Possible adjustments:

- AI release notes count toward a monthly quota on Indie (5/month) vs. unlimited on Studio
- Crash triage and portfolio insights are Studio-only
- Multi-locale review translation is free on-device (because it costs us nothing on iOS 18+ `Translation` framework)

If demand justifies it, introduce **Studio Pro at $39.99/mo** with unlimited AI generations, deeper crash triage (multi-month retention), and priority support.

## 4. Success metrics for V2

- 50%+ of Studio users use AI release notes within first month of V2 launch
- AI release notes-generated copy used on 30%+ of shipped releases by V2 users
- Crash triage feature retention: 40%+ of multi-app Studio users open it weekly
- Net revenue retention: ≥110% (existing users either staying or upgrading)
- Total paying subscribers: 1,000+ within 6 months of V2 launch

## 5. Open decisions

- **LLM cost model:** BYO API key (free for us, slight friction for user) vs. baked-in with usage quota (frictionless but adds COGS). Recommendation: hybrid — Studio gets baked-in with quota, Indie users can BYO key.
- **Crash symbolication:** dSYM upload via the iOS app is awkward; recommend a Mac companion app or Drop folder watch
- **Translation provider:** stick to Apple's `Translation` framework (free, on-device) vs. fall back to LLM for higher quality. Recommendation: Apple first, LLM toggle for power users.
- **Portfolio view threshold:** show portfolio view only for ≥2 apps, or always show with a "Add another app" hint?

## 6. Risks

- **AI release notes hallucinate** — counter: always require user review/edit before push to ASC; never auto-push
- **Crash triage duplicates Xcode Organizer** — counter: position as the mobile glance, not the full debugger; always deep-link to Xcode for actual work
- **Cost creep from LLM calls** — counter: enforce quotas strictly; offer BYO-key as escape valve
- **Apple changes ASC API surface** — long-term risk on any API-dependent product; mitigate by maintaining a vendored API client we control

## 7. Beyond V2 (not committed, just direction)

- **Mac Catalyst version** — bring the same UI to Mac with deeper integration into Xcode Organizer
- **Team features** — multi-user accounts for studios with 2–5 devs (different pricing tier; B2B-adjacent)
- **API for power users** — Shortcuts/CLI integration so users can script Release Pilot
- **Sherlocked-resilience plan** — if Apple ships a competing widget/Live Activity, what's our next moat? (Likely: deeper community features — public dev profiles, shared dashboards, "indie dev MRR leaderboard" opt-in)
