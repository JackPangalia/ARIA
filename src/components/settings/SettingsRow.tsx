import type { ReactNode } from "react";

export function GrokSettingsRow(props: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grok-settings-row">
      {props.icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          {props.icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 py-3">
        <div className="grok-settings-row-title">{props.title}</div>
        {props.description ? (
          <div className="grok-settings-row-sub">{props.description}</div>
        ) : null}
      </div>
      {props.action ? <div className="shrink-0 py-3">{props.action}</div> : null}
    </div>
  );
}

function GrokSettingsButtonComponent(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  variant?: "default" | "primary" | "ghost" | "ghost-danger";
}) {
  const variant =
    props.variant ?? (props.danger ? "default" : "default");

  const className = [
    "grok-settings-btn",
    variant === "primary" ? "grok-settings-btn-primary" : "",
    variant === "ghost" ? "grok-settings-btn-ghost" : "",
    variant === "ghost-danger" ? "grok-settings-btn-ghost-danger" : "",
    variant === "default" && props.danger ? "grok-settings-btn-danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={className}
    >
      {props.children}
    </button>
  );
}

export const GrokSettingsButton = GrokSettingsButtonComponent;
export const SettingsGhostButton = GrokSettingsButtonComponent;
