import type { ReactNode } from "react";

/** One card-backed group of rows — the shared "stack" pattern used across
 * every Settings tab (Account, Billing, Model & voice, Trash, Connectors). */
export function SettingsGroup(props: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={props.className ?? "mb-8"}>
      {props.label ? (
        <p className="kivo-settings-group-label">{props.label}</p>
      ) : null}
      <div className="kivo-settings-card">{props.children}</div>
    </section>
  );
}

/** One row inside a `SettingsGroup` card. */
export function SettingsRow(props: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`kivo-settings-card-row${props.last ? " kivo-settings-card-row--last" : ""}`}>
      {props.icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center">
          {props.icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="kivo-settings-row-title">{props.title}</div>
        {props.description ? (
          <div className="kivo-settings-row-desc">{props.description}</div>
        ) : null}
      </div>
      {props.action ? (
        <div className="kivo-settings-row-action shrink-0">{props.action}</div>
      ) : null}
    </div>
  );
}

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
