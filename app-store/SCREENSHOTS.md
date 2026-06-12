# App Store Screenshots — Capture Plan

Apple requires **at least one screenshot per device family you support**.
Release Pilot has `supportsTablet: false` in `app.json` — so iPad screenshots are **not** required.
You DO need to provide screenshots for the **6.9" Display** size (iPhone 17 Pro Max, 1290 × 2796 px).

---

## What you have already (`C:\Users\senth\Downloads\releasepilotscreens\`)

| File | Screen | Verdict |
|---|---|---|
| `IMG_1144.PNG` | Onboarding step 3 — "Get your API key" | ❌ **Don't use** — onboarding shots are weak first impressions. Hides the value. |
| `IMG_1145.PNG` | Releases tab — 3 apps, all Live | ✅ **Use as Screenshot 1** — this IS your hero shot |
| `IMG_1146.PNG` | Release detail — Recall version history | ✅ **Use as Screenshot 4** — the deep dive into one app |
| `IMG_1148.PNG` | Checklist tab — "1 blocker" | ✅ **Use as Screenshot 5** — pre-submit value |
| `IMG_1149.PNG` | More tab — subscription + accounts | ⚠️ **Use only as Screenshot 8 (last)** — settings shots don't sell |

**You're missing 4 critical screenshots** that would dramatically improve conversion. See "Need to capture" below.

---

## Recommended 10-screenshot sequence (the order matters more than the count)

Apple shows up to 3 screenshots in the search results without scrolling. **Screenshots 1, 2, and 3 must each independently sell the app** — assume the viewer won't scroll past #3.

| # | Screen | Caption overlay | Why this slot |
|---|---|---|---|
| **1** | Releases tab — 3 apps with status | `Every app's status, at a glance.` | Hero shot. Shows the multi-app aggregation that Apple's ASC app can't do. |
| **2** | Push notification on Lock Screen | `Push the moment Apple moves.` | The killer feature for indie devs who refresh ASC constantly. |
| **3** | Lock Screen widget (small or medium) | `Live status, without opening anything.` | Differentiator — widgets are a wedge Apple doesn't fill. |
| **4** | Release detail — version history | `Tap any app for the full timeline.` | Shows depth — assures the buyer it's not skin-deep. |
| **5** | Pre-submit checklist with `1 blocker` | `Catch mechanical rejections before you submit.` | Concrete pain. Solves a problem with a number ($99 if it saves one TestFlight reject loop). |
| **6** | Reviews tab — list with reply UI | `Reply to App Store reviews from your phone.` | Mobile-first value. Most devs reply from a laptop today. |
| **7** | Today tab — RevenueCat MRR + revenue | `Live MRR and revenue, glanceable.` | Pro upsell hook. Shows the RC integration. |
| **8** | Live Activity in Dynamic Island | `Watch your "Waiting for Review" countdown live.` | Underrated wow factor — most apps don't use Live Activities. |
| **9** | Paywall — annual plan with 7-day trial | `7-day free trial. Cancel anytime.` | Conversion shot — addresses the price question before they ask. |
| **10** | More tab — diagnostics + accounts | `Privacy by design — your API key never leaves your phone.` | Anchors the privacy story for end users browsing. |

---

## Need to capture (4 missing screenshots)

You need to take 4 new shots before submitting. Here's exactly how:

### Screenshot 2 — Push notification on Lock Screen

1. Trigger a state-change push (use the dev push utility, or wait for a real state change on one of your real apps)
2. Lock the phone
3. When the notification arrives, screenshot the Lock Screen (Side Button + Volume Up)
4. The push should show: title "Release Pilot", body "Recall: Personal Memory → In Review · Submitted 6h ago"

### Screenshot 3 — Lock Screen widget

