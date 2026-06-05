# ARIA iOS

Native SwiftUI client for the in-person ARIA experience. Reuses the existing Next.js / Firebase backend — no provider secrets ship in the app binary.

## Setup

1. Open `ARIA/ARIA.xcodeproj` in Xcode 16+.
2. Firebase iOS app is registered (`Centonis.ARIA`) — `GoogleService-Info.plist` is populated.
3. Production API base URL is set to `https://aria-psi-steel.vercel.app` in `Info.plist`.
4. Enable **Sign in with Apple** on the App ID + in Firebase Auth console.
5. Build and run on a **physical device** for microphone testing.

For local backend dev, Debug builds fall back to `http://localhost:3000` unless `APIBaseURL` is set in `Info.plist`.

## Product naming

- App Store name: **ARIA**
- Wake phrase: **Hey Kivo** (matches web backend + Speechmatics vocabulary)

## App Store checklist

- [ ] Privacy Policy URL live at `Brand.privacyPolicyURL`
- [ ] Terms URL live at `Brand.termsURL`
- [ ] App Store Connect privacy labels: Audio, Email, User ID, Diagnostics (if added)
- [ ] Microphone usage string configured
- [ ] First-run third-party AI consent screen (`ConsentView`)
- [ ] Account deletion in Settings
- [ ] Sign in with Apple enabled (required when Google Sign-In is offered)

## Architecture

```
SwiftUI → Firebase Auth → APIClient → existing /api/* routes
Mic (AVAudioEngine) → Speechmatics WS → QuestionCaptureMachine → /api/ask → AVAudioPlayer
```

## Debug API base URL

In Debug builds, `AppConfig` falls back to `http://localhost:3000` if `APIBaseURL` is unset. Use your Mac's LAN IP when testing on device.
