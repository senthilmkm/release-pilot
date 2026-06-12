# App Store Listing — Release Pilot v1.0

Copy/paste each section into the matching App Store Connect field.
**Do NOT edit field values in this file casually** — they're tuned for character limits.

---

## App Name (max 30 chars)

```
Release Pilot
```

13 chars · keeps "Release Pilot" intact for trademark/brand searches.

---

## Subtitle (max 30 chars)

```
All your apps, one dashboard
```

28 chars · differentiator vs. Apple's free ASC app (single-app view).

**Alternate options if you want to A/B post-launch:**
- `App Store Connect, focused` (27)
- `Every release at a glance` (25)
- `Ship calmly, ship often` (24)

---

## Promotional Text (max 170 chars, **editable without resubmit**)

```
Stop refreshing App Store Connect. Get a push the moment Apple changes your status — across every app you ship. 7-day Pro trial inside.
```

136 chars · This is your highest-leverage marketing surface (you can change it anytime). Rotate it for launches, holidays, or limited-time offers.

**Backup variants:**
- `Now with Live Activities — watch your "Waiting for Review" countdown right on your Lock Screen. 7-day Pro trial inside.` (118)
- `New: RevenueCat on the Today tab. See live MRR and revenue from all your apps in one place. 7-day Pro trial inside.` (114)

---

## Description (max 4000 chars)

```
Release Pilot is the App Store Connect companion built for solo iOS developers who ship more than one app.

Stop refreshing App Store Connect every 4 hours. Stop juggling 5 browser tabs to see what's live and what's stuck in review. Stop discovering a 1-star review three days after it landed.

────────────

ONE LIVE DASHBOARD FOR EVERY APP

• See the real-time status of every app — Drafting, Submitted, In Review, Approved, Live — at a glance
• Pull-to-refresh hits App Store Connect directly. No middleman, no caching layer, no scraping
• Tap any app to see its full version history, attached build, and pending submission details

PUSH THE MOMENT APPLE MOVES

• Get an iOS push notification the second your app transitions states: "Submitted → In Review", "In Review → Approved", "Approved → Live"
• Rejections come through with the review note included, so you can start fixing immediately
• Quiet hours, per-app mute, and "only notify me on rejections" all built in

LOCK SCREEN WIDGET + LIVE ACTIVITY

• Add a Lock Screen widget that surfaces whichever app most needs your attention right now (rejected first, then waiting for review, then in review, then drafting, then live)
• During the "Waiting for Review" wait, a Live Activity in the Dynamic Island shows you the live elapsed time without unlocking the phone
• Six widget sizes — small, medium, large, plus accessory inline and circular for the Lock Screen

PRE-SUBMIT CHECKLIST

• Before you tap "Submit for Review," run the checklist
• Catches the dumb mechanical things that get apps rejected: missing description, keywords over 100 chars, no support URL, version draft still open, no attached build, in-app purchase metadata blank
• Saves a TestFlight reject loop every time it catches one

REVIEW REPLIES FROM YOUR PHONE

• See every new App Store review across every app, sorted by recency
• Reply directly from the phone — no laptop required
• Save reusable reply templates ("Thanks, the bug is fixed in v1.4.2 which just shipped")

REVENUECAT ON THE TODAY TAB

• Live MRR, last-28-day revenue, active subscribers, and new customers from your RevenueCat project
• Glanceable in 2 seconds — same energy as checking your inbox

────────────

PRICING

Free forever:
• 1 connected App Store Connect account
• 1 app tracked
• 3 pre-submit checklist runs per week
• 2 review replies per month
• Today tab without revenue data

Release Pilot Pro:
• 7-day free trial, then Monthly or Yearly (Yearly saves ~30%)
• Every app you ship — no app cap
• Push notifications
• Lock Screen widgets and Live Activities
• RevenueCat integration
• Unlimited review replies (with templates)
• Unlimited pre-submit checklist runs
• Every ASC team you ship for — no account cap

────────────

PRIVACY-FIRST BY DESIGN

Your App Store Connect API key never leaves your phone. It lives in the iOS Keychain, protected by Face ID, and is used exclusively to sign requests to Apple's own App Store Connect API directly from your device. We have no server that ever sees your credentials. We do not log, track, analyze, or sell your data. Release Pilot is built by an indie developer for indie developers — privacy is the default, not an upgrade.

────────────

REQUIRES

• iOS 17 or later
• An Apple Developer Program membership
• An App Store Connect API key with App Manager role (the app walks you through generating one in 90 seconds)
```

Char count: ~3,470 · well under 4,000 limit, leaves room for edits.

---

## Keywords (max 100 chars, comma-separated, NO trailing space after commas)

