-- Buyer Outreach CRM — Postgres schema
--
-- Safe to re-run. MIGRATIONS reshapes an older database; CREATE then describes
-- the shape we want and is all IF NOT EXISTS. Running this against a fresh
-- database and against a live one both end in the same place.
--
-- Order matters: migrations must come first. CREATE TABLE IF NOT EXISTS is a
-- no-op on a table that already exists, so a column rename has to happen before
-- any index that names the new column, or the index fails on a live database.

-- ===========================================================================
-- MIGRATIONS
-- Each block checks before it acts, so this section is a no-op both on a fresh
-- database and on one already up to date.
-- ===========================================================================

-- Reply syncing moved from the Gmail API to plain IMAP, so columns that named
-- Gmail specifically are now wrong: the ids they hold are ordinary RFC
-- Message-IDs, which any mail server produces.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'emails' AND column_name = 'gmail_id') THEN
    ALTER TABLE emails RENAME COLUMN gmail_id TO message_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'emails' AND column_name = 'gmail_thread_id') THEN
    ALTER TABLE emails RENAME COLUMN gmail_thread_id TO thread_id;
  END IF;

  -- Only ever read to thread a Gmail API send, which no longer happens.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'companies' AND column_name = 'gmail_thread_id') THEN
    ALTER TABLE companies DROP COLUMN gmail_thread_id;
  END IF;
END $$;

-- Held an OAuth refresh token. IMAP needs no stored credential, so this table
-- is not merely unused: keeping it would leave a live token sitting in the
-- database with nothing left to invalidate it.
DROP TABLE IF EXISTS gmail_account;

-- ===========================================================================
-- CREATE — tenancy
--
-- `organizations` comes before the migrations that follow it, because the
-- ALTER TABLE that gives companies an org_id needs it to exist to point at.
-- It is created with IF NOT EXISTS, so this is safe on a fresh database and on
-- a live one alike.
-- ===========================================================================

