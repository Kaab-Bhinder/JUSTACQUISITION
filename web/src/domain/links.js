/* ----------------------------------------------------------------------
   Company links

   Websites and LinkedIn pages are stored bare — no scheme, no www, no trailing
   slash — so the same site typed two ways dedupes on import. That means the
   scheme has to go back on before anything can be clicked, which is what
   `href` does.

   Nothing here ever renders the URL itself. A LinkedIn company URL is routinely
   sixty characters and there is no width in a sidebar, a table cell or a
   420px drawer where that fits; it overflowed the drawer, which is what
   prompted this. What gets rendered is the word "Website" or "LinkedIn", so
   the label is a fixed size no matter what the URL is, and the full address
   goes in the title attribute for anyone who wants to read it.
---------------------------------------------------------------------- */

export const href = (url) => {
  const s = String(url ?? "").trim();
  if (!s) return "";
  /* Only http(s) is ever produced. Anything else — javascript:, data: — would
     be a link the app built out of a value someone typed into a spreadsheet. */
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
  return `https://${s}`;
};

const isLinkedIn = (url) => /(^|\.|\/\/)linkedin\.com\//i.test(String(url ?? "")) ||
  /^linkedin\.com/i.test(String(url ?? "").trim());

/* What to show for a company, in a fixed order so two cards never disagree
   about which button comes first.

   A LinkedIn URL pasted into the website field is shown as LinkedIn — that is
   what it is, and before this existed as its own field it is where people put
   it. The reverse never happens, so it is not looked for. */
export function linksFor(c) {
  const out = [];
  const site = String(c?.website ?? "").trim();
  const li = String(c?.linkedin ?? "").trim();

  if (site && !isLinkedIn(site)) out.push({ kind: "web", url: site });
  if (li) out.push({ kind: "linkedin", url: li });
  else if (site && isLinkedIn(site)) out.push({ kind: "linkedin", url: site });

  return out.filter(l => href(l.url));
}
