# Release Pilot

> The App Store Connect companion for solo iOS developers who ship more than one app.

[![Status](https://img.shields.io/badge/status-pre--launch-blue)](https://releasepilot.app)
[![Platform](https://img.shields.io/badge/platform-iOS%2017%2B-lightgrey)]()
[![License](https://img.shields.io/badge/license-source--available-orange)](#license)

Stop refreshing App Store Connect every 4 hours. Release Pilot gives you a live multi-app dashboard, push notifications when Apple changes your status, a Lock Screen widget, a Live Activity during App Review, a pre-submit checklist, and review replies from your phone — all built around Apple's App Store Connect API.

🌐 [releasepilot.app](https://releasepilot.app) · 📧 [senthil930@gmail.com](mailto:senthil930@gmail.com)

---

## What's inside

```
release-pilot/
├── app/                  Expo (React Native) iOS app — the client
│   ├── src/              Application source (expo-router, TypeScript)
│   ├── modules/          Local native modules (asc-jwt, widget-data, live-activity)
│   ├── targets/          @bacons/apple-targets — Widget, NotificationService
│   ├── assets/           Icons, images, fonts
│   └── scripts/          CLI verifiers + dev utilities
│
├── worker/               Cloudflare Worker — APNs push delivery + cron poller
│   └── src/              D1 storage, APNs JWT, state-change diffing
│
├── app-store/            App Store Connect submission packet
│   ├── LISTING.md        Subtitle, description, keywords — copy-paste into ASC
│   ├── REVIEW_NOTES.md   Notes for Apple's App Review team
│   ├── PRIVACY_POLICY.md / .html
│   ├── support.html / index.html
│   ├── PRIVACY_NUTRITION.md
│   ├── SCREENSHOTS.md
│   └── SUBMISSION_CHECKLIST.md
│
└── RELEASE_PILOT_V*_PLAN.md   Product + tech design docs
```

## Architecture

```
┌──────────────────┐                  ┌──────────────────────────────┐
│  Your iPhone     │                  │  Apple App Store Connect API │
│                  │  signed JWT,     │                              │
│  Release Pilot ─────────────────────▶ /v1/apps, /v1/builds,        │
│                  │  on-device       │  /v1/customerReviews, ...    │
│  • UI            │                  └──────────────────────────────┘
│  • SQLite cache  │                                ▲
│  • Keychain      │                                │
│  • Widget data   │                                │
│  • Live Activity │                  ┌─────────────┴───────────────┐
│  • APNs token ─────────────────────▶│  Cloudflare Worker           │
└──────────────────┘                  │                              │
        ▲                             │  • Cron every 15 min         │
        │                             │  • Polls ASC via stored      │
        │  APNs push                  │    encrypted credentials     │
        │                             │  • Diffs state changes       │
        │                             │  • Sends APNs push           │
        │                             │  • D1 for state history      │
        └─────────────────────────────│  (stateless re: user data)   │
                                      └──────────────────────────────┘
```

**Privacy model:** Your App Store Connect API key never leaves your device. The Cloudflare Worker only sees APNs device tokens — never your credentials. See [`app-store/PRIVACY_POLICY.md`](./app-store/PRIVACY_POLICY.md) for the full breakdown.

## Quick start (development)

### Prerequisites

- Node.js 22+
- An Apple Developer account
- Xcode 26+ (for `eas build` from the cloud, no local Xcode needed; for local builds, yes)
- An [Expo account](https://expo.dev) with `eas-cli` installed

### Run the app

```bash
cd app
cp .local-credentials.example.json .local-credentials.json
# Edit .local-credentials.json with your own ASC API key
npm install
npm run start
```

Then build a dev client (one-time per native dep change):

```bash
eas build --profile development --platform ios
# Install the .ipa on your device via TestFlight, then:
npm run start
```

### Run the worker

```bash
cd worker
npm install
wrangler login
wrangler d1 create release-pilot      # paste the id into wrangler.toml
wrangler d1 execute release-pilot --file=src/storage/d1-schema.sql
# Set secrets (never committed):
wrangler secret put APNS_TEAM_ID
wrangler secret put APNS_KEY_ID
wrangler secret put APNS_KEY_P8
wrangler secret put APNS_BUNDLE_ID
wrangler secret put CREDS_MASTER_KEY_B64
wrangler deploy
```

### Tests

```bash
cd app
npm test          # all unit tests
npm run typecheck # tsc --noEmit
npm run lint      # expo lint
npm run verify:cli  # end-to-end gate verifier
```

## Tech stack

- **App**: Expo 56 / React Native 0.85, expo-router, TypeScript 6, MMKV, SQLite, RevenueCat, Reanimated 4
- **Native iOS**: Swift / SwiftUI (Widget Extension, Notification Service Extension, Live Activity), `@bacons/apple-targets`
- **Worker**: Cloudflare Workers, D1, AES-GCM, JWT (jose-style on-device signing)
- **Storage**: iOS Keychain (`expo-secure-store`) for credentials, MMKV for counters, SQLite for ASC data cache

## Documentation

Product + design docs (in repository root):

- [`RELEASE_PILOT_V1_PLAN.md`](./RELEASE_PILOT_V1_PLAN.md) — V1 product spec
- [`RELEASE_PILOT_V1_TECH_DESIGN.md`](./RELEASE_PILOT_V1_TECH_DESIGN.md) — V1 architecture
- [`RELEASE_PILOT_V1_UX_FLOW.md`](./RELEASE_PILOT_V1_UX_FLOW.md) — Onboarding + screen flows
- [`RELEASE_PILOT_V1.5_PLAN.md`](./RELEASE_PILOT_V1.5_PLAN.md) — Next iteration
- [`RELEASE_PILOT_V2_PLAN.md`](./RELEASE_PILOT_V2_PLAN.md) — Future roadmap
- [`ROADMAP_RELEASEPILOT.html`](./ROADMAP_RELEASEPILOT.html) — Browsable roadmap

## License

**Source-available, all rights reserved.**

This repository is published publicly for transparency, review, and learning purposes. The code is the proprietary work of the author and is not licensed for redistribution, derivative works, or competing commercial use.

You may:
- Read and study the source code
- File issues, suggest improvements, and discuss design
- Submit pull requests (a CLA may be required before merge)

You may **not** (without a separate written license):
- Distribute this code, in source or binary form
- Build a competing commercial product based on this code
- Remove this notice

If you'd like to discuss licensing for a specific use case, email [senthil930@gmail.com](mailto:senthil930@gmail.com).

---

## Author

Built by [Senthil](https://github.com/senthilmkm) — an indie iOS developer.

Other apps:
- [Recall](https://github.com/senthilmkm/recall-app-site) — personal memory
- [Shotday](https://github.com/senthilmkm/shotday-ios) — private GLP-1 tracker

Not affiliated with Apple Inc. App Store Connect, App Store, and TestFlight are trademarks of Apple Inc.
