/** Full-color brand marks from SVGL (https://svgl.app), stored locally in /public/icons/connectors. */
const ICON_PATH: Record<string, string> = {
  notion: "/icons/connectors/notion.svg",
  gmail: "/icons/connectors/gmail.svg",
  googledocs: "/icons/connectors/googledocs.svg",
  googlesheets: "/icons/connectors/googlesheets.svg",
  googledrive: "/icons/connectors/googledrive.svg",
  googlecalendar: "/icons/connectors/googlecalendar.svg",
  slack: "/icons/connectors/slack.svg",
  clickup: "/icons/connectors/clickup.svg",
  outlook: "/icons/connectors/outlook.svg",
};

export function ConnectorIcon({
  slug,
  size = 22,
}: {
  slug: string;
  size?: number;
}) {
  const src = ICON_PATH[slug] ?? `/icons/connectors/${slug}.svg`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      loading="lazy"
      decoding="async"
      aria-hidden
    />
  );
}
