"use client";

import { EditableSessionTitle } from "@/components/aria/EditableSessionTitle";
import {
  ContentModeToggle,
  type OverviewContentMode,
} from "@/components/sessions/OverviewView";
import { useEducationAnchor } from "@/components/education/EducationProvider";
import "./overview-header.css";

export function OverviewTray(props: {
  title: string;
  onRenameTitle: (title: string) => void;
  mode: OverviewContentMode;
  onChangeMode: (mode: OverviewContentMode) => void;
  resume: boolean;
  onResume: () => void;
  resumeDisabled?: boolean;
  /** Hide Summary / Transcript when there is nothing to switch. */
  showModes?: boolean;
  /** Hide the header pill when the page already has the same CTA. */
  showResume?: boolean;
}) {
  const educationAnchor = useEducationAnchor<HTMLDivElement>("overview");
  const showModes = props.showModes ?? true;
  const showResume = props.showResume ?? true;
  return (
    <div
      className="kivo-overview-tray"
      role="toolbar"
      aria-label="Conversation controls"
    >
      <div ref={educationAnchor} className="kivo-overview-tray-title">
        <EditableSessionTitle
          variant="tray"
          title={props.title}
          onRenameTitle={props.onRenameTitle}
        />
      </div>
      {showModes || showResume ? (
        <div className="kivo-overview-tray-actions">
          {showModes ? (
            <ContentModeToggle
              header
              mode={props.mode}
              onChange={props.onChangeMode}
            />
          ) : null}
          {showResume ? (
            <button
              type="button"
              onClick={props.onResume}
              disabled={props.resumeDisabled}
              className="kivo-overview-start"
            >
              {props.resume ? "Resume" : "Start"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