-- An organization is a tenant: its own companies, its own funnel stages, its
-- own members. Everything else in this file hangs off one of these.
--
-- The id is a slug the user picks ('bsbw', 'ccm') rather than a serial, because
-- it appears in the URL the browser bookmarks and in the X-Org-Id header every
-- request carries. A number would work but tells you nothing when you're
-- reading a log line.
CREATE TABLE IF NOT EXISTS organizations (
  id           TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  name         TEXT NOT NULL,
  full_name    TEXT NOT NULL DEFAULT '',
  -- One or two letters for the logo tile. Stored rather than derived: "Close
  -- Crew Marketing" wants CC, not C.
  mark         TEXT NOT NULL DEFAULT '',
  tagline      TEXT NOT NULL DEFAULT '',
  -- Brand colour. Any colour, picked from a spectrum rather than a fixed
  -- palette, so the ink that goes on top and the text tints that go beside it
  -- are all derived from it (web/src/domain/colour.js) rather than stored.
  -- They were stored once, back when the palette was seven approved pairs;
  -- storing a derived value the client recomputes anyway is how the two drift.
  accent       TEXT NOT NULL DEFAULT '#0ABAB5',
  -- Which verticals this organization sells into. At least one; the full list
  -- lives in constants.js. Constrains the pickers, the filter and the import
  -- so a tenant only ever sees the business it is actually in.
  verticals    TEXT[] NOT NULL DEFAULT '{}',
  -- A URL or data: URI for the organization's own mark, shown instead of the
  -- initials tile. Empty for a tenant that hasn't supplied one, which is the
  -- normal case — `mark` above is the fallback, not a second-class option.
  logo         TEXT NOT NULL DEFAULT '',
  -- Shown on the composer. Outbound mail is sent by the user from Gmail, so
  -- this is a label, not a delivery setting.
  sender_name  TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after organizations shipped, so these need their own ALTERs on any
-- database created before them. IF NOT EXISTS makes them no-ops elsewhere.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verticals TEXT[] NOT NULL DEFAULT '{}';

-- `ink` was stored back when brand colours came from a fixed palette of seven
-- checked pairs. Colours are now free, so the ink that reads on one is derived
-- from it. Dropping the column rather than leaving it is the point: a stale
-- copy of a derived value is worse than no copy, because something will read it.
ALTER TABLE organizations DROP COLUMN IF EXISTS ink;

-- An organization created before verticals existed sells into all of them,
-- which is what it effectively did when the list was global. Only ever fills a
-- blank, so a tenant that has since chosen its own is untouched.
UPDATE organizations
   SET verticals = ARRAY['mva','ssdi','medicare','aca','auto_ins','home_ins','pest','home_svc']
 WHERE cardinality(verticals) = 0;

-- Accounts, memberships and sessions were here. There are no user accounts
-- now: anyone who can reach the app can open either organization, and the one
-- privileged action — creating an organization — is gated on an administrator
-- email and password held in server/.env, not in the database.
--
-- Dropped rather than left standing. A users table nothing reads is not
-- harmless: it still holds password hashes and email addresses, and the next
-- person to read this schema would reasonably assume logging in is a thing.
-- Order matters — sessions and memberships reference users.
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------------------
-- A vertical: one line of business inside an organization, and the unit the
-- whole CRM is now organised around.
--
-- It was a tag on a company chosen from a fixed catalogue of eight. It is now a
-- row an organization creates for itself, and it owns everything that used to
-- be global or org-level:
--
--   columns  the shape of this vertical's spreadsheet, declared once by the
--            person who owns it. Import maps onto these, the table renders
--            these, the add form is generated from these, and the merge tags
--            available to the email script are these.
--   subject  the outreach script. Per vertical because the pitch for MVA has
--   body     nothing to do with the pitch for pest control.
--   smtp_*   the mailbox this vertical outreaches from.
--
-- Stages hang off it too (see the migration below), so two verticals in one
-- organization can run different funnels.
--
-- `columns` is JSONB rather than its own table: it is a document that is always
-- read whole, always written whole, and never queried across rows. A table
-- would buy joins nobody needs and cost an ordering column to keep it in the
-- order the user dragged it into.
CREATE TABLE IF NOT EXISTS verticals (
  id          SERIAL PRIMARY KEY,
  org_id      TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- In the URL fragment, like the org id above it, and for the same reason.
  slug        TEXT    NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,38}$'),
  name        TEXT    NOT NULL,
  accent      TEXT    NOT NULL DEFAULT '#0ABAB5',
  columns     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  subject     TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',
  -- The sending mailbox. smtp_secret holds a Gmail app password sealed by
  -- crypto.js — the plaintext never touches the database and never leaves the
  -- server, so no API response can carry it back to a browser.
  smtp_user   TEXT    NOT NULL DEFAULT '',
  smtp_secret TEXT    NOT NULL DEFAULT '',
  smtp_from   TEXT    NOT NULL DEFAULT '',
  -- The From ADDRESS on outgoing mail, when it differs from the account that
  -- authenticates: a Gmail "Send mail as" alias (wahaj@customdomain.com sent
  -- through wahajshah93@gmail.com). Empty means "send as the auth account",
  -- which is the behaviour everything had before this column existed. Not a
  -- credential — Gmail itself enforces that only verified aliases go out, and
  -- silently rewrites the From if this isn't one.
  smtp_send_as TEXT   NOT NULL DEFAULT '',
  -- Which mail server this account authenticates against. Empty means the
  -- installation default (Gmail). A domain mailbox — wahaj@customdomain.com
  -- on its host's own SMTP — sets these, and the From domain then matches
  -- the authenticating server: no "via gmail.com" annotation, and the
  -- domain's own SPF applies. Port 0 = default for the host (465).
  smtp_host   TEXT    NOT NULL DEFAULT '',
  smtp_port   INTEGER NOT NULL DEFAULT 0,
  -- Which of this vertical's own stages a replying lead moves INTO — and
  -- only ever forward: a lead already at or past it stays put, so a second
  -- reply can never drag a Meeting back to Responded. Empty = replies file
  -- on the thread and flag unread, but never move a stage.
  replied_stage TEXT  NOT NULL DEFAULT '',
  -- False until the first-run wizard finishes. Opening an unfinished vertical
  -- resumes the wizard instead of showing an empty board whose columns nobody
  -- has described yet.
  setup_done  BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX IF NOT EXISTS verticals_org_idx ON verticals (org_id, position, id);

-- Added after verticals shipped; no-ops wherever they already exist.
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS smtp_send_as TEXT NOT NULL DEFAULT '';
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS smtp_host TEXT NOT NULL DEFAULT '';
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS smtp_port INTEGER NOT NULL DEFAULT 0;
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS replied_stage TEXT NOT NULL DEFAULT '';

-- Seed the reply-landing stage where a pipeline plainly has one: a stage
-- whose id or label says "responded"/"replied". Verticals without one keep
-- '' — replies file and flag, nothing moves until the owner marks a stage.
UPDATE verticals v SET replied_stage = (
  SELECT s.id FROM stages s WHERE s.vertical_id = v.id
    AND (s.id ~* 'respond|replied' OR s.label ~* 'respond|replied')
  ORDER BY s.position LIMIT 1)
 WHERE replied_stage = '' AND EXISTS (
  SELECT 1 FROM stages s WHERE s.vertical_id = v.id
    AND (s.id ~* 'respond|replied' OR s.label ~* 'respond|replied'));

-- Leads stranded in the legacy 'responded' state — written by the old
-- filing rule into a stage no pipeline contains — move into their
-- vertical's marked reply-landing stage where one exists. Where none does,
-- they stay put for the Update-stage dropdown to rescue by hand. Idempotent:
-- 'responded' never matches a real stage id the wizard generates.
UPDATE companies c SET stage = v.replied_stage, updated_at = now()
  FROM verticals v
 WHERE v.id = c.vertical_id
   AND c.stage = 'responded'
   AND v.replied_stage <> ''
   AND NOT EXISTS (SELECT 1 FROM stages s
                    WHERE s.vertical_id = v.id AND s.id = 'responded');

-- Send-As is a Gmail-alias concept: on a custom mail host the account sends
-- as itself. Clear any alias stored from before that rule existed, so what
-- settings show is what sends. Idempotent.
UPDATE verticals SET smtp_send_as = ''
 WHERE smtp_host <> '' AND smtp_host NOT LIKE '%gmail.com';

-- ===========================================================================
-- MIGRATIONS — single tenant to multi tenant
--
-- Must run before the CREATE section below, not after it, for the reason
-- stated at the top of this file: CREATE TABLE IF NOT EXISTS is a no-op on a
-- table that already exists, so on a live database `companies` keeps the shape
-- it has — and every index down there names org_id. Add the column first or
-- the index fails.
--
-- Each block is guarded on the table existing AND the column not existing, so
-- a fresh database skips all of it (nothing to migrate) and an already-migrated
-- one skips it too.
-- ===========================================================================

-- The tenant that adopts data from before organizations existed. Created here
-- rather than in seed.js because the ALTER TABLE below needs something to
-- reference, and a database that has companies must never be left with rows
-- that belong to nobody. Duplicated as a literal from constants.js ORGS —
-- keep the two in step.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name = 'companies')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'companies' AND column_name = 'org_id') THEN

    INSERT INTO organizations (id, name, full_name, mark, tagline, accent,
                               sender_name, sender_email)
    VALUES ('bsbw', 'BSBW', 'BSBW Partnerships', 'B',
            'Exclusive, contact-verified leads for injury law, insurance and home services.',
            '#0ABAB5', 'BSBW Partnerships', 'partners@bsbw.co')
    ON CONFLICT (id) DO NOTHING;

    ALTER TABLE companies ADD COLUMN org_id TEXT;
    UPDATE companies SET org_id = 'bsbw' WHERE org_id IS NULL;
    ALTER TABLE companies
      ALTER COLUMN org_id SET NOT NULL,
      ADD CONSTRAINT companies_org_fk
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- stages gained org_id and a composite primary key. Rebuilding a PK can't be
-- expressed as IF NOT EXISTS, so the whole block is guarded on the column.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name = 'stages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'stages' AND column_name = 'org_id') THEN

    INSERT INTO organizations (id, name, full_name, mark, tagline, accent,
                               sender_name, sender_email)
    VALUES ('bsbw', 'BSBW', 'BSBW Partnerships', 'B',
            'Exclusive, contact-verified leads for injury law, insurance and home services.',
            '#0ABAB5', 'BSBW Partnerships', 'partners@bsbw.co')
    ON CONFLICT (id) DO NOTHING;

    ALTER TABLE stages ADD COLUMN org_id TEXT;
    UPDATE stages SET org_id = 'bsbw' WHERE org_id IS NULL;
    ALTER TABLE stages
      ALTER COLUMN org_id SET NOT NULL,
      ADD CONSTRAINT stages_org_fk
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

    -- The old PK was (id) alone, which would stop two tenants both having an
    -- 'outreach' stage — the single most likely thing to happen.
    ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_pkey;
    ALTER TABLE stages ADD PRIMARY KEY (org_id, id);
  END IF;
