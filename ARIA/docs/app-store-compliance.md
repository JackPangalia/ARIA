# App Store Compliance Checklist (ARIA iOS V1)

Use this before TestFlight / App Store submission.

## In-app requirements

- [x] First-run third-party AI consent (`ConsentView`) naming Speechmatics, Gemini, Cartesia, Firebase
- [x] Microphone permission string (`NSMicrophoneUsageDescription`)
- [x] Privacy manifest (`PrivacyInfo.xcprivacy`)
- [x] In-app Privacy Policy + Terms links
- [x] Account deletion (`SettingsView` → Delete account → `/api/account/delete`)
- [x] Revoke AI consent control
- [x] Sign in with Apple offered alongside Google Sign-In
- [x] No meeting-bot / Recall / Zoom capture in iOS V1
- [x] No background microphone recording (`UIBackgroundModes` empty)

## App Store Connect metadata

- [ ] Privacy Policy URL (must match in-app link)
- [ ] Terms of Use URL
- [ ] Support URL / contact email
- [ ] Privacy nutrition labels:
  - Audio Data — linked to user — app functionality
  - Email — linked to user — app functionality
  - User ID — linked to user — app functionality
- [ ] Age rating questionnaire (likely 4+ unless UGC concerns)
- [ ] Export compliance (standard HTTPS encryption only)

## Firebase / Apple Developer

- [ ] Replace placeholder `GoogleService-Info.plist`
- [ ] Add iOS app in Firebase with bundle ID `Centonis.ARIA`
- [ ] Enable Sign in with Apple in Firebase Auth
- [ ] Enable Apple capability on App ID
- [ ] Configure Google Sign-In reversed client ID URL scheme in `Info.plist`

## Review notes for Apple

Suggested review note:

> ARIA is an in-person voice assistant. The user must tap Start before the microphone is used. Audio is streamed to Speechmatics for transcription; questions and session context are sent to Google Gemini; spoken answers use Cartesia TTS. Users accept third-party AI data sharing on first launch and can delete their account in Settings.
