# APNs Key Rotation & Recovery Runbook

This document describes how to rotate, recover, or replace the Apple Push
Notification service (APNs) authentication key that the Release Pilot
Cloudflare Worker uses to send push notifications.

**Audience**: the Release Pilot maintainer (you), or anyone who inherits
ownership of the worker in the future.

**This document contains zero secrets.** All actual credential values
(Team ID, Key ID, `.p8` contents, Cloudflare account ID) live in
Cloudflare Worker secrets (`wrangler secret put`), never in this repo.

---

## When to rotate

Rotate the APNs key (in priority order):

| Trigger | Urgency | Reason |
|---|---|---|
| You believe the `.p8` was committed to git, posted in a screenshot, emailed, or otherwise exposed | **Immediate** | Anyone with the `.p8` can send pushes that appear to come from your app |
| Worker logs show repeated `403 InvalidProviderToken` or `403 Forbidden` from APNs after a clock-sync issue is ruled out | **Immediate** | Most likely cause is that the key was revoked in ASC |
| A developer with access to the key left the project | **Within 24h** | Defense in depth |
| Routine rotation (recommended cadence: every 12 months, on a calendar reminder) | **Planned** | Limits blast radius if a key leaks undetected |
| Apple Developer account membership changes (team transfer, name change) | **Coordinated with the change** | Old keys may stop working |

APNs keys themselves **never expire** — they only become invalid when
explicitly revoked. There is no "renewal" — only rotation.

---

## How to detect a revoked key

When the key is revoked, every push attempt from the worker fails. The
characteristic signatures in the worker logs:

| Log signal | Meaning |
|---|---|
| `status: 403, reason: "InvalidProviderToken"` on every send | Apple rejected our JWT — key is almost certainly revoked or the wrong Key ID is stored |
| `status: 403, reason: "ExpiredProviderToken"` once after a long idle period | NOT revocation — just the JWT cache holding a >60min token. The worker auto-refreshes; if it persists, then suspect revocation |
| `status: 500` from APNs | Apple's side. Wait 5 minutes and retry before assuming key issues |
| `status: 410, reason: "Unregistered"` per device | Device-specific (user uninstalled) — NOT key issues |

The classifier in `worker/src/apns/client.ts → classifyApnsFailure` will
return `"retry"` for 403s by default, so revoked-key cases won't
auto-drop devices — they just stop being able to receive pushes
until the key is rotated.

---

## Rotation procedure

### Prerequisites

