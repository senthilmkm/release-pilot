# Release Pilot — V1.5 Plan

> Status: Future — gated on V1 success
> Gate to start: V1 shipped + 200+ paying subscribers + 4.5+ App Store rating
> Estimated build: 3–4 weeks solo
> Pricing impact: introduces the Studio tier ($19.99/mo, $149/yr)

## 1. Goal

Deepen the daily-use surface so Release Pilot becomes the single morning app the user opens before checking anything else. V1.5 is about **retention and ARPU** — turning Indie subscribers into Studio subscribers via 3 high-value features.

## 2. Features

### 2.1 Daily Morning Briefing widget

A single Lock Screen + Home Screen widget that replaces the multi-dashboard morning slog.

Shows, in one glanceable card:
- Yesterday's MRR delta (via optional RevenueCat API key)
- New trials started yesterday
- Yesterday's installs delta
- Top review of the day (rating + first line)
- Active release status (if any)
- Crash count last 24h (via ASC API analytics endpoint)

User can tap any element to deep-link into the relevant detail.

Dependencies on V1: widget infrastructure (already exists), ASC API client (already exists). New: RevenueCat API client; optional Plausible or simple ASC analytics integration.

### 2.2 TestFlight feedback inbox

V1 left TestFlight feedback in App Store Connect web UI. V1.5 brings it into the app.

- Pull TestFlight feedback via ASC API (`betaFeedbackScreenshotSubmissions`, `betaFeedbackCrashSubmissions`)
- Group by build version
- Inline screenshot/crash viewer
- One-tap "open as GitHub Issue" via deep link (user provides GitHub repo URL per app)
- Tester engagement leaderboard: who's actively sending feedback vs. ghosting

Dependencies on V1: ASC API client. New: optional GitHub deep-link integration.

### 2.3 Apple Watch app + complication

- Release status complication on every watch face
- Glanceable: app name + state + minutes-in-state
- Haptic on state change
- Single screen: list of active versions with state badges
- Mini review reader (read-only) for the latest 5 reviews

Dependencies on V1: Live Activity infrastructure (uses same push payload). New: WatchKit target, complication assets.

### 2.4 Review sentiment trend

Lightweight client-side ML on review text using `NaturalLanguage` framework (no server roundtrip).

- Per-app sentiment chart: last 7 / 30 / 90 days
- Auto-clustering of common complaint themes via `NLEmbedding` + simple k-means on-device
- Highlights versions where average rating dropped
- Per-version review breakdown (this version vs. previous)

Dependencies on V1: review storage. New: NL framework integration, charting (Swift Charts).

## 3. Pricing changes

- **Free** — unchanged (1 app, basic widget, read-only reviews)
- **Indie ($9.99/mo, $69/yr)** — unchanged
- **NEW: Studio ($19.99/mo, $149/yr)** — everything in Indie + Daily Briefing widget, TestFlight inbox, Watch app, sentiment trends
- Indie users can upgrade to Studio with prorated billing

Existing Founders Lifetime Studio buyers get all Studio features automatically.

## 4. Success metrics for V1.5

- 30%+ of Indie subscribers upgrade to Studio within 60 days of V1.5 launch
- Daily Briefing widget added by 60%+ of Studio users within 14 days
- Watch app installed by 40%+ of Studio users (proxies actual Apple Watch ownership in this niche)
- Sentiment trend feature usage: 30%+ of Studio users open it weekly

## 5. Open decisions

- **RevenueCat integration depth:** read-only via API key (cheap, no auth) vs. OAuth (more polished). Recommendation: API key.
- **GitHub integration scope:** deep-link only vs. full GitHub Issues API (creates the issue automatically). Recommendation: deep-link only in V1.5; full API in V2 if demand.
- **Watch app standalone vs. companion:** Recommendation: companion (depends on phone for data). Standalone is a V2 if user feedback demands it.
- **Sentiment ML:** on-device only (privacy + cost) vs. server-side LLM (better quality). Strong recommendation: on-device only.

## 6. Risks

- **Studio tier doesn't convert** — counter: each V1.5 feature has clear standalone value; if conversion lags, surface paywall more aggressively at TestFlight inbox + Watch installation
- **Apple Watch ownership in indie iOS dev population is lower than assumed** — counter: Watch is optional bonus, not core; don't over-invest
- **Sentiment clustering quality is poor** — counter: ship the chart even if clustering is mediocre; iterate clustering later
