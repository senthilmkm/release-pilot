# Release Pilot — App Store Submission Packet

Everything you need to submit Release Pilot v1.0 to the App Store, in one folder.

**Use in this order:**

| # | File | What it's for |
|---|---|---|
| 1 | [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md) | **Start here.** The master pre-flight list — work through it top to bottom. |
| 2 | [`LISTING.md`](./LISTING.md) | App Store listing fields — copy/paste each section into ASC (subtitle, description, keywords, etc.) |
| 3 | [`SCREENSHOTS.md`](./SCREENSHOTS.md) | What to capture, in what order, with suggested captions |
| 4 | [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) | Privacy policy — host this at `https://releasepilot.app/privacy` |
| 5 | [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md) | Terms of Service — host at `https://releasepilot.app/terms` (or skip; Apple's EULA is acceptable as the primary terms) |
| 6 | [`PRIVACY_NUTRITION.md`](./PRIVACY_NUTRITION.md) | Exact answers for ASC's "App Privacy" questionnaire |
| 7 | [`REVIEW_NOTES.md`](./REVIEW_NOTES.md) | Notes for Apple's App Review team — paste into "App Review Information → Notes". **HIGH-RISK** — the ASC API key disclosure here is what keeps you from being rejected. |

---

## Quick context

| Field | Value |
|---|---|
| App name | Release Pilot |
| Bundle ID | `app.releasepilot.ios` |
| ASC App ID | `6779403942` |
| Team ID | `2KJK6895B3` |
| Version (current) | 1.0.0 |
| Min iOS | 17.0 |
| Categories | Developer Tools (primary), Productivity (secondary) |
| Pricing | Free with two auto-renewable IAPs (Monthly $4.99, Yearly $39.99) |

---

## What you still have to do yourself (the agent can't)

1. **Fill in `[FILL IN]` placeholders** in PRIVACY_POLICY.md, TERMS_OF_SERVICE.md, and REVIEW_NOTES.md (effective dates, jurisdiction, postal address, test account credentials)
2. **Host PRIVACY_POLICY.md and (optional) TERMS_OF_SERVICE.md** as live HTML pages
3. **Capture 4 missing screenshots** (see `SCREENSHOTS.md`)
4. **Fix `MISSING_METADATA` on both IAPs** in ASC → Subscriptions
5. **Generate a sandbox test ASC account + API key** for App Review
6. **Build production IPA + TestFlight smoke test**
7. **Recruit 3-5 beta testers** (strongly recommended)
8. **Tap Submit**

Each of these is on the `SUBMISSION_CHECKLIST.md`.

---

Built June 12, 2026. Update this README if anything in the packet changes.
