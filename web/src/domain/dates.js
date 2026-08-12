export const DAY = 86400000;
/* The prototype pinned a fake today so its hand-written demo dates lined up.
   Against a real database that would put the whole funnel permanently in the
   past, so this is the actual date — normalised to local midnight, because
   every date in the system is a plain day and "is this overdue" must not flip
   depending on the time of day you look. */
export const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

/* Local calendar date, not UTC. toISOString() would roll back a day for anyone
   west of Greenwich, so a company stamped at 8pm would read as yesterday. */
export const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / DAY);
export const fmtDate = (s) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });

