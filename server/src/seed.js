import "dotenv/config";
import { pool, query, tx } from "./db.js";
import { iso, ORGS, DEFAULT_STAGES } from "./constants.js";

/* Optional demo data — `npm run seed`.
   The original prototype pinned a fake today of 2026-07-24 so its dates lined
   up. Against a real database that would land the whole funnel in the past, so
   every date here is expressed as "days ago" and resolved at insert time. */
const ago = (days) => iso(Date.now() - days * 86400000);
const ahead = (days) => iso(Date.now() + days * 86400000);

const BSBW = [
  { name: "Meridian Injury Partners", vertical: "mva", website: "meridianinjury.com", linkedin: "linkedin.com/company/meridian-injury-partners",
    stage: "fu2", stageSince: ago(6),
    notes: "Wants exclusive MVA leads for Ohio. Asked for a volume estimate.",
    contacts: [{ name: "Dana Reyes", role: "Partner, Business Development",
      email: "d.reyes@meridianinjury.com", phone: "(216) 555-0148" }],
    history: [
      { d: ago(20), t: "Entered outreach" },
      { d: ago(13), t: "1st follow-up sent" },
      { d: ago(6),  t: "2nd follow-up sent" }],
    emails: [
      { dir: "out", at: ago(20), addr: "d.reyes@meridianinjury.com",
        subject: "Exclusive MVA leads for Meridian Injury Partners",
        body: "Hi Dana,\n\nWe sell exclusive, contact-verified MVA leads and Meridian looks like a strong fit for Ohio.\n\nWorth a short call?\n\nBSBW Partnerships" },
      { dir: "out", at: ago(6), addr: "d.reyes@meridianinjury.com",
        subject: "Re: Exclusive MVA leads for Meridian Injury Partners",
        body: "Hi Dana,\n\nFloating this back up in case it got buried. Happy to send volume and pricing for Ohio first if that's easier.\n\nBSBW Partnerships" }] },

  { name: "Sunbelt Pest Solutions", vertical: "pest", website: "sunbeltpest.com",
    stage: "fu1", stageSince: ago(7),
    notes: "Priority vertical. Multi-state footprint.",
    contacts: [{ name: "Marcus Hale", role: "Head of Partnerships",
      email: "mhale@sunbeltpest.com", phone: "(480) 555-0192" }],
    history: [{ d: ago(14), t: "Entered outreach" }, { d: ago(7), t: "1st follow-up sent" }] },

  { name: "Keystone Home Assurance", vertical: "home_ins", website: "keystonehome.com",
    stage: "outreach", stageSince: ago(2),
    notes: "Large carrier. Formal vendor process expected.",
    contacts: [{ name: "Priya Nathan", role: "VP, Customer Acquisition",
      email: "pnathan@keystonehome.com", phone: "(312) 555-0110" }],
    history: [{ d: ago(2), t: "Entered outreach" }] },

  { name: "Cascade Auto Group Ins.", vertical: "auto_ins", website: "cascadeauto-ins.com", linkedin: "linkedin.com/company/cascade-auto-group-insurance-services",
    stage: "responded", stageSince: ago(4), respondedOn: ago(4),
    notes: "Replied to 2nd follow-up. Asked for a rate card.",
    contacts: [{ name: "Tom Beckett", role: "Director, Agent Partnerships",
      email: "tbeckett@cascadeauto-ins.com", phone: "(503) 555-0177" }],
    history: [
      { d: ago(18), t: "Entered outreach" },
      { d: ago(11), t: "1st follow-up sent" },
      { d: ago(4),  t: "Replied — moved to Responded" }],
    emails: [
      { dir: "out", at: ago(11), addr: "tbeckett@cascadeauto-ins.com",
        subject: "Exclusive Auto Insurance leads for Cascade Auto Group Ins.",
        body: "Hi Tom,\n\nEvery lead goes to one buyer only and you set the daily cap. Worth 15 minutes?\n\nBSBW Partnerships" },
      { dir: "in", at: ago(4), addr: "tbeckett@cascadeauto-ins.com", read: false,
        subject: "Re: Exclusive Auto Insurance leads for Cascade Auto Group Ins.",
        body: "Thanks for following up — this is interesting. Can you send a rate card and what volume you'd expect in Oregon and Washington?\n\nTom" }] },

  { name: "Beacon Health Plans", vertical: "aca", website: "beaconhealthplans.com",
    stage: "meeting", stageSince: ago(2), respondedOn: ago(9), meetingOn: ahead(4),
    notes: "Discovery call booked, 2:00pm ET.",
    contacts: [{ name: "Elena Ford", role: "Chief Growth Officer",
      email: "eford@beaconhealthplans.com", phone: "(617) 555-0133" }],
    history: [
      { d: ago(23), t: "Entered outreach" },
      { d: ago(16), t: "1st follow-up sent" },
      { d: ago(9),  t: "Replied — moved to Responded" },
      { d: ago(2),  t: "Meeting booked" }] },

  { name: "Northgate Restoration Co.", vertical: "home_svc", website: "northgaterestore.com",
    stage: "closed", stageSince: ago(5), respondedOn: ago(19), meetingOn: ago(12), closedOn: ago(5),
    notes: "Signed 12-month agreement. Pilot starting shortly.",
    contacts: [{ name: "Rachel Kim", role: "Director of Digital Marketing",
      email: "rkim@northgaterestore.com", phone: "(206) 555-0165" }],
    history: [
      { d: ago(34), t: "Entered outreach" },
      { d: ago(27), t: "1st follow-up sent" },
      { d: ago(19), t: "Replied — moved to Responded" },
      { d: ago(12), t: "Meeting held" },
      { d: ago(5),  t: "Closed — won" }] },

  { name: "Halcyon Legal LLP", vertical: "ssdi", website: "halcyonlegal.com",
    stage: "fu3", stageSince: ago(5),
    notes: "No reply yet after two touches. Last chance before clearing.",
    contacts: [{ name: "Owen Pratt", role: "Business Development Lead",
      email: "opratt@halcyonlegal.com", phone: "(713) 555-0121" }],
    history: [
      { d: ago(26), t: "Entered outreach" },
      { d: ago(19), t: "1st follow-up sent" },
      { d: ago(12), t: "2nd follow-up sent" },
      { d: ago(5),  t: "3rd follow-up sent" }] },
];

