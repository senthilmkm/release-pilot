# Privacy Policy — Release Pilot

**Effective date: June 14, 2026**

**Last updated: June 14, 2026**

This privacy policy describes how Release Pilot ("the app", "we", "us") handles your information. We've intentionally written it in plain English. If anything is unclear, email **senthil930@gmail.com** and we'll revise it.

---

## TL;DR

- We have no server that stores your App Store Connect data.
- Your App Store Connect API key is stored on your device only, in the iOS Keychain, protected by Face ID / Touch ID.
- We don't collect personal data, run analytics, or use third-party trackers.
- The only network calls we make are: (1) to **Apple's App Store Connect API** to fetch your release data, signed locally by your API key; (2) to **RevenueCat** to validate your subscription receipt; (3) to **our Cloudflare Worker** to deliver push notifications.
- You can delete everything by removing the app — there's nothing on any server to delete.

---

## 1. What information Release Pilot accesses

### 1.1 Your App Store Connect API key

When you connect an App Store Connect account, you generate an API key in App Store Connect (Apple's developer portal) and paste three values into the app: the **Issuer ID**, the **Key ID**, and the contents of the **.p8 private key file**.

We store these three values in **your device's iOS Keychain** using the `expo-secure-store` library. The keychain entry is:
- Accessible only when your device is **unlocked**
- Marked **`ThisDeviceOnly`** — it is not synced to iCloud Keychain, not transferable to another device, and not backed up to iTunes/Finder
- Protected by your device's **biometric authentication** (Face ID / Touch ID / Passcode) when present

We use these values exclusively to generate short-lived JSON Web Tokens (JWTs) **on your device** that authenticate requests to Apple's App Store Connect API. Each JWT expires after at most 20 minutes, then is regenerated.

**Your API key never leaves your device.** It is never transmitted to our servers, our developer's machines, any third party, or any analytics service.

### 1.2 Your App Store Connect data

We make HTTP requests **directly from your device to `https://api.appstoreconnect.apple.com`**. These requests fetch:
- Your apps (name, bundle ID, icon)
- Each app's version history (version number, build number, app store state, dates)
- Customer reviews (review text, rating, customer nickname, date)
- TestFlight builds (for the pre-submit checklist)

The responses are stored **only in memory** for the current session and in a local SQLite database (`expo-sqlite`) on your device for offline display between launches. This data is **never** sent to any server we operate.

### 1.3 Notification settings and counters

We store a small amount of state on your device using `react-native-mmkv`:
- Whether you've granted notification permission (boolean)
- Notification preferences (mute-per-app, quiet hours, etc.)
- Counters for free-tier rate limits (e.g. "checklist runs this week")
- The current app theme and tab selection

None of this leaves your device.

### 1.4 Subscription receipts

We use **RevenueCat** (a third-party StoreKit infrastructure provider, [revenuecat.com](https://www.revenuecat.com)) to validate that your in-app subscription purchase is genuine, and to unlock Pro features. RevenueCat receives:
- A randomly generated **anonymous installation ID** created by your device (a UUID — not your Apple ID, name, or email)
- The **receipt** that Apple's StoreKit gives the app after a purchase

RevenueCat does **not** receive your App Store Connect API key, your App Store Connect data, your reviews, your release information, or any personally identifiable information about you. See [RevenueCat's privacy policy](https://www.revenuecat.com/privacy).

### 1.5 Push notifications

To deliver push notifications, your device's **APNs (Apple Push Notification service) device token** is sent to our Cloudflare Worker at `release-pilot.workers.dev`. The Worker stores the token alongside the user's anonymous installation ID for the duration of your Pro subscription, and uses it to deliver push notifications to your device when one of your apps changes status.

The Worker receives **only** the APNs token and a small payload describing the state change (e.g. `{ascId: 12345, from: 'in_review', to: 'approved'}`). It does **not** receive your API key, your name, your Apple ID, or any other personal information.

You can disable push notifications at any time in iOS Settings → Notifications → Release Pilot. Disabling them stops all data flow to the Worker.

---

## 2. What information we do NOT collect

We want to be specific about what we *don't* do, because most apps you've used probably do these things and we don't:

- **No analytics SDKs.** We do not embed Firebase Analytics, Mixpanel, Amplitude, Segment, or any other usage tracker.
- **No crash reporting at v1.0.** *(If we add Sentry or similar in a future version, this policy will be updated and you'll be notified in-app before we activate it.)*
- **No advertising IDs.** We do not access IDFA or the App Tracking Transparency framework.
- **No social SDKs.** Facebook, Google, TikTok — none.
- **No fingerprinting.** We do not collect IP address, device model, OS version, screen size, font enumeration, or any other passive identifier for the purposes of identification.
- **No data sold to third parties. Ever.**

---

## 3. Third-party services

| Service | Why | What it sees |
|---|---|---|
| **Apple App Store Connect API** | Fetches your release data | Whatever you've granted the API key access to (your apps, reviews, builds) — signed by *your* key, fetched *from your device* |
| **RevenueCat** | Validates IAP receipts, unlocks Pro | Anonymous installation ID + Apple's IAP receipt |
| **Apple Push Notification service (APNs)** | Delivers push notifications | Device token + payload describing the state change |
| **Cloudflare Workers** | Delivers our push notifications via APNs | APNs token + state change payload (no PII) |

We have no other third-party services in the app.

---

## 4. Your rights

### 4.1 Delete everything

You can delete all data Release Pilot has access to by:
1. Opening the app → More → ASC Accounts → delete each connected account (this revokes our access to the App Store Connect API and clears the local SQLite cache)
2. Deleting the Release Pilot app from your device (this removes the iOS Keychain entries, the MMKV settings, and the local SQLite database)

To delete data on our **Cloudflare Worker** (your APNs device token):
- Open the app → More → Push notifications → tap "Disable"
- Or email **senthil930@gmail.com** with your anonymous installation ID (found in More → Diagnostics) and we'll delete it within 7 days

### 4.2 Revoke our API key access

You can immediately revoke Release Pilot's ability to read your App Store Connect data by going to App Store Connect → Users and Access → Integrations → Keys → revoke the key you generated for Release Pilot. This takes effect within seconds and renders the app inert until you generate a new key.

### 4.3 GDPR / CCPA

If you are a resident of the European Union (under GDPR) or California (under CCPA), you have the right to:
- Request a copy of any personal data we hold about you (answer: we don't hold any on our servers — see Section 1)
- Request deletion of any personal data we hold about you (see Section 4.1)
- Object to processing of your personal data
- Lodge a complaint with your local data protection authority

Email **senthil930@gmail.com** to exercise any of these rights. We respond within 30 days.

---

## 5. Children

Release Pilot is a developer tool. It is rated 4+ but is not designed for or directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe we have, please contact us and we will delete it.

---

## 6. Changes to this policy

If we make material changes to this policy, we will:
- Post the updated policy at `https://releasepilot.app/privacy` with a new "Last updated" date
- Display an in-app notice on next launch before the change takes effect

Material changes will not be applied retroactively to data already collected.

---

## 7. Contact

| | |
|---|---|
| Email | senthil930@gmail.com |
| Postal address | 728 Balboa Ct, Fort Mill, SC 29715, United States |
| Developer of record | Senthil Kumar Kannan |

---

## 8. Jurisdiction

This policy is governed by the laws of the State of South Carolina, United States, without regard to conflict-of-law principles.

For App Store transactions, Apple's standard EULA also applies: [https://www.apple.com/legal/internet-services/itunes/dev/stdeula/](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/)