END $$;

-- The pre-tenancy indexes named only the column, so they no longer match the
-- queries, which all lead with org_id. Dropping them here lets the CREATE INDEX
-- statements below recreate them in the right shape. No rows come back on a
-- fresh database, so this is a no-op there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = current_schema() AND indexname = 'companies_name_idx'
                AND indexdef NOT LIKE '%org_id%') THEN
    DROP INDEX companies_name_idx;
    DROP INDEX IF EXISTS companies_website_idx;
    DROP INDEX IF EXISTS companies_stage_idx;
  END IF;
END $$;

-- ===========================================================================
-- MIGRATIONS — one vertical tag to many verticals
--
-- `companies.vertical` was a text tag picked from a catalogue of eight the
-- product shipped. A vertical is now a row an organization creates, and it owns
-- the columns, the script, the mailbox and the funnel. So every tag actually in
-- use becomes one — per organization, because two tenants both working MVA are
-- running two different pipelines with two different sheets.
--
-- Guarded on companies.vertical_id not existing, so it runs exactly once.
-- Nothing is discarded: a company keeps its stage, its dates, its contacts and
-- its thread, and the fixed fields it already had are copied into `data` under
-- a column set that describes them. A row the join somehow misses is given a
-- General vertical rather than deleted.
-- ===========================================================================
DO $$
DECLARE
  v RECORD;
  -- The shape the CRM had when every vertical was the same shape. Migrated
  -- verticals open on exactly the columns their data already fills, and can be
  -- edited from the app afterwards like any other.
  legacy_cols CONSTANT JSONB := '[
    {"key":"company",  "label":"Company",  "type":"text",     "role":"name"},
    {"key":"contact",  "label":"Contact",  "type":"text",     "role":null},
    {"key":"email",    "label":"Email",    "type":"email",    "role":"email", "linkTo":"contact"},
    {"key":"phone",    "label":"Phone",    "type":"phone",    "role":null},
    {"key":"website",  "label":"Website",  "type":"url",      "role":"website"},
    {"key":"linkedin", "label":"LinkedIn", "type":"url",      "role":null},
    {"key":"notes",    "label":"Notes",    "type":"longtext", "role":"notes"}
  ]'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name = 'companies')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'companies' AND column_name = 'vertical_id') THEN

    ALTER TABLE companies ADD COLUMN vertical_id INTEGER;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

    -- One vertical per (organization, tag in use). The eight shipped ids get
    -- their old display names back here — as a courtesy to existing data, not
    -- as a catalogue: nothing offers this list to anyone creating a vertical.
    FOR v IN
      SELECT DISTINCT
             org_id,
             COALESCE(NULLIF(btrim(regexp_replace(
               lower(btrim(vertical)), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'general') AS slug,
             COALESCE(NULLIF(btrim(vertical), ''), 'general') AS tag
        FROM companies
    LOOP
      INSERT INTO verticals (org_id, slug, name, columns, setup_done)
      VALUES (v.org_id, v.slug,
              CASE v.tag
                WHEN 'mva'      THEN 'MVA'
                WHEN 'ssdi'     THEN 'SSDI'
                WHEN 'medicare' THEN 'Medicare'
                WHEN 'aca'      THEN 'ACA'
                WHEN 'auto_ins' THEN 'Auto Insurance'
                WHEN 'home_ins' THEN 'Home Insurance'
                WHEN 'pest'     THEN 'Pest Control'
                WHEN 'home_svc' THEN 'Home Services'
                WHEN 'general'  THEN 'General'
                ELSE initcap(replace(v.tag, '_', ' '))
              END,
              legacy_cols, true)
      ON CONFLICT (org_id, slug) DO NOTHING;
    END LOOP;

    UPDATE companies c
       SET vertical_id = vt.id
      FROM verticals vt
     WHERE vt.org_id = c.org_id
       AND vt.slug = COALESCE(NULLIF(btrim(regexp_replace(
             lower(btrim(c.vertical)), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'general');

    -- Belt and braces. A row with no home would fail the NOT NULL below, and
    -- the right answer to that is a General vertical, never a DELETE.
    INSERT INTO verticals (org_id, slug, name, columns, setup_done)
      SELECT DISTINCT c.org_id, 'general', 'General', legacy_cols, true
        FROM companies c WHERE c.vertical_id IS NULL
      ON CONFLICT (org_id, slug) DO NOTHING;
    UPDATE companies c SET vertical_id = vt.id
      FROM verticals vt
     WHERE c.vertical_id IS NULL AND vt.org_id = c.org_id AND vt.slug = 'general';

    -- The fields every company used to have, written into the column bag the
    -- new table renders from. The first contact is the one that was always
    -- shown, so it is the one that becomes the row's contact columns.
    UPDATE companies c
       SET data = jsonb_strip_nulls(jsonb_build_object(
             'company',  NULLIF(c.name, ''),
             'contact',  NULLIF(k.name, ''),
             'email',    NULLIF(k.email, ''),
             'phone',    NULLIF(k.phone, ''),
             'website',  NULLIF(c.website, ''),
             'linkedin', NULLIF(c.linkedin, ''),
             'notes',    NULLIF(c.notes, '')))
      FROM (SELECT DISTINCT ON (company_id) company_id, name, email, phone
              FROM contacts ORDER BY company_id, position, id) k
     WHERE k.company_id = c.id;

    UPDATE companies c
       SET data = jsonb_strip_nulls(jsonb_build_object(
             'company',  NULLIF(c.name, ''),
             'website',  NULLIF(c.website, ''),
             'linkedin', NULLIF(c.linkedin, ''),
             'notes',    NULLIF(c.notes, '')))
     WHERE c.data = '{}'::jsonb;

    ALTER TABLE companies ALTER COLUMN vertical_id SET NOT NULL;
    ALTER TABLE companies ADD CONSTRAINT companies_vertical_fk
      FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE;

    -- The tag it replaces. Dropped rather than left behind for the reason the
    -- `ink` column was dropped above: two places to read a value is one place
    -- too many, and the stale one always wins eventually.
    ALTER TABLE companies DROP COLUMN vertical;
  END IF;
END $$;

-- Stages move down with them. The old primary key was (org_id, id), which
-- would stop two verticals in one organization each having an 'outreach'.
-- Every vertical inherits the funnel its organization was running, so an
-- upgraded install opens on exactly the pipeline it had.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name = 'stages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'stages' AND column_name = 'vertical_id') THEN

    ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_pkey;
    ALTER TABLE stages ADD COLUMN vertical_id INTEGER;

    -- Reads the pre-statement snapshot, so the rows it inserts are not
    -- themselves re-read: one copy per vertical, not a runaway.
    INSERT INTO stages (org_id, vertical_id, id, label, sub, accent, wait, position)
      SELECT s.org_id, vt.id, s.id, s.label, s.sub, s.accent, s.wait, s.position
        FROM stages s
        JOIN verticals vt ON vt.org_id = s.org_id
       WHERE s.vertical_id IS NULL;

    -- What is left belongs to an organization rather than a vertical, and
    -- nothing reads it any more. An org with no verticals keeps no stages —
    -- creating a vertical is what creates a funnel now.
    DELETE FROM stages WHERE vertical_id IS NULL;

    ALTER TABLE stages ALTER COLUMN vertical_id SET NOT NULL;
    ALTER TABLE stages ADD CONSTRAINT stages_vertical_fk
      FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE;
    ALTER TABLE stages ADD PRIMARY KEY (vertical_id, id);
  END IF;
END $$;

-- Personal LinkedIn profiles (/in/) that earlier imports copied into the
-- company-page field. A person's profile is a data column, not the company
-- chip; clearing these lets the chip mean what it says. Idempotent: cleared
-- rows don't match again.
UPDATE companies SET linkedin = ''
 WHERE linkedin LIKE '%linkedin.com/in/%';

-- Duplicate leads from the era when re-importing a sheet could mint twins.
-- Imports upsert now, so the same company can't arrive twice again; this
-- clears the ones that already did. Per vertical, same name (case/space
-- insensitive): the OLDEST row stays, newer copies go — but only copies that
-- have no email thread and no history beyond their import stamp, so nothing
-- a person actually worked on is ever collapsed away. Idempotent.
DELETE FROM companies c
 USING companies k
 WHERE c.vertical_id = k.vertical_id
   AND lower(btrim(c.name)) = lower(btrim(k.name))
   AND c.id > k.id
   AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.company_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM history h
                    WHERE h.company_id = c.id
                      AND h.t NOT IN ('Imported from spreadsheet', 'Entered outreach'));

-- ===========================================================================
-- CREATE — the pipeline
-- ===========================================================================

-- Funnel stages. User-editable, ordered by `position`, and scoped to one org:
-- each tenant arranges its own pipeline, so the primary key is the pair.
-- Terminal states (responded / meeting / closed) deliberately do NOT live here:
-- they're what the funnel empties into, so companies.stage is plain text and
-- carries no foreign key.
CREATE TABLE IF NOT EXISTS stages (
  -- Scoped to a vertical, not an organization: MVA and pest control are two
  -- different sales motions and there is no reason they should march through
  -- the same steps. org_id rides along so a tenancy filter never needs a join.
  vertical_id INTEGER NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,
  org_id    TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id        TEXT    NOT NULL,
  label     TEXT    NOT NULL,
  sub       TEXT    NOT NULL DEFAULT '',
  accent    TEXT    NOT NULL DEFAULT '#7E9895',
  wait      INTEGER NOT NULL DEFAULT 7 CHECK (wait BETWEEN 1 AND 365),
  position  INTEGER NOT NULL,
  PRIMARY KEY (vertical_id, id)
);

CREATE TABLE IF NOT EXISTS companies (
  id           SERIAL PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Which vertical's board this row sits on. A company belongs to exactly one:
  -- it came in on that vertical's sheet, is written in that vertical's columns
  -- and is pitched with that vertical's script.
  vertical_id  INTEGER NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,
  -- The row's display name, mirrored from whichever column the vertical marked
  -- role:"name". Stored rather than read out of `data` every time because
  -- everything sorts, searches and dedupes on it, and a JSONB expression index
  -- is a worse answer to that than a column.
  name         TEXT NOT NULL,
  -- The vertical's own columns, keyed by column key. This is where an imported
  -- sheet actually lands: the CRM has no opinion about what a row contains
  -- beyond the handful of roles it needs to email one.
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  website      TEXT NOT NULL DEFAULT '',
  linkedin     TEXT NOT NULL DEFAULT '',
  stage        TEXT NOT NULL,
  stage_since  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT NOT NULL DEFAULT '',
  responded_on DATE,
  meeting_on   DATE,
  closed_on    DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe on import is advisory, not enforced: the import UI lets you knowingly
-- bring in a duplicate. These indexes just make the lookup cheap. They lead
-- with org_id because every query does — a company is only ever looked up
-- within the tenant that owns it.
-- Added after companies shipped, so it needs its own ALTER on any database
-- created before it. Its own column rather than being squeezed into `website`:
-- a company usually has both, and a LinkedIn URL in the website field is what
-- was overflowing the detail panel.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS companies_org_idx     ON companies (org_id);
CREATE INDEX IF NOT EXISTS companies_stage_idx   ON companies (org_id, stage);

-- Every board query leads with vertical_id now, and so does dedupe on import:
-- the same buyer legitimately appears on two verticals' sheets, and flagging
-- that as a duplicate would be wrong. These lead with it for the same reason
-- the org-scoped ones above lead with org_id.
CREATE INDEX IF NOT EXISTS companies_vertical_idx      ON companies (vertical_id);
CREATE INDEX IF NOT EXISTS companies_vname_idx         ON companies (vertical_id, lower(name));
CREATE INDEX IF NOT EXISTS companies_vwebsite_idx      ON companies (vertical_id, lower(website)) WHERE website <> '';
CREATE INDEX IF NOT EXISTS companies_vstage_idx        ON companies (vertical_id, stage);

CREATE TABLE IF NOT EXISTS contacts (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company_id);
-- inbound mail is filed by matching the sender against this
CREATE INDEX IF NOT EXISTS contacts_email_idx   ON contacts (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS emails (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- RFC Message-ID of an inbound message, and the de-duplication key. Assigned
  -- by the sender's server and stable forever, unlike an IMAP UID, which is
  -- only unique within one mailbox and resets if the folder is recreated.
  -- NULL for outbound rows, which we authored and never need to match.
  message_id TEXT UNIQUE,
  thread_id  TEXT,
  direction  TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  at         DATE NOT NULL DEFAULT CURRENT_DATE,
  addr       TEXT NOT NULL DEFAULT '',  -- recipient when out, sender when in
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emails_company_idx ON emails (company_id, at, id);
CREATE INDEX IF NOT EXISTS emails_thread_idx  ON emails (thread_id) WHERE thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS history (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  d          DATE NOT NULL DEFAULT CURRENT_DATE,
  t          TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS history_company_idx ON history (company_id, id);

-- Single row recording how the mailbox poller is getting on. The credentials
-- themselves live in server/.env and are never written to the database.
--
-- Deliberately NOT per-organization: there is one mailbox, and a reply is filed
-- against whichever tenant owns the contact it came from. See inbound.js.
CREATE TABLE IF NOT EXISTS mail_state (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sync  TIMESTAMPTZ,
  last_error TEXT,
  last_filed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO mail_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