/* A second tenant with its own buyers, its own contacts and its own funnel
   positions. Nothing is shared with the list above — which is the point of
   seeding two: switching organizations on the landing page should visibly
   change every number on the screen, not just the logo. */
const CCM = [
  { name: "Ridgeline Disability Law", vertical: "ssdi", website: "ridgelinedisability.com",
    stage: "outreach", stageSince: ago(3),
    notes: "Referred by an existing partner. Wants SSDI volume in the Mountain West.",
    contacts: [{ name: "Alicia Moreno", role: "Managing Attorney",
      email: "amoreno@ridgelinedisability.com", phone: "(303) 555-0119" }],
    history: [{ d: ago(3), t: "Entered outreach" }] },

  { name: "Harborlight Medicare Advisors", vertical: "medicare", website: "harborlightadvisors.com", linkedin: "linkedin.com/company/harborlight-medicare-advisors",
    stage: "fu1", stageSince: ago(8),
    notes: "AEP is their whole year. Timing conversation matters more than price.",
    contacts: [{ name: "Grant Whitfield", role: "Director of Agency Growth",
      email: "gwhitfield@harborlightadvisors.com", phone: "(207) 555-0184" }],
    history: [{ d: ago(15), t: "Entered outreach" }, { d: ago(8), t: "1st follow-up sent" }],
    emails: [
      { dir: "out", at: ago(15), addr: "gwhitfield@harborlightadvisors.com",
        subject: "Medicare leads for Harborlight, ahead of AEP",
        body: "Hi Grant,\n\nWe place contact-verified Medicare leads with a single agency per market, and Harborlight looks like the right fit for coastal New England.\n\nWould it help to look at volume before AEP?\n\nClose Crew Marketing" }] },

  { name: "Fairview Auto Coverage", vertical: "auto_ins", website: "fairviewautocoverage.com",
    stage: "fu2", stageSince: ago(5),
    notes: "Two touches, no reply. Their team is mid-migration to a new dialer.",
    contacts: [{ name: "Denise Okafor", role: "Head of Acquisition",
      email: "dokafor@fairviewautocoverage.com", phone: "(404) 555-0172" }],
    history: [
      { d: ago(19), t: "Entered outreach" },
      { d: ago(12), t: "1st follow-up sent" },
      { d: ago(5),  t: "2nd follow-up sent" }] },

  { name: "Copperfield Injury Group", vertical: "mva", website: "copperfieldinjury.com",
    stage: "responded", stageSince: ago(2), respondedOn: ago(2),
    notes: "Replied same day. Wants a 20-lead pilot before committing to a cap.",
    contacts: [{ name: "Wes Duncan", role: "Intake Director",
      email: "wduncan@copperfieldinjury.com", phone: "(602) 555-0157" }],
    history: [
      { d: ago(10), t: "Entered outreach" },
      { d: ago(2),  t: "Replied — moved to Responded" }],
    emails: [
      { dir: "out", at: ago(10), addr: "wduncan@copperfieldinjury.com",
        subject: "Exclusive MVA leads for Copperfield Injury Group",
        body: "Hi Wes,\n\nEvery lead is exclusive to one firm and you set the daily cap. Arizona volume is available now.\n\nWorth a short call?\n\nClose Crew Marketing" },
      { dir: "in", at: ago(2), addr: "wduncan@copperfieldinjury.com", read: false,
        subject: "Re: Exclusive MVA leads for Copperfield Injury Group",
        body: "Interested. Could we start with a 20-lead pilot and see how intake handles the volume before we agree a daily cap?\n\nWes" }] },

  { name: "Trellis Home Services", vertical: "home_svc", website: "trellishome.com", linkedin: "linkedin.com/company/trellis-home-services-group",
    stage: "meeting", stageSince: ago(1), respondedOn: ago(7), meetingOn: ahead(2),
    notes: "Call booked with their CMO. Bring the roofing and HVAC breakdown.",
    contacts: [{ name: "Sofia Berman", role: "Chief Marketing Officer",
      email: "sberman@trellishome.com", phone: "(512) 555-0143" }],
    history: [
      { d: ago(21), t: "Entered outreach" },
      { d: ago(14), t: "1st follow-up sent" },
      { d: ago(7),  t: "Replied — moved to Responded" },
      { d: ago(1),  t: "Meeting booked" }] },

  { name: "Anchor State Insurance", vertical: "home_ins", website: "anchorstateins.com",
    stage: "closed", stageSince: ago(9), respondedOn: ago(28), meetingOn: ago(17), closedOn: ago(9),
    notes: "Signed for two states, expanding to four in Q2 if the pilot holds.",
    contacts: [{ name: "Ibrahim Qureshi", role: "VP Distribution",
      email: "iqureshi@anchorstateins.com", phone: "(919) 555-0136" }],
    history: [
      { d: ago(41), t: "Entered outreach" },
      { d: ago(34), t: "1st follow-up sent" },
      { d: ago(28), t: "Replied — moved to Responded" },
      { d: ago(17), t: "Meeting held" },
      { d: ago(9),  t: "Closed — won" }] },
];

