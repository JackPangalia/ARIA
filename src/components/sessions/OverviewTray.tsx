"use client";

import type { ReactNode } from "react";
import { EditableSessionTitle } from "@/components/aria/EditableSessionTitle";
import {
  FileIcon,
  SessionIcon,
} from "@/components/sessions/icons";
import type { OverviewContentMode } from "@/components/sessions/OverviewView";

function ResumeArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OverviewTray(props: {
  title: string;
  onRenameTitle: (title: string) => void;
  mode: OverviewContentMode;
  onChangeMode: (mode: OverviewContentMode) => void;
  resume: boolean;
  onResume: () => void;
  resumeDisabled?: boolean;
  leading?: ReactNode;
}) {
  return (
    <div
      className="kivo-overview-tray"
      role="toolbar"
      aria-label="Conversation controls"
    >
      {props.leading}
      <div className="kivo-overview-tray-title">
        <EditableSessionTitle
          variant="tray"
          title={props.title}
          onRenameTitle={props.onRenameTitle}
        />
      </div>
      <div className="kivo-overview-tray-actions">
        <div
          className="kivo-overview-tray-tabs"
          role="tablist"
          aria-label="Overview content"
        >
          <button
            id="overview-tab-summary"
            type="button"
            role="tab"
            aria-controls="overview-panel-summary"
            aria-selected={props.mode === "summary"}
            title="Summary"
            onClick={() => props.onChangeMode("summary")}
            className={`kivo-rail-row kivo-overview-tray-row ${
              props.mode === "summary" ? "is-active" : ""
            }`}
          >
            <span className="kivo-rail-icon">
              <FileIcon size={18} />
            </span>
            <span className="kivo-rail-label">Summary</span>
          </button>
          <button
            id="overview-tab-transcript"
            type="button"
            role="tab"
            aria-controls="overview-panel-transcript"
            aria-selected={props.mode === "transcript"}
            title="Transcript"
            onClick={() => props.onChangeMode("transcript")}
            className={`kivo-rail-row kivo-overview-tray-row ${
              props.mode === "transcript" ? "is-active" : ""
            }`}
          >
            <span className="kivo-rail-icon">
              <SessionIcon size={18} />
            </span>
            <span className="kivo-rail-label">Transcript</span>
          </button>
        </div>
        <button
          type="button"
          onClick={props.onResume}
          disabled={props.resumeDisabled}
          title={props.resume ? "Resume" : "Start"}
          className="kivo-rail-row kivo-overview-tray-row is-primary"
        >
          <span className="kivo-rail-icon">
            <ResumeArrowIcon />
          </span>
          <span className="kivo-rail-label">
            {props.resume ? "Resume" : "Start"}
          </span>
        </button>
      </div>
    </div>
  );
}
