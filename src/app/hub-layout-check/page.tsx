"use client";
import { useState } from "react";
import { SessionHub } from "@/components/sessions/SessionHub";
import { WorkspaceHeader, HeaderIconButton } from "@/components/sessions/WorkspaceHeader";
import type { SessionDoc } from "@/lib/sessions/types";
import type { ProjectDoc } from "@/lib/projects/types";
const projects: ProjectDoc[] = ["Studio", "Product research", "Personal", "Friday discussions", "Reading group", "Workshop"].map((name, i) => ({ id: `preview-project-${i}`, name, instructions: "", status: "active", createdAt: "2026-08-26", updatedAt: "2026-08-28", archivedAt: null }));
const sessions: SessionDoc[] = ["A shared space for our next round of ideas", "Planning the autumn workshop", "What we learned from the prototype", "Making room for a longer conversation with the whole team", "The next chapter for the studio", "A conversation from earlier this week"].map((title, i) => ({ id: `preview-session-${i}`, title, projectId: projects[i % projects.length].id, autoTitled: true, status: "active", speakerCount: 2, pinned: false, createdAt: "2026-08-26", updatedAt: `2026-08-${28-i}T12:00:00Z`, endedAt: null, trashedAt: null, lastSummaryAt: null, tokenEstimate: 0, searchableTextPreview: "", turnCount: 5, mode: "in_person", transcriptionMode: "basic", botId: null, meetingPlatform: null, botStatus: null }));
export default function HubLayoutCheck() {
  const [empty, setEmpty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [more, setMore] = useState(false);
  const [event, setEvent] = useState("Ready");
  return <div className="kivo-desktop-shell flex h-dvh flex-col bg-app">
    <div className="flex shrink-0 flex-wrap gap-4 px-4 py-2 text-xs text-app-muted">
      <span>Component preview · sample data</span>
      <button onClick={() => setExpanded(v => !v)}>Toggle sidebar</button>
      <button onClick={() => setEmpty(v => !v)}>Toggle empty</button>
      <button onClick={() => setMore(v => !v)}>More projects</button>
      <output aria-label="Last action">{event}</output>
    </div>
    <div className="flex min-h-0 flex-1">
      <aside className={`hidden shrink-0 p-6 lg:block ${expanded ? 'w-[16.25rem]' : 'w-[4.5rem]'}`}><span className="font-serif text-3xl">K</span></aside>
      <section className="kivo-desktop-main kivo-desktop-main--home flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader breadcrumb={null} navigation={<span className="kivo-mobile-nav-trigger lg:hidden"><HeaderIconButton label="Open navigation" onClick={() => setEvent("Navigation")}><span>☰</span></HeaderIconButton></span>} />
        <div className="kivo-desktop-surface flex min-h-0 flex-1 flex-col">
          <div className="kivo-fade-in pointer-events-none flex min-h-0 flex-1 flex-col">
            <SessionHub displayName="Alex" projects={empty ? [] : projects.slice(0, more ? 6 : 4)} sessions={empty ? [] : sessions} activeSession={empty ? null : sessions[0]} onPrimaryAction={() => setEvent("Primary")} onOpenSearch={() => setEvent("Search")} onCreateProject={() => setEvent("Create project")} onSelectProject={id => setEvent(id)} onSelectSession={id => setEvent(id)} />
          </div>
        </div>
      </section>
    </div>
  </div>;
}
