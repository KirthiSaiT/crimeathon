const dt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const d = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmtTime = (iso: string) => dt.format(new Date(iso)).replace(",", "").replace("Sept", "Sep");
export const fmtDate = (iso: string) => d.format(new Date(iso)).replace("Sept", "Sep");
export const fmtRange = (start: string, end: string) => {
  if (start === end) return `${fmtTime(start)} UTC`;
  const same = start.slice(0, 10) === end.slice(0, 10);
  return same ? `${fmtTime(start)} to ${fmtTime(end).split(" ").slice(-1)[0]} UTC` : `${fmtTime(start)} to ${fmtTime(end)} UTC`;
};
