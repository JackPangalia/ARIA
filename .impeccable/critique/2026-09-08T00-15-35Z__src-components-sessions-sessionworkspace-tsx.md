---
target: Current Kivo concept, UX and UI for a valuable fast MVP
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-08T00-15-35Z
slug: src-components-sessions-sessionworkspace-tsx
---
Method: dual-agent (A: /root/ux_review; B: /root/ui_evidence), with a separate parent browser inspection of the current home component preview.

Scope: current Kivo session workspace and its supporting home, live voice, and post-session surfaces. Version labels and roadmap documents were excluded from the recommendation. Assessment A used source and historical screenshots without detector output. Assessment B independently scanned three TSX files. The current home component was rendered locally with sample data; authenticated live voice use was not tested.

## Design health

Provisional heuristic assessment; scores describe the inspected design and source, not verified real-room performance.

| Heuristic | Score | Main observation |
|---|---:|---|
| Visibility of system status | 2/4 | Real state labels exist; recognized question and answer are not visible in the live composition. |
| Match with the real world | 3/4 | Warm conversational language; recording and conversational follow-up require distinction. |
| User control and freedom | 3/4 | Stop and conditional Silence exist; no prominent manual ask fallback in the inspected live view. |
| Consistency and standards | 3/4 | Coherent visual system; Start/Start listening labels vary. |
| Error prevention | 3/4 | Explicit initial transcription consent and guarded actions. |
| Recognition rather than recall | 2/4 | Wake/follow-up rules rely partly on dismissible education. |
| Flexibility and efficiency | 3/4 | Direct activation, history and search; room interaction still needs testing. |
| Aesthetic and minimalist design | 3/4 | Calm live stage; home gives substantial space to atmosphere. |
| Error recovery | 2/4 | Failed summary generation can resemble insufficient conversation. |
| Help and documentation | 3/4 | Contextual guidance exists but essential instructions should persist. |
| Total | 27/40 | Strong visual foundation; interaction confidence needs work. |

## Design specificity

The warm editorial typography, restrained palette, meeting-room imagery and quiet orb are coherent. Home could serve a premium notes application with few changes. Kivo's distinctiveness depends on the quality of the shared spoken exchange, not another visual redesign.

The deterministic detector returned zero findings for SessionWorkspace.tsx, SessionHub.tsx and OverviewView.tsx. This is a narrow static result, not accessibility certification. Manual inspection found incomplete ARIA tab keyboard conventions; native Tab access still exists.

## Strengths

- The live screen minimizes screen attention, fitting face-to-face conversation.
- The post-session summary and transcript preserve useful outcomes.
- The home screen offers a dominant activation action, recent sessions and search.

## Priority issues

1. P1 — Invisible understanding. SessionWorkspace.tsx hides Overview during recording and renders an orb, state and time. Keep the calm layout but add the recognized question and a compact textual answer. Display actual source links for web-derived claims when available. Make expanded details optional. Relevant next design action: clarify.
2. P1 — Essential activation rules are transient. Education teaches the wake phrase and follow-up behavior, but can be dismissed. Persist a short wake instruction and use plain-language follow-up guidance. A visible Ask Kivo control is a useful fallback to evaluate. Relevant next design action: onboard.
3. P1 — Summary failure can be misleading. use-aria-recording.ts swallows summary generation failure, while OverviewView.tsx can say there was not enough conversation. Distinguish failed generation from insufficient input, retain the transcript and provide retry. Relevant next design action: harden.
4. P2 — Marketing does not yet demonstrate a specific advantage. A generic 'what do you think?' exchange underplays accumulated group context. Show a real discussion, a question about its constraints and the useful response. Relevant next design action: clarify.
5. P2 — Secondary organization and customization should not expand before activation is proven. Preserve projects and the current visual system; de-emphasize project setup, model choice and orb customization in the first-use journey. Relevant next design action: distill.

## Persona risks

First-time host: may know the microphone is active without knowing whether the question was correctly understood. Other participants: may never see the host's onboarding and need persistent, legible guidance. Participants relying on text: the live composition does not expose the answer. Distracted users: must understand that silencing Kivo and stopping transcription are different actions.

## Cognitive load and emotional journey

Home distributes attention across activation, search, history and projects. Live mode has low visual load but shifts effort into remembering voice rules. The vulnerable moment is after asking, when an animated state does not prove comprehension. The saved recap provides a useful ending if generation succeeds.

## Minor observations

Saved sessions labelled 'In progress' may be confused with active microphone recording; validate before changing semantics. The summary/transcript tab pattern lacks roving focus and arrow-key handling. No actual keyboard, mobile, acoustic or assistive-technology validation was performed.

## Product questions to validate

Would the same group independently choose Kivo for its next discussion? Does a contextual answer materially change a decision or save a lookup? Can a participant use it without the host explaining the interface? Do users value the live interaction beyond the saved notes?

## Competitive implications

Fireflies already documents wake-phrase invocation, spoken answers and live web search in video meetings; Otter documents voice interaction in Zoom. Granola supports in-person capture and questions during and after meetings. General voice assistants offer natural spoken conversation. Therefore, group voice AI and bot-free notes alone are insufficient differentiation. A candidate focus is low-setup, shared assistance for small teams making decisions together in a physical room. This is a positioning hypothesis, not proven demand or an exclusive market claim.

Primary sources checked: https://guide.fireflies.ai/articles/8186888414-talk-to-fireflies-in-live-meetings ; https://help.otter.ai/hc/en-us/articles/30839137508631-Otter-AI-Chat-with-voice ; https://docs.granola.ai/help-center/getting-more-from-your-notes/chatting-with-your-meetings ; https://www.granola.ai/ ; https://help.openai.com/en/articles/8400625-voice-chat-faq ; https://support.google.com/gemini/answer/15274899?hl=en .
