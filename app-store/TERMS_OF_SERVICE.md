# Terms of Service — Release Pilot

**Effective date: June 14, 2026**

**Last updated: June 14, 2026**

These terms govern your use of Release Pilot ("the app", "we", "us"). By installing or using Release Pilot you agree to them. If you don't, please don't use the app.

This document **supplements** [Apple's standard end-user license agreement](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/), which is the master license for any app distributed via the App Store. Where this document and Apple's standard EULA conflict, Apple's EULA controls.

---

## 1. What Release Pilot is and isn't

Release Pilot is a **read-and-respond client** for your own App Store Connect account. It surfaces release status, sends push notifications, and lets you reply to App Store reviews from your phone.

Release Pilot is **not**:
- A submission tool — we don't submit your apps for review on your behalf
- A pricing tool — we don't change prices or tiers
- An automation tool — every action that affects App Store Connect (a review reply being the main one) is initiated by your explicit tap
- A guarantee of any kind regarding App Store review outcomes

---

## 2. Your account and API key

You are responsible for:
- Generating an App Store Connect API key with the correct role (we recommend **App Manager** — anything higher than necessary is over-privileged)
- Keeping your Apple ID and Apple Developer Program membership in good standing
- Revoking the API key in App Store Connect when you no longer want Release Pilot to have access (deleting the key in the app does the same thing locally; revoking in ASC ensures it can't be used anywhere)

We are not responsible for actions taken on your App Store Connect account using your own API key, including actions you take through Release Pilot.

---

## 3. Subscriptions

### 3.1 Free plan

The free plan is **forever free** and includes:
- 1 connected App Store Connect account
- 1 app tracked
- 3 pre-submit checklist runs per week
- 2 review replies per month
- Today tab (without RevenueCat revenue data)

We may change the free-plan limits with **30 days notice** delivered via in-app notice. Any change will apply only to **new** users; existing users keep their original limits.

### 3.2 Pro plan

Release Pilot Pro is sold as an **auto-renewable subscription** through Apple's StoreKit. Two plans are available:
- **Monthly**: $4.99 / month
- **Yearly**: $39.99 / year (saves ~30% over monthly)

A **7-day free trial** is available to new subscribers. The trial converts to a paid subscription at the end of the 7 days unless you cancel beforehand.

### 3.3 Billing

All billing is handled by **Apple**, not by us. Your payment method, billing cycle, and renewal are managed in iOS Settings → [Your Name] → Subscriptions.

### 3.4 Cancellation

You can cancel anytime in iOS Settings → [Your Name] → Subscriptions → Release Pilot Pro → Cancel Subscription. Cancellation takes effect at the **end of your current billing period** — you keep Pro features until then.

### 3.5 Refunds

Refunds are handled by Apple. To request a refund, go to [https://reportaproblem.apple.com](https://reportaproblem.apple.com) and select the Release Pilot Pro charge. We have no ability to issue refunds directly.

### 3.6 Pro features

Pro unlocks:
- Unlimited connected ASC accounts and apps
- Push notifications
- Every app in your Lock Screen widget (free shows 1) and Live Activities
- RevenueCat integration on the Today tab
- Unlimited review replies (with templates)
- Unlimited pre-submit checklist runs

Features available at v1.0 may evolve. We may add, change, or retire individual features with notice. We will not retire a feature that was a primary reason you subscribed without offering a refund of the unused portion of your billing period.

---

## 4. Acceptable use

You agree not to:
- Use Release Pilot to access an App Store Connect account you don't have authorization to access
- Reverse engineer, decompile, or attempt to extract the source code of the app (beyond what is allowed under applicable open-source licenses for the libraries we use)
- Use the app to harass, defame, or impersonate any reviewer when replying to App Store reviews
- Use the app in any way that violates Apple's [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) or [Apple Developer Program License Agreement](https://developer.apple.com/programs/license/)

We may suspend your access to push notifications and RevenueCat features (the only server-side parts of the app) if we discover use that materially violates these terms. We cannot disable the on-device parts of the app remotely — you would need to delete the app to fully stop using it.

---

## 5. Disclaimers

Release Pilot is provided **"as is"**, without warranty of any kind. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.

We **cannot guarantee**:
- That push notifications will be delivered (APNs is best-effort and Apple may delay or drop notifications)
- That the app's representation of your App Store Connect data is real-time or always accurate (Apple's API is the source of truth — Release Pilot is a cached read of it)
- That the pre-submit checklist will catch every reason your app might be rejected (it catches **mechanical** issues; it cannot evaluate Apple's subjective judgment about your app's content, design, or business model)

---

## 6. Limitation of liability

To the maximum extent permitted by law, our total liability to you for any claim related to the app is limited to the **amount you've paid us for the app in the 12 months before the claim arose**. If you've never paid us, our total liability is $0.

We are not liable for:
- Indirect, incidental, special, consequential, or punitive damages
- Lost revenue, lost profits, or lost data
- Apple's decisions about your apps (rejections, removals, account terminations)

---

## 7. Termination

You may terminate these terms at any time by deleting the app and cancelling any active subscription.

We may terminate your access to the server-side features (push notifications and Pro feature unlocking) for material breach of these terms with 7 days notice, unless the breach is fraud or abuse, in which case we may terminate immediately.

---

## 8. Changes

We may update these terms with at least **30 days notice** delivered via in-app notice or email (if you have provided one). Changes apply prospectively only.

If a change materially reduces your rights and you don't accept it, you may cancel your subscription and request a prorated refund through Apple.

---

## 9. Governing law

These terms are governed by the laws of the State of South Carolina, United States, without regard to conflict-of-law provisions.

For disputes:
- Small claims may be brought in your local court
- Other disputes will be resolved by individual arbitration where required by law, otherwise in the state and federal courts located in York County, South Carolina, United States
- Class actions are waived to the extent permitted by law

---

## 10. Contact

| | |
|---|---|
| Email | senthil930@gmail.com |
| Postal address | 728 Balboa Ct, Fort Mill, SC 29715, United States |

---

## 11. Apple-specific provisions

Per Apple's standard EULA, the following provisions apply specifically when Release Pilot is licensed via the App Store:

- **License grant**: Apple grants you a personal, non-transferable license to use Release Pilot on any iOS device that you own or control, in accordance with the Usage Rules in the App Store Terms of Service.
- **License scope**: This license is limited to your use of the app on Apple-branded devices.
- **Maintenance and support**: We (the developer) are solely responsible for any maintenance and support of Release Pilot. Apple has no obligation whatsoever to provide any maintenance or support services.
- **Warranty**: We disclaim all warranties as set out above. If the app fails to conform to any applicable warranty, you may notify Apple, who may refund the purchase price; Apple has no further warranty obligation.
- **Product claims**: We (not Apple) are responsible for addressing any claims by you or any third party relating to Release Pilot.
- **IP claims**: We are responsible for the investigation and defense of any third-party intellectual property claim that Release Pilot infringes.
- **Third-party beneficiary**: Apple and Apple's subsidiaries are third-party beneficiaries of these terms and, upon your acceptance, have the right to enforce them against you.
