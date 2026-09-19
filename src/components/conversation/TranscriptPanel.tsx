"use client";

import { useEffect, useRef } from "react";
import {
  TranscriptLines,
  type SpeakerCorrectionProps,
} from "@/components/sessions/SessionInsightsPanel";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";
import { PanelClose, PanelHeader } from "./PanelChrome";

export function TranscriptPanel(props: {
  lines: TranscriptLine[];
  isRunning: boolean;
  speakerCorrection?: SpeakerCorrectionProps;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToEndRef = useRef(true);
  const lastId = props.lines[props.lines.length - 1]?.id;

  useEffect(() => {
    if (!stickToEndRef.current) return;
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [lastId, props.lines.length]);

  return (
    <div className="kivo-conv-panel-inner">
      <PanelHeader
        title="Transcript"
        subtitle={props.isRunning ? "Live" : `${props.lines.length} lines`}
        action={<PanelClose label="Close transcript" onClick={props.onClose} />}
      />
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToEndRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="kivo-conv-panel-scroll"
      >
        <TranscriptLines
          lines={props.lines}
          gutter
          speakerCorrection={props.speakerCorrection}
        />
      </div>
    </div>
  );
}
