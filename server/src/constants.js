/* Shared server-side constants.

   The vertical catalogue that used to live here is gone: a vertical is a row
   in the verticals table now, created by each organization and carrying its
   own columns, script and sending account. Merge tags moved with it — see
   columns.js, which resolves them against a vertical's own column set. */

/* Lifecycle states that sit outside the editable funnel. */
export const TERMINAL = ["responded", "meeting", "closed"];

export const DEFAULT_STAGES = [
  { id: "outreach", label: "Outreach",    sub: "Not yet contacted",      accent: "#7E9895", wait: 7 },
  { id: "fu1",      label: "Follow-up 1", sub: "1 week after outreach",  accent: "#0E9F94", wait: 7 },
  { id: "fu2",      label: "Follow-up 2", sub: "2 weeks after outreach", accent: "#5B6BF0", wait: 7 },
  { id: "fu3",      label: "Follow-up 3", sub: "3 weeks after outreach", accent: "#9B5DE5", wait: 7 },
];

/* Brand colours are no longer a fixed palette: an organization picks any
   colour from a spectrum, and the ink that reads on it plus the text tints
   beside it are derived from that one value in web/src/domain/colour.js. The
   API therefore validates that a colour is a colour and stores nothing else —
   there is no second value that could disagree with the first. */

/* ---- the organizations the product ships with -------------------------
   Created by `npm run migrate`. Everything else about a tenant is editable
   from the app afterwards, and more can be added from the landing page — these
   two are simply what an empty install starts with rather than a special case
   anywhere in the code.

   BSBW's entry is duplicated as a literal in schema.sql, which creates it while
   adopting rows from a database that predates tenancy. It has to be there: the
   ALTER TABLE that adds companies.org_id needs something to point at, and by
   then this file hasn't been imported. Keep the two in step.
------------------------------------------------------------------------ */
export const ORGS = [
  {
    id: "bsbw",
    name: "BSBW",
    fullName: "BSBW Partnerships",
    mark: "B",
    tagline: "Exclusive, contact-verified leads for injury law, insurance and home services.",
    accent: "#0ABAB5",
    verticals: ["mva", "ssdi", "medicare", "aca", "auto_ins", "home_ins", "pest", "home_svc"],
    senderName: "BSBW Partnerships",
    senderEmail: "partners@bsbw.co",
  },
  {
    id: "ccm",
    name: "CCM",
    fullName: "Close Crew Marketing",
    mark: "CC",
    tagline: "Performance marketing and buyer acquisition for high-intent verticals.",
    /* Violet, to sit with the mark's own gradient. */
    accent: "#7C3AED",
    verticals: ["mva", "ssdi", "medicare", "auto_ins", "home_ins", "home_svc"],
    logo: "/brand/ccm.svg",
    senderName: "Close Crew Marketing",
    senderEmail: "hello@closecrew.co",
  },
];

/* Fallback signature for an organization that hasn't set its own. Outbound
   mail is sent by the user from Gmail, so this is a label on the composer and
   nothing more — it does not control what address anything leaves from. */
export const SENDER = {
  name: process.env.SENDER_NAME || "Partnerships",
  email: process.env.SENDER_EMAIL || "",
};

export const senderFor = (org) => ({
  name: org?.senderName || org?.name || SENDER.name,
  email: org?.senderEmail || SENDER.email,
});

/* A plain local-calendar day, matching web/src/domain/dates.js and
   mail/parse.js. toISOString() would render the UTC day instead, which shifts
   across midnight either way depending on the offset — so a row seeded in the
   evening reads as tomorrow, which is exactly what the DATE type parser in
   db.js exists to prevent. */
export const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
