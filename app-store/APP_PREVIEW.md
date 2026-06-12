# App Preview Video — Production Plan

> **What this is:** A 15–30 second video that plays *before* your screenshots on the App Store product page. Apple lets you upload up to 3.
>
> **What this is not:** A static image, a sizzle reel of motion graphics, or anything I (the agent) can generate. App Previews must show the **real app on a real device** — Apple rejects synthesized/animated previews.
>
> **Time budget:** ~1 hour end-to-end if you follow this doc top to bottom.

---

## TL;DR

1. **Record** a 30-second screen capture of yourself using the app, following the storyboard below.
2. **Trim + overlay end card** in a free editor (Clipchamp on Windows, iMovie on Mac).
3. **Export** at 1080×1920 (or 886×1920), H.264, .mov.
4. **Upload** to ASC → Distribution → App Store → 1.0 Prepare for Submission → 6.9" Display → App Preview slot.

---

## Apple's hard requirements

These are non-negotiable. If you violate any, ASC rejects the upload at the file-pick step (saves you time vs. waiting for review rejection).

| Spec | Requirement |
|---|---|
| **Duration** | 15 – 30 seconds (29 is the safest target) |
| **Format** | `.mov`, `.m4v`, or `.mp4` |
| **Codec** | H.264 (most common) or Apple ProRes 422 |
| **Frame rate** | 30 fps (60 fps allowed but unnecessary) |
| **Resolution (6.9")** | 886 × 1920 portrait, or 1080 × 1920 portrait. Both accepted. |
| **Audio** | Optional, but **highly recommended** (silent previews convert ~30% worse). 44.1 or 48 kHz, AAC or PCM, stereo or mono. |
| **File size** | < 500 MB |
| **Content rules** | Must show the app itself. No people. No third-party logos (Apple, RevenueCat logos are OK because they're integral to your app). No price/pricing claims. No "Coming Soon." |

**For Release Pilot specifically:** since `supportsTablet: false` in `app.json`, you only need to provide one preview at the **6.9" Display** size. ASC uses it for the iPhone 17/17 Pro/17 Pro Max listings; it auto-down-samples for smaller iPhones.

---

## The 30-second storyboard (single-take, no editing)

Designed to be recordable in one continuous screen capture on your iPhone. **No video editing required** if you nail the take — just trim the start/end.

### Setup (do this BEFORE recording)

- [ ] You're on **Pro plan** (so Today tab + Pro features look right)
- [ ] You have **3 apps connected** (PDF Studio, Recall, Format Flex or similar)
- [ ] One app has a **draft** with a checklist that has zero blockers — for the "Ready to submit" green state
- [ ] OR one app has 1 obvious blocker — for the "Catches mechanical rejections" angle
- [ ] **Notifications are silenced** (Focus mode → Do Not Disturb) so nothing else pops on screen mid-recording
- [ ] **Status bar looks clean**: full battery, full signal, on Wi-Fi. (Apple auto-cleans status bar in the App Store version, but starting clean avoids any chance of personal info leaking)
- [ ] **Time on the device clock**: set to 9:41 AM (Apple's marketing convention) — Settings → General → Date & Time → toggle Set Automatically OFF → set manually. *Optional but professional.*
- [ ] **Light mode OR dark mode** — pick one and commit. Mixed-mode previews look amateur. Recommend **dark mode** for Release Pilot (the accent color pops more).
- [ ] **Practice the path 2–3 times** before hitting record. Muscle memory matters at 30 seconds.

### The take

| Time | Action | Visual goal |
|---|---|---|
| **0:00 – 0:02** | App opens to **Releases tab**. 3 apps visible with status badges. Hold still. | Establish: "this is the app, this is what it does." |
| **0:02 – 0:05** | **Tap your hero app** (e.g. Recall). Detail screen slides in. Version history visible. | Depth — drilling into one app. |
| **0:05 – 0:07** | **Light scroll down** on the version history. Show 2–3 past versions. | Conveys timeline / history. |
| **0:07 – 0:10** | Tap **back arrow** → tap **Today tab**. RevenueCat card animates in with MRR + revenue. | Money. Headline metric a paying user actually feels. |
| **0:10 – 0:14** | Light scroll on Today tab. Show the briefing card + revenue card. Hold for a beat. | Pro feature payoff. |
| **0:14 – 0:17** | Tap **Checklist tab**. App picker chips visible. Tap the app with a green/passing checklist. | Visual variety — shows a third tab. |
| **0:17 – 0:23** | Hold on Checklist results. "Ready to submit · All 14 checks passing" headline reads. | Concrete value: "this is what I get." |
| **0:23 – 0:27** | Tap back → tap **More tab**. Subscription card + accounts row visible. | (Optional) shows the breadth — also lets you end on a calm screen. |
| **0:27 – 0:30** | Hold for 3 seconds on a clean screen. | Buffer for end-card overlay (added in editor). |

**Alternative ending (if you have a Live Activity active):** swap 0:27–0:30 for a swipe-down to home → Dynamic Island showing "Waiting for Review · 2h 14m." Strong wow factor. Only viable if you actually have an app in review on the device at recording time.

### What NOT to do during the take

- ❌ Don't tap the search bar or any text input (keyboard appears = adds 4 seconds of useless visual)
- ❌ Don't pull-to-refresh (animation is too subtle to read at full speed)
- ❌ Don't trigger the paywall (Apple's video guidelines discourage showing pricing UIs in previews; safe to skip)
- ❌ Don't show notifications dropping in (looks like a system event, not your app)
- ❌ Don't switch between light/dark mid-clip
- ❌ Don't show real customer names or revenue numbers you don't want public — use a test team if needed

---

## Recording — Method 1: iPhone native screen recording (Windows-friendly)

This is your primary path since your dev box is Windows.

### One-time setup

1. **Settings → Control Center → Add "Screen Recording"** (the round dot icon)
2. **Long-press Screen Recording in Control Center → Microphone Audio: OFF** (we don't want narration leaking, and silent screen capture is cleaner)

### Recording

1. Open Release Pilot. Get to the Releases tab.
2. Swipe down (top-right corner on iPhone 14+) to open **Control Center**.
3. Tap the **red dot** screen-recording button. 3-second countdown starts.
4. **Quickly tap back into Release Pilot** (countdown gives you ~3 sec).
5. Execute the storyboard.
6. After step 0:27–0:30, swipe Control Center again → tap the red recording dot → **Stop**.

### Get the file off the phone

The recording lands in **Photos → Recents** as an `.mp4`.

| Path | Steps |
|---|---|
| **Email / AirDrop to a Mac** | Share → Mail to yourself. Open on PC. |
| **iCloud Photos** | iCloud.com → Photos → download the latest video |
| **iCloud Drive shortcut** | Photos → Share → Save to Files → On My iPhone → drop into a folder that's also in iCloud Drive |
| **USB cable to Windows** | Plug iPhone → Windows opens DCIM folder → grab the `.MP4` directly. *Fastest.* |

Save it as `C:\Users\senth\OneDrive\Documents\release-pilot\app-store\preview-raw.mp4`.

### Resolution check

iPhone 17 Pro Max records at **1290 × 2796** (full native screen). ASC accepts up to **1080 × 1920** for the 6.9" preview slot. We need to **downscale** in the editor (Step "Export" below) — don't worry about it now.

iPhone 17 (non-Pro) records at **1206 × 2622** — same downscale plan applies.

---

## Recording — Method 2: iOS Simulator (only if you have a Mac)

Skip this if you're recording on a real iPhone. Listed for completeness.

```bash
# Boot the simulator at the right device
xcrun simctl boot "iPhone 17 Pro Max"
open -a Simulator

# Install + launch the app inside it (after eas build → install on simulator)
# Then start recording:
xcrun simctl io booted recordVideo --codec h264 preview-raw.mov

# Execute the storyboard with mouse-clicks on the simulator
# Stop with Ctrl+C in the terminal
```

Simulator records at the simulated device's native resolution (1290 × 2796 for Pro Max).

---

## Editing — Windows (no Mac available)

### Option A: Clipchamp (built into Windows 11, free, simplest)

1. Open **Start → Clipchamp**
2. **Create a new video** → 9:16 (mobile)
3. **Import** `preview-raw.mp4`
4. Drag clip to timeline
5. **Trim** the front (cut the Control Center swipe + countdown) and the back (cut the swipe back to Control Center to stop)
6. Aim for total duration: **29.0 seconds** (gives 1s safety vs Apple's 30s limit)
7. **(Optional) Add end card** — at 27:00, add a Text overlay:
   - Text 1 (large, top): `Release Pilot`
   - Text 2 (smaller, below): `Stop refreshing App Store Connect.`
   - Background fade: solid black with 60% opacity over the screen recording
   - Font: SF Pro Display or system sans-serif. White text on dark background.
8. **Export → Video quality: 1080p** → output `.mp4`
9. Save as `app-store/preview-final.mp4`

### Option B: CapCut Desktop (free, more polished controls)

Download from capcut.com. Same workflow as Clipchamp but with better text animation presets if you want a more polished end card.

### Option C: ffmpeg (if you don't need an end card at all)

If you nailed the take and want zero editing — just trim + downscale:

```powershell
# Install ffmpeg once: winget install ffmpeg
# Then in PowerShell, from the app-store folder:

ffmpeg -i preview-raw.mp4 `
  -ss 00:00:03 -t 00:00:29 `
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" `
  -c:v libx264 -preset slow -crf 18 `
  -c:a aac -b:a 192k `
  -movflags +faststart `
  preview-final.mp4
```

Flags explained:
- `-ss 00:00:03` — skip the first 3 seconds (Control Center + countdown bleed)
- `-t 00:00:29` — keep exactly 29 seconds
- `scale=1080:1920:force_original_aspect_ratio=decrease,pad=...` — fits the portrait clip inside 1080×1920 without cropping; pads with black if needed
- `-crf 18` — visually lossless quality
- `+faststart` — moves metadata to file start (ASC uploads faster)

---

## Editing — Mac (iMovie path)

1. **Open iMovie → New Project → Movie**
2. **Import** `preview-raw.mov`
3. Drag to timeline
4. Trim front + back to ~29 seconds
5. (Optional) Add **Title → Standard** for end card (last 3 seconds): "Release Pilot" + "Stop refreshing App Store Connect."
6. **File → Share → File**
   - Resolution: **1080p**
   - Quality: **High**
   - Compress: **Faster**
7. Save as `preview-final.mp4`

---

## Verify the export meets ASC's specs

Run this before uploading (saves a round-trip if dimensions are off):

```powershell
# In PowerShell, after installing ffmpeg (`winget install ffmpeg`):
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,codec_name -of default=noprint_wrappers=1 preview-final.mp4
```

Expected output (or very close):

```
codec_name=h264
width=1080
height=1920
duration=29.000000
```

**Pass criteria:**
- `codec_name=h264` ✅
- `width=1080` (or 886) ✅
- `height=1920` ✅
- `duration` between 15.0 and 30.0 ✅
- File size < 500 MB (`(Get-Item preview-final.mp4).Length / 1MB`) ✅

---

## Upload to App Store Connect

1. **App Store Connect → My Apps → Release Pilot → App Store tab**
2. Make sure your **version 1.0** row is selected (under "iOS App")
3. Scroll to **App Previews and Screenshots**
4. Top-left dropdown: ensure **6.9" Display** is selected
5. Drag-drop `preview-final.mp4` into the **App Preview** slot (separate from screenshots)
6. ASC processes the video (takes 30–60 sec). During processing it auto-generates a poster frame.
7. **Pick a poster frame**: ASC will offer to use the first frame, or you can scrub to pick one. **Pick a frame around 0:03 showing the Releases tab with 3 apps** — that's your hook in the still preview.
8. Save.

---

## Common ASC rejection reasons (avoid these)

| Reason | How to avoid |
|---|---|
| **"Video shows real customer data"** | If your test team has real apps with real revenue, that's fine. If you used a real customer's review with their handle visible, blur it or re-record. |
| **"Video does not depict the actual app experience"** | Don't overlay fake UI on top of real recording. End card text is fine; fake screens are not. |
| **"Includes price or pricing claims"** | Don't show the paywall or any "$X.99" string. Don't say "Free" anywhere. |
| **"Audio includes copyrighted music"** | Use no audio, or use royalty-free music (YouTube Audio Library, epidemicsound.com). |
| **"Status bar shows personal information"** | Apple usually crops status bar but be safe — use Focus mode + full signal/battery during recording. |
| **"Resolution/aspect ratio invalid"** | The ffprobe check above prevents this. |

---

## Acceptance criteria — Sunday is done when:

- [ ] `app-store/preview-final.mp4` exists
- [ ] Duration is 15–30 seconds (target: 29s)
- [ ] Resolution is 1080 × 1920 (or 886 × 1920)
- [ ] Codec is H.264
- [ ] File size < 500 MB
- [ ] Storyboard hits all 4 mandatory beats: Releases tab → app detail → Today tab → Checklist tab
- [ ] No real customer data, no pricing UI, no third-party logos (other than RevenueCat used integrally)
- [ ] ffprobe verification passes
- [ ] Uploaded to ASC → 6.9" Display → App Preview slot
- [ ] Poster frame manually picked (Releases tab around 0:03)

---

## Time estimate

| Step | Minutes |
|---|---|
| Setup (Pro mode, clean phone, practice runs) | 10 |
| Recording (2–3 takes to get a clean one) | 15 |
| Transfer to PC | 5 |
| Edit + trim + export | 15 |
| ffprobe verify | 2 |
| Upload to ASC | 10 |
| **Total** | **~57 min** |

---

## What I (the agent) actually generated for you

To be clear about what's in this doc vs. what isn't:

- ✅ **Storyboard** — exact frame-by-frame action plan (above)
- ✅ **Recording commands** — iOS native screen recording + Mac simulator path
- ✅ **Editing recipes** — Clipchamp, CapCut, ffmpeg, iMovie
- ✅ **ffmpeg one-liner** for trim + scale + encode
- ✅ **ffprobe verification command** with expected output
- ✅ **Upload workflow** for ASC
- ❌ **The actual `.mp4` file** — cannot be synthesized; must be captured from the live app on your device
- ❌ **An animated/motion-graphics preview** — Apple would reject it

If you want, after you've recorded the raw `.mp4`, drop it back in the chat and I can give you the precise ffmpeg command tailored to your exact source resolution + a trim window based on what's actually in the clip.

---

## Bonus — if you want 3 previews instead of 1

Apple allows up to 3 App Previews. Diminishing returns past 1, but if you want to max out:

| # | Theme | 30-second arc |
|---|---|---|
| 1 | **The dashboard** (this doc) | Releases → app detail → Today → Checklist |
| 2 | **The widgets + push** | Open phone, show home-screen widget → swipe to lock screen showing inline widget → push notification arrives → tap → opens app |
| 3 | **The reply flow** | Open Reviews tab → tap a review → type a reply → post → success toast |

Skip 2 and 3 for v1.0. Ship one. Add the others in v1.0.1 once you see install numbers.

---

*Document author: agent, on 2026-06-12. Update if Apple changes spec — verify against [App Store Connect Help → App Previews](https://developer.apple.com/app-store/app-previews/) before each major revision.*