const DEMO = { bsbw: BSBW, ccm: CCM };

/* ---------------------------------------------------------------------- */

/* The demo rows still carry the old catalogue tags ('mva', 'pest', …); each
   becomes a real vertical in the org being seeded, with the legacy column set
   and the demo record written into `data` under it. This is the same shape the
   schema migration gives adopted rows, so seeded and migrated installs look
   identical. */
const LEGACY_COLUMNS = JSON.stringify([
  { key: "company",  label: "Company",  type: "text",     role: "name" },
  { key: "contact",  label: "Contact",  type: "text",     role: null },
  { key: "email",    label: "Email",    type: "email",    role: "email", linkTo: "contact" },
  { key: "phone",    label: "Phone",    type: "phone",    role: null },
  { key: "website",  label: "Website",  type: "url",      role: "website" },
  { key: "linkedin", label: "LinkedIn", type: "url",      role: null },
  { key: "notes",    label: "Notes",    type: "longtext", role: "notes" },
]);

const TAG_NAMES = {
  mva: "MVA", ssdi: "SSDI", medicare: "Medicare", aca: "ACA",
  auto_ins: "Auto Insurance", home_ins: "Home Insurance",
  pest: "Pest Control", home_svc: "Home Services",
};

async function ensureVertical(client, orgId, tag) {
  const slug = tag.replace(/_/g, "-");
  const name = TAG_NAMES[tag] || tag;
  const { rows } = await client.query(
    `INSERT INTO verticals (org_id, slug, name, columns, setup_done, position)
     VALUES ($1, $2, $3, $4::jsonb, true,
             COALESCE((SELECT max(position) + 1 FROM verticals WHERE org_id = $1), 0))
     ON CONFLICT (org_id, slug) DO UPDATE SET name = verticals.name
     RETURNING id`,
    [orgId, slug, name, LEGACY_COLUMNS]);
  const id = rows[0].id;

  const { rows: [{ n }] } = await client.query(
    `SELECT count(*)::int AS n FROM stages WHERE vertical_id = $1`, [id]);
  if (!n) {
    for (const [i, s] of DEFAULT_STAGES.entries())
      await client.query(
        `INSERT INTO stages (vertical_id, org_id, id, label, sub, accent, wait, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, orgId, s.id, s.label, s.sub, s.accent, s.wait, i]);
  }
  return id;
}

async function seedCompanies(orgId, records) {
  /* One transaction per organization: a half-seeded tenant is worse than an
     empty one, and one org failing shouldn't take the other's data with it. */
  await tx(async (client) => {
    for (const c of records) {
      const verticalId = await ensureVertical(client, orgId, c.vertical);
      const first = (c.contacts || [])[0] || {};
      const data = {};
      for (const [k, v] of Object.entries({
        company: c.name, contact: first.name, email: first.email,
        phone: first.phone, website: c.website, linkedin: c.linkedin,
        notes: c.notes,
      })) if (v) data[k] = v;

      const { rows: [row] } = await client.query(
        `INSERT INTO companies
           (org_id, vertical_id, name, data, website, linkedin, stage, stage_since, notes,
            responded_on, meeting_on, closed_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [orgId, verticalId, c.name, JSON.stringify(data), c.website, c.linkedin || "",
         c.stage, c.stageSince, c.notes || "",
         c.respondedOn || null, c.meetingOn || null, c.closedOn || null]);

      for (const [i, k] of (c.contacts || []).entries())
        await client.query(
          `INSERT INTO contacts (company_id, name, role, email, phone, position)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [row.id, k.name, k.role || "", k.email || "", k.phone || "", i]);

      for (const h of c.history || [])
        await client.query(`INSERT INTO history (company_id, d, t) VALUES ($1,$2,$3)`,
          [row.id, h.d, h.t]);

      for (const m of c.emails || [])
        await client.query(
          `INSERT INTO emails (company_id, direction, at, addr, subject, body, read)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [row.id, m.dir, m.at, m.addr || "", m.subject, m.body, m.read ?? true]);
    }
  });
}

async function main() {
  const force = process.argv.includes("--force");

  for (const o of ORGS) {
    const records = DEMO[o.id];
    if (!records) continue;

    /* Counted per organization: a database carrying real BSBW data from before
       tenancy should still be able to seed an empty CCM. */
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM companies WHERE org_id = $1`, [o.id]);

    if (rows[0].n > 0 && !force) {
      console.log(`· ${o.name} already has ${rows[0].n} companies — nothing seeded.`);
      continue;
    }

    await seedCompanies(o.id, records);
    console.log(`✓ seeded ${records.length} demo companies into ${o.name}`);
  }

  if (force) console.log("  (--force: demo rows were added alongside anything already there)");

  console.log("");
  console.log("  Open http://localhost:5173 and pick an organization. There is no sign-in.");
  console.log("");

  await pool.end();
}

main().catch((e) => {
  console.error("seed failed:", e.message);
  process.exit(1);
});
