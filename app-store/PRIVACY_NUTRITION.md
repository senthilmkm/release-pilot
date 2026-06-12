# App Privacy Nutrition Label — Release Pilot v1.0

Apple's "App Privacy" questionnaire in App Store Connect → App Information → App Privacy.
**Get this wrong and your app gets rejected.** The answers below match the actual app code and the privacy policy verbatim.

---

## Setup decision tree (start here)

The first ASC question is: **"Do you or your third-party partners collect data from this app?"**

The answer is **"Yes"** — because RevenueCat and APNs are third-party recipients of *some* data (anonymous installation ID + APNs device token). Even though we do not collect *user-identifiable* data, an honest reading of Apple's questionnaire requires "Yes" here.

Saying "No" when RevenueCat is in your app is the **most common rejection trigger** for indie subscription apps.

---

## Data Types — what to disclose

ASC asks you to check boxes for each data type. Here's the complete list of what Release Pilot uses, with the **exact ASC checkbox** mapped to each:

### ✅ Identifiers → "Device ID"

- **What:** RevenueCat-generated anonymous installation UUID + APNs device token
- **Purpose:** "App Functionality" only (no analytics, no advertising)
- **Linked to user?** **No** (anonymous, no Apple ID/email/name)
- **Used for tracking?** **No** (no advertising, no cross-app correlation, no IDFA)

### ✅ Purchases → "Purchase History"

- **What:** Apple's StoreKit receipt for IAP validation
- **Purpose:** "App Functionality" (validate Pro entitlement)
- **Linked to user?** **No** (the receipt validates the Apple ID purchase but we don't store the Apple ID)
- **Used for tracking?** **No**

### ❌ Everything else — do NOT check

The following categories must **not** be checked because the app does not access them:
- Contact Info (no email, name, phone, address collected)
- Health & Fitness
- Financial Info (the Apple ID payment is handled by Apple, not us)
- Location
- Sensitive Info
- Contacts
- User Content (review replies you write are sent to **Apple's** servers via the ASC API, not ours — they are User Content sent to Apple, not to us)
- Browsing History
- Search History
- Identifiers → User ID (we don't have one — it's all anonymous installation IDs)
- Usage Data (no analytics)
- Diagnostics (no crash reporting at v1.0)

> **About User Content**: This is the trickiest call. Review replies travel from your device to **Apple's App Store Connect API**, not to a server we operate. Per Apple's own definitions in the App Privacy questionnaire, "data collected" means data collected **by you, the developer**. Since we don't see or store the review reply text, we don't check "User Content." If you ever add server-side features (e.g. AI reply suggestions, template sharing), you'll need to revisit this.

---

## Detailed answers — copy/paste into ASC

For each checked data type above, ASC asks 4 follow-up questions:

### Identifiers → Device ID

| Question | Answer |
|---|---|
| Is this data linked to the user's identity? | **No** |
| Is this data used for tracking purposes? | **No** |
| For what purposes is the data collected? | ☑️ **App Functionality** (only) |
| Which third parties receive this data? | RevenueCat, Apple Push Notification service (APNs) |

### Purchases → Purchase History

| Question | Answer |
|---|---|
| Is this data linked to the user's identity? | **No** |
| Is this data used for tracking purposes? | **No** |
| For what purposes is the data collected? | ☑️ **App Functionality** (only) |
| Which third parties receive this data? | RevenueCat |

---

## "Tracking" — the radioactive question

ASC will ask, before the data types: **"Do you use any data for tracking purposes?"**

The answer is **NO** — and you must be able to defend this. "Tracking" in Apple-speak means:
- Linking user data with third-party data for advertising/targeted ads
- Sharing user data with data brokers
- Linking data collected here with data collected by your other apps for advertising

Release Pilot does **none** of these things. Confirmed by:
- No IDFA access (we don't even include AppTrackingTransparency framework)
- No analytics SDK
- No advertising SDK
- RevenueCat receives only an anonymous installation UUID + Apple's receipt — neither is linked to any other identifier

→ Answer **NO** to "tracking" and confirm in your codebase that you don't add Firebase Analytics, AppsFlyer, Adjust, Branch, or any similar SDK before submitting.

---

## Privacy manifest (PrivacyInfo.xcprivacy)

You already have privacy manifest entries in `app.json` for:
- `NSPrivacyAccessedAPICategoryUserDefaults` (reason `CA92.1` — read user settings)
- `NSPrivacyAccessedAPICategoryFileTimestamp` (reason `C617.1` — file modification timestamps)
- `NSPrivacyAccessedAPICategoryDiskSpace` (reason `E174.1` — disk space check)
- `NSPrivacyAccessedAPICategorySystemBootTime` (reason `35F9.1` — uptime)

These are all required for Expo + React Native and are standard. They cover the "required reason API" disclosure. **No further action needed** unless you add a new SDK that uses one of the other restricted APIs.

If you ever add a SDK that uses `kCFGregorianAllUnits`, `NSDateFormatter`, network reachability beyond NWPathMonitor, or active keyboard detection — re-verify your manifest.

---

## Sandbox + production check

**Before you submit:**

1. Re-read this file
2. Open App Store Connect → My Apps → Release Pilot → **App Privacy**
3. Configure the answers above
4. Click **Publish** on the privacy practices
5. Verify the nutrition label preview matches: it should show only "Data Not Linked to You: Device ID, Purchase History"