```
asc,appstore,developer,indie,testflight,submission,review,tracker,revenuecat,widget,mrr,ios dev
```

92 chars · 13 keywords. Apple weighs:
- App name terms automatically (no need to include "release pilot")
- Singular vs plural (use the **most-searched** form — "developer" not "developers")
- Multi-word phrases ("ios dev" is one keyword; comma-separate it from others)

**Why these keywords:**
- `asc`, `appstore` — high-intent product searches
- `developer`, `indie`, `ios dev` — audience matchers
- `testflight`, `submission`, `review` — feature/intent matches
- `tracker` — descriptive category
- `revenuecat`, `mrr` — power-user signals (low volume, high conversion)
- `widget` — discovery signal (people browsing widget apps)

**Don't add:** "app store connect" (Apple trademark), "appfollow" or competitor names, your own brand name.

---

## What's New (max 4000 chars — for v1.0 release notes)

```
Welcome to Release Pilot — the App Store Connect companion built for solo iOS developers who ship more than one app.

This is v1.0. Everything is brand new:

• Live dashboard for every app you ship — status, version, build, pending submissions
• Push notifications when Apple changes your status (Submitted, In Review, Approved, Live, Rejected)
• Lock Screen widget and Live Activity during the "Waiting for Review" countdown
• Pre-submit checklist that catches mechanical rejections before you tap Submit
• Review replies from your phone with reusable templates
• RevenueCat integration on the Today tab — live MRR, revenue, customers

Pro is free for 7 days. Cancel anytime. Free plan covers 1 app forever — no time limits.

Found a bug or have a feature request? Tap the diagnostics screen in More → it prefills an email with everything I'd need to help.

— Senthil
```

For v1.0, keep release notes warm and developer-friendly. From v1.1 onward, switch to bullet-style "what changed."

---

## Categories

| Field | Value |
|---|---|
| **Primary Category** | Developer Tools |
| **Secondary Category** | Productivity |

**Don't** pick Business or Utilities — Developer Tools is the discovery surface where your buyers live.

---

## Pricing & Availability

| Field | Value |
|---|---|
| **Price** | Free (with IAPs) |
| **Availability** | All territories (let Apple's auto-localization handle pricing) |

**In-App Purchases to configure** (must be in "Ready to Submit" before you ship):
1. `release_pilot_pro_monthly` — Auto-renewable subscription, Group: `release_pilot_pro`, Tier 5 ($4.99/mo) — fix the current `MISSING_METADATA` warning
2. `release_pilot_pro_yearly` — Auto-renewable subscription, Group: `release_pilot_pro`, Tier 40 ($39.99/yr) — fix the current `MISSING_METADATA` warning
3. *(optional)* `release_pilot_pro_lifetime` — Non-consumable, Tier 70 ($99.99) — only if you want a lifetime path

Both subscriptions **must live in the same Subscription Group** for the in-app plan switcher (monthly ↔ yearly) to work. Verify in ASC → Subscriptions before you ship.

---

## Age Rating (Apple's questionnaire)

All answers: **None** for every category.
Resulting rating: **4+**

This is correct — Release Pilot has no user-generated content visible to other users, no in-app purchases of physical goods, no gambling, no violence, etc.

---

## Privacy Practices

→ See `PRIVACY_NUTRITION.md` for the exact answers to the App Privacy questionnaire.
→ See `PRIVACY_POLICY.md` for the privacy policy to host at `https://releasepilot.app/privacy`.

---

## URLs

| Field | Value | Status |
|---|---|---|
| **Privacy Policy URL** | `https://releasepilot.app/privacy` | ❌ Must be hosted before submission. See `PRIVACY_POLICY.md` |
| **Support URL** | `https://releasepilot.app/support` | ❌ Must be hosted. Suggest a simple mailto landing page |
| **Marketing URL** *(optional)* | `https://releasepilot.app` | ❌ Optional but strongly recommended |
| **Copyright** | `© 2026 Senthil [your full last name]` | Fill in your name |
| **Trade Representative Contact** *(only if EU)* | Your name + email | Required for EU distribution per DSA |

**Cheapest path to host:**
- Push your privacy/support pages as HTML to a GitHub Pages repo
- Point a custom domain (`releasepilot.app`) at it via Cloudflare DNS
- Total cost: ~$12/yr for the domain, free hosting

---

## App Review Information

→ See `REVIEW_NOTES.md`. **This is the highest-risk surface of your submission** — the ASC API key auth flow will get flagged if you don't disclose it clearly.

---

## Submission Checklist

→ See `SUBMISSION_CHECKLIST.md` for the final pre-flight steps.