You need:
- Owner / Admin role on the Apple Developer account (`Users and Access → Integrations → Keys`)
- `wrangler` CLI authenticated against the Cloudflare account that owns the worker (`wrangler whoami` should show the correct account)
- A folder OUTSIDE OneDrive / iCloud / any cloud-sync to save the new `.p8` temporarily (e.g. `C:\Users\<you>\local-keys\`, then delete after rotation completes)

### Step 1 — Generate the new key in App Store Connect

1. Go to **App Store Connect → Users and Access → Integrations → Keys → Apple Push Notifications service (APNs)**
2. Click the **+** button
3. **Name**: `Release Pilot APNs <YYYY-MM-DD>` (date helps identify the active key later)
4. **Environment**: All environments (Development + Production) unless you have a strong reason to split
5. **App ID**: select Release Pilot's App ID (the bundle id that matches `APNS_BUNDLE_ID`)
6. Click **Save**
7. **Click Download** — Apple lets you download the `.p8` **exactly once.** If you miss this, you have to generate a new key from scratch.
8. Note the **Key ID** shown next to the new entry (10 characters)
9. Note the **Team ID** at the top of the page if you don't have it memorized (10 characters)

Move the downloaded `AuthKey_XXXXXXXXXX.p8` to your local-only folder.
**Do not save it to OneDrive, Desktop (if synced), Documents (if synced),
Dropbox, iCloud Drive, or any other cloud-synced location.**

### Step 2 — Push the new secrets to Cloudflare

From the `worker/` directory:

```bash
# Replace the .p8 contents (paste the full file including BEGIN/END lines when prompted)
wrangler secret put APNS_KEY_P8

# Replace the Key ID
wrangler secret put APNS_KEY_ID

# Replace the Team ID only if it changed (rare)
wrangler secret put APNS_TEAM_ID
```

`wrangler` will prompt for each value. The new secrets take effect on the
next worker invocation — there is no separate "deploy" step needed for
secrets.

**Tip**: if a paste corrupts the `.p8` (extra whitespace, CRLF line endings,
missing BEGIN/END markers), the worker will start returning
`InvalidProviderToken` on every send. Re-run `wrangler secret put
APNS_KEY_P8` and paste again. The `.p8` is plain ASCII — copy the entire
file contents from the BEGIN line through the END line, inclusive.

### Step 3 — Force the JWT cache to refresh

The worker caches the signed JWT in memory for 30 minutes
(`worker/src/apns/jwt.ts → REFRESH_AT_AGE_MS`). New secrets won't be
used until that cache expires OR the worker process restarts.

To force a fresh sign immediately:

```bash
# Triggers a deploy with the same code, which restarts the worker
# and discards any in-memory JWT cache.
wrangler deploy
```

### Step 4 — Verify with a test push

The fastest end-to-end test:

1. Make sure your iPhone has Release Pilot installed (production build, NOT dev) and notifications enabled
2. Trigger a state change on one of your connected ASC apps OR call the worker's `/v1/test-push` endpoint if it's wired up
3. Confirm the notification arrives within 5 seconds

If the notification does NOT arrive:
- Check worker logs (`wrangler tail`) for the APNs status code
- `200` → push succeeded but iOS suppressed it. Check device's Settings → Notifications → Release Pilot
- `403 InvalidProviderToken` → Step 2 didn't take effect. Re-run the secret put commands and `wrangler deploy`
- `410` → the device token is stale. Re-register the device by toggling notifications off/on in the app

### Step 5 — Revoke the OLD key in ASC

**Only after Step 4 confirms the new key works.** Don't revoke the old
one first — that creates a notification dead zone of however long Step 2
+ Step 3 + Step 4 take.

1. ASC → Users and Access → Integrations → Keys
2. Find the old key (the one named `Release Pilot APNs <older date>`)
3. Click **Revoke**
4. Confirm

Revocation is **immediate and irreversible**. Apple's APNs servers will
reject any JWT signed with the revoked key starting within seconds.

### Step 6 — Delete the local `.p8` file

Delete the `.p8` you downloaded in Step 1. The secret now lives only in
Cloudflare. There is no benefit to keeping a local copy — if you need
the key contents again (e.g., to copy it to a second worker), `wrangler
secret put` is the only way to rotate it anyway, and that requires the
original `.p8` file.

If you lose the local `.p8` after deletion: just generate a new key
(start over from Step 1). The `.p8` is not recoverable from Apple, by
design.

---

## Recovery scenarios

### "I lost the `.p8` and forgot the Key ID"

You don't need the `.p8` to identify which key is currently active — the
Key ID is visible in `wrangler secret list` (the secret value is masked
but the secret name is shown). The Key ID is **also** visible
unredacted in ASC → Users and Access → Integrations → Keys. Cross-reference
which entry there matches the Key ID you have stored as `APNS_KEY_ID`.

If you actually lost the `.p8` AND the worker is running fine: leave the
worker alone, and schedule a rotation at your next available window.
The current key works because it's already loaded as a secret; you just
can't generate a new JWT signature outside the worker without the
`.p8`.

If you lost the `.p8` AND the worker has started failing
(`InvalidProviderToken`): run the full rotation procedure above.
Generate a new key, push new secrets, revoke the old one.

### "I think the `.p8` leaked publicly"

Treat as compromised:

1. **Immediately** generate a new key in ASC (Step 1)
2. **Immediately** push the new secrets via `wrangler secret put` (Step 2)
3. **Immediately** revoke the old key in ASC (skip the "verify first"
   safety net of Step 4 — the risk of a malicious actor sending fake
   pushes from your bundle ID is worse than a few minutes of
   notification downtime)
4. **Then** verify with a test push (Step 4)
5. Inspect `wrangler tail` logs from the period of suspected leak. Look
   for APNs sends to device tokens that weren't in your `devices` D1
   table — though in practice this is hard to detect, so consider any
   leak window as "possible misuse" and notify users if appropriate.

### "I need to hand the worker off to another developer"

1. Add the new developer to the Cloudflare Workers account with the
   appropriate role
2. Rotate the APNs key (full procedure above) so the old `.p8` you may
   have on your machine is no longer valid
3. Rotate `CREDS_MASTER_KEY_B64` too (same `wrangler secret put`
   pattern) — this is the AES key that the worker uses to encrypt
   per-device credentials, and you don't want a former maintainer to
   have a copy of it

---

## Where the secrets live

| Secret | Where stored | How retrieved at runtime |
|---|---|---|
| `APNS_KEY_P8` | Cloudflare Worker secret (encrypted at rest) | `env.APNS_KEY_P8` in `worker/src/lib/env.ts` |
| `APNS_KEY_ID` | Cloudflare Worker secret | `env.APNS_KEY_ID` |
| `APNS_TEAM_ID` | Cloudflare Worker secret | `env.APNS_TEAM_ID` |
| `APNS_BUNDLE_ID` | Cloudflare Worker secret | `env.APNS_BUNDLE_ID` |
| `CREDS_MASTER_KEY_B64` | Cloudflare Worker secret | `env.CREDS_MASTER_KEY_B64` |

These are **never** in `wrangler.toml`, **never** in any `.env` file,
and **never** in git. They are only readable via `wrangler secret list`
(which shows names, not values) and from inside the running worker via
the `Env` interface.

Public variables (safe to commit) are in `wrangler.toml`'s `[vars]`
block: `APNS_HOST`, `POLL_CONCURRENCY`, `POLL_BATCH_SIZE`.

---

## Quick reference

```bash
# What APNs secrets are currently set?
wrangler secret list

# Replace one secret (paste value when prompted)
wrangler secret put APNS_KEY_P8

# Remove a secret entirely (rare)
wrangler secret delete <NAME>

# Force the worker to restart and pick up new secrets immediately
wrangler deploy

# Watch live logs to verify APNs send results
wrangler tail
```

---

**Last reviewed**: June 14, 2026
**Next scheduled rotation**: June 14, 2027 (set a calendar reminder)
