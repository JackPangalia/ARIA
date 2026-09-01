import { cn } from "@/lib/utils";

/** Six-bar mark, viewBox 100×51 — used where the lockup image is too wide. */
export const KIVO_MARK_PATH =
  "M0 0l10.8 6.3v40.1L0 51zM16 9.3l10.8 6.2v30.9L16 50zM32 18.6l10.8 6.2v21.6L32 50zM57.2 24.8L68 18.6V50l-10.8-3.6zM73.2 15.5L84 9.3V50l-10.8-3.6zM89.2 6.3L100 0v51l-10.8-4.6z";

export const KIVO_LOCKUP = {
  src: "/brand/kivo-lockup.png",
  width: 1684,
  height: 382,
} as const;

export function KivoMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 51"
      fill="currentColor"
      className={cn("kivo-logo-mark", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={KIVO_MARK_PATH} shapeRendering="geometricPrecision" />
    </svg>
  );
}

type KivoLogoProps = {
  variant?: "lockup" | "mark" | "wordmark";
  className?: string;
  markClassName?: string;
  title?: string;
  /** White lockup for dark surfaces. Default is black for light surfaces. */
  knockout?: boolean;
};

export function KivoLogo({
  variant = "lockup",
  className,
  markClassName,
  title,
  knockout = false,
}: KivoLogoProps) {
  if (variant === "mark") {
    return <KivoMark className={className} title={title} />;
  }

  if (variant === "wordmark") {
    return (
      <span className={cn("kivo-wordmark", className)}>Kivo</span>
    );
  }

  return (
    <span className={cn("kivo-lockup", knockout && "is-knockout", className)}>
      <img
        src={KIVO_LOCKUP.src}
        alt="Kivo"
        width={KIVO_LOCKUP.width}
        height={KIVO_LOCKUP.height}
        className={cn("kivo-lockup-img", markClassName)}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
