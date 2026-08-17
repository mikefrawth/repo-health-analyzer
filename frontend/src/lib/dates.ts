/**
 * Report timestamps are rendered on the server, so they are formatted in UTC
 * with an explicit locale — a server rendering in one timezone and a client
 * hydrating in another would otherwise disagree about the text.
 */

const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatReportDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return `${FORMATTER.format(date)} UTC`;
}
