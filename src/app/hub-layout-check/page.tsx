"use client";
import { useState } from "react";
import { SessionHub } from "@/components/sessions/SessionHub";
import { OverviewTray } from "@/components/sessions/OverviewTray";
import {
  OverviewView,
  type OverviewContentMode,
} from "@/components/sessions/OverviewView";
import { WorkspaceHeader, HeaderIconButton } from "@/components/sessions/WorkspaceHeader";
import type { SessionDoc } from "@/lib/sessions/types";
import type { ProjectDoc } from "@/lib/projects/types";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";

const projects: ProjectDoc[] = ["Studio", "Product research", "Personal", "Friday discussions", "Reading group", "Workshop"].map((name, i) => ({ id: `preview-project-${i}`, name, instructions: "", status: "active", createdAt: "2026-08-26", updatedAt: "2026-08-28", archivedAt: null }));
const sessions: SessionDoc[] = ["A shared space for our next round of ideas", "Planning the autumn workshop", "What we learned from the prototype", "Making room for a longer conversation with the whole team", "The next chapter for the studio", "A conversation from earlier this week"].map((title, i) => ({ id: `preview-session-${i}`, title, projectId: projects[i % projects.length].id, autoTitled: true, status: "active", speakerCount: 2, pinned: false, createdAt: "2026-08-26", updatedAt: `2026-08-${28-i}T12:00:00Z`, endedAt: null, trashedAt: null, lastSummaryAt: null, tokenEstimate: 0, searchableTextPreview: "", turnCount: 5, mode: "in_person", transcriptionMode: "basic", botId: null, meetingPlatform: null, botStatus: null }));

const previewSummary = {
  overview: "The group decided to keep Friday’s ship date and split the remaining work so the doc, follow-up, and launch note can land together.",
  decisions: ["Ship Friday as planned.", "Maya owns the launch note."],
  keyPoints: ["The prototype taught them the room needs a spoken answer, not another notes surface.", "James will take the customer follow-up after the recap is ready."],
  actionItems: ["Priya sends the doc tonight.", "Maya drafts the Friday note."],
  generatedAt: "2026-08-28T12:00:00Z",
  turnCountAtGeneration: 6,
};

const previewTranscript: TranscriptLine[] = [
  { id: "t1", role: "speaker", text: "We'll ship Friday.", speaker: 0, speakerName: "Maya", providerSpeakerLabel: "Maya", speakerClusterKey: "maya", sourceUtteranceIds: ["t1"], isPartial: false },
  { id: "t2", role: "speaker", text: "I'll take the follow-up.", speaker: 1, speakerName: "James", providerSpeakerLabel: "James", speakerClusterKey: "james", sourceUtteranceIds: ["t2"], isPartial: false },
  { id: "t3", role: "user_question", text: "What still has to land before then?", speaker: 0, speakerName: "Maya", providerSpeakerLabel: "Maya", speakerClusterKey: "maya", sourceUtteranceIds: ["t3"], isPartial: false },
  { id: "t4", role: "assistant", text: "The launch note, the customer follow-up, and Priya’s doc.", speaker: null, speakerName: null, providerSpeakerLabel: null, speakerClusterKey: null, sourceUtteranceIds: ["t4"], isPartial: false },
];

export default function HubLayoutCheck() {
  const [empty, setEmpty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overview, setOverview] = useState(false);
  const [mode, setMode] = useState<OverviewContentMode>("summary");
  const [event, setEvent] = useState("Ready");
  return <div className="kivo-desktop-shell flex h-dvh flex-col bg-app">
    <div className="flex shrink-0 flex-wrap gap-4 px-4 py-2 text-xs text-app-muted">
      <span>Component preview · sample data</span>
      <button onClick={() => setExpanded(v => !v)}>Toggle sidebar</button>
      <button onClick={() => setEmpty(v => !v)}>Toggle empty</button>
      <button onClick={() => setOverview(v => !v)}>Toggle overview</button>
      <output aria-label="Last action">{event}</output>
    </div>
    <div className="flex min-h-0 flex-1">
      <aside className={`hidden shrink-0 p-6 lg:block ${expanded ? 'w-[16.25rem]' : 'w-[4.5rem]'}`}><span className="text-3xl font-medium tracking-tight">K</span></aside>
      <section className={`kivo-desktop-main ${overview ? "kivo-desktop-main--overview" : "kivo-desktop-main--home"} flex min-h-0 min-w-0 flex-1 flex-col`}>
        <WorkspaceHeader
          breadcrumb={
            overview ? (
              <OverviewTray
                title={sessions[0].title}
                onRenameTitle={() => setEvent("Rename")}
                mode={mode}
                onChangeMode={setMode}
                resume
                onResume={() => setEvent("Resume")}
                showModes={!empty}
                showResume={!empty}
              />
            ) : null
          }
          navigation={<span className="kivo-mobile-nav-trigger lg:hidden"><HeaderIconButton label="Open navigation" onClick={() => setEvent("Navigation")}><span>☰</span></HeaderIconButton></span>}
        />
        <div className="kivo-desktop-surface flex min-h-0 flex-1 flex-col">
          <div className="kivo-fade-in pointer-events-none flex min-h-0 flex-1 flex-col">
            {overview ? (
              <OverviewView
                summary={empty ? null : previewSummary}
                transcriptLines={empty ? [] : previewTranscript}
                contentMode={mode}
                isRunning={false}
                generating={false}
                resume
                onStart={() => setEvent("Start")}
              />
            ) : (
              <SessionHub displayName="Alex" sessions={empty ? [] : sessions} onNewConversation={() => setEvent("New")} onOpenSearch={() => setEvent("Search")} onSelectSession={id => setEvent(id)} />
            )}
          </div>
        </div>
      </section>
    </div>
  </div>;
}