1. Long-press anywhere on the Lock Screen → Customize → Lock Screen → Add Widgets
2. Add the Release Pilot **inline (single line, top)** or **circular** widget
3. Wake the phone (don't unlock)
4. Screenshot (Side Button + Volume Up)

### Screenshot 6 — Reviews tab with reply

1. Open Release Pilot → Reviews tab
2. Tap on any review to open the detail with the reply UI
3. Make sure the keyboard is **dismissed** and you can see the review text + the "Reply" text input
4. Screenshot

### Screenshot 7 — Today tab with RevenueCat data

1. Make sure you're on **Pro** (so the RC card shows real data)
2. Open Release Pilot → Today tab
3. Make sure the RC card shows real MRR + revenue + customers numbers
4. Screenshot

### Screenshot 8 — Live Activity in Dynamic Island

This one is hardest because Live Activities only show while an app is "Waiting for Review."
**Two options:**
- **A. Wait for it organically.** Next time you submit one of your apps, take a screenshot of the Dynamic Island showing the elapsed time. *(Most reliable.)*
- **B. Use a dev trigger.** If you have a debug menu in More → Diagnostics that can force-start a Live Activity, use that. Then take the screenshot from the Home Screen so the Dynamic Island is visible.

### Screenshot 9 — Paywall

1. Make sure you're **NOT** on Pro (cancel sandbox subscription if needed) so the paywall shows the trial CTA
2. Open Release Pilot → More → tap "Subscription" or trigger the paywall via any gated feature
3. Screenshot the paywall with the "Start 7-day free trial" button visible and "Pro Yearly" selected

---

## Sizing & format

Apple's required size for **6.9" Display** (which covers iPhone 17 / 17 Pro / 17 Pro Max):

- **Required dimensions**: 1290 × 2796 pixels (portrait)
- **Format**: PNG (no transparency) or JPEG
- **File size**: < 8 MB each
- **Color profile**: sRGB or P3

Your existing screenshots (IMG_1145 etc.) appear to be from an iPhone 16 / 17 Pro Max in dev mode based on the proportions. Verify they're 1290 × 2796 (you can right-click → Properties → Details in Windows Explorer, or `Get-ItemProperty` in PowerShell). If they're not, retake on a Pro Max-class device or use Simulator.

If your device is **smaller** (e.g. iPhone 15 mini, iPhone SE), you can:
- Take the screenshots on the iOS Simulator at the 6.9" preset (Xcode → Simulator → iPhone 17 Pro Max)
- OR provide 6.5" screenshots (1242 × 2688) which Apple will auto-scale for the Pro Max listing — but the quality suffers.

→ **Use Simulator for any shots you can't capture on a real Pro Max-class device.**

---

## Captions — should you overlay text on the screenshots?

**Yes.** The best-converting App Store screenshots have:
- A short **caption** above the screenshot (1 line, ~5 words)
- A **device frame** around the screenshot (optional but professional)
- A **brand color** background tying them together

The captions in the table above are the suggested text for each shot.

**Tools to add captions:**
- **Free**: Figma + the iPhone 17 Pro Max device frame from [Facebook design](https://design.facebook.com/toolsandresources/devices/)
- **Free**: [Screenshots.pro](https://screenshots.pro) browser-based template
- **Paid ($20-50 one-time)**: [AppMockUp](https://app-mockup.com) or [Screenshot Studio](https://screenshot.rocks)

→ For a minimum viable launch, **screenshots without captions are fine** — your text content is strong enough to carry without overlays. Add captions in a v1.1 listing update.

---

## App Preview Video (optional but high-leverage)

Apple lets you upload up to **3 app preview videos** (15-30 sec each). These play *before* screenshots in the App Store and have ~3x the visual impact.

For Release Pilot v1.0, suggest **one** preview video showing:
1. (0-3s) Pull the Releases tab → 4 apps appear with live statuses
2. (3-6s) Push notification arrives on Lock Screen
3. (6-9s) Tap the push → opens the rejected app detail
4. (9-12s) Pre-submit checklist runs, shows green checks
5. (12-15s) Tagline overlay: "Stop refreshing App Store Connect."

**Tool**: QuickTime Player + iOS device wired up via USB. Record screen, edit in iMovie, export at 1080p portrait.

**Defer this to v1.1** if you want to ship faster. Video is high-leverage but not required.

---

## After Apple approves: what to track

- **Conversion rate** from App Store impression → install (track in App Store Connect → Analytics → App Store)
- If your **first-screenshot click-through** is < 2%, the hero shot is the problem. A/B test Screenshot 1 in v1.1.
- If your **install-to-Pro conversion** is < 2%, the description/screenshots are over-promising relative to the free tier. Recalibrate.
