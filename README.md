# Buyer Outreach CRM

Tracks buyer companies (injury law, insurance, home services) through an
outreach funnel, then response → meeting → closed.

**Multi-organization.** One installation serves any number of businesses —
BSBW and CCM ship with it, and more can be added from the landing page. Each
gets its own buyers, its own funnel stages, its own branding and its own email
signature. Nothing crosses between them.

Grown out of the single-file `bsbw_crm.jsx` prototype: the pipeline now lives in
Postgres, and the parts a browser can't safely do have moved to a small API.

```
bsbw-crm/
├── server/          Express + Postgres API
│   └── src/
│       ├── schema.sql    tables, and the migration from the single-tenant shape
│       ├── db.js         pool + JSON assembly of the nested company shape
│       ├── auth.js       the administrator gate, and which org a request means
│       ├── constants.js  verticals, default stages, brand palettes, merge tags
│       ├── inbound.js    one filing path for every source of inbound mail
│       ├── sync.js       background reply poller
│       ├── mail/         read-only IMAP · RFC822 parsing and quote stripping
│       └── routes/       orgs · companies · stages · emails · mail
└── web/             React frontend (Vite)
    ├── public/brand/ tenant logos, served as /brand/*
    └── src/
        ├── Root.jsx     which screen: pick an organization, or the CRM
        ├── App.jsx      the CRM shell: state, handlers, layout
        ├── api.js       fetch wrapper — the only place that calls the server
        ├── theme.js     the style object, both themes, and the tenant palettes
        ├── pages/       Landing
        ├── domain/      the rules: verticals, stages, dates, templates, import
        └── components/  the interface, one file per piece
```

## Setup

Needs **Node 20+** and **Postgres 14+**.

```powershell
# 1. create the database
psql -U postgres -c "CREATE DATABASE bsbw_crm;"

# 2. configure
copy server\.env.example server\.env
#    then edit DATABASE_URL if your Postgres user/password differ

# 3. install
npm run install:all

# 4. create the tables, the two organizations, and their default stages
npm run migrate

# 5. optional — demo companies to look at
npm run seed
```

Then run the two halves in separate terminals:

```powershell
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:5173
```

Vite proxies `/api` to port 4000, so the browser only ever talks to one origin.

On Windows, `setup-db.ps1` does steps 1, 4 and 5 in one go:

```powershell
powershell -ExecutionPolicy Bypass -File setup-db.ps1
```

There is nothing to sign in to — open http://localhost:5173 and pick an
organization. Step 5 is genuinely optional; without it BSBW and CCM exist with
empty pipelines.

**Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`** before this runs
anywhere other people can reach. They gate creating and deleting an
organization, and default to `admin@bsbw.co` / `changeme-please` — the server
says so at boot while they are still the shipped values.

### Upgrading an existing single-tenant database

`npm run migrate` handles it and is safe to re-run. It creates BSBW, assigns
every existing company, stage, email and history row to it, and rebuilds the
indexes and the `stages` primary key around the new `org_id`. Nothing is
deleted and nothing is left belonging to nobody.

Then `npm run seed` adds the account and gives CCM its own demo companies; an
organization that already has companies is left alone, so your real data is
never doubled up.

## Organizations and access

**There is no sign-in.** Open the app and the landing page lists the
organizations on the installation — BSBW and CCM. Picking one opens the CRM for
it: its companies, its stages, its colours, its signature. **All organizations**
in the sidebar takes you back.

Anyone who can reach the app can open either pipeline and work it. That is the
footing the CRM had before it became multi-tenant, just with two pipelines
instead of one. Keep it behind a VPN, or on localhost, before it holds anything
you would mind a visitor reading.

One action is held back, because it changes what the whole installation contains
rather than what is inside one tenant:

- **Creating an organization** asks for an administrator email and password, set
  as `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`.
- **Deleting one** asks for the same, and for the organization's name typed
  back. Everything it owns cascades with it, and the last organization cannot be
  deleted.

The credentials travel with the one request that needs them and are checked
there. Nothing is remembered afterwards — no session, no cookie, nothing to
steal. The server prints a warning at boot while it is still on the shipped
defaults.

Everything else — companies, stages, emails, branding, verticals — is open,
because everything else is inside a tenant that anyone can already open.

Which organization you're in travels as an `X-Org-Id` header. It no longer
proves anything about who is asking; what it still does is decide which tenant's
rows a request touches, and **every statement in the data layer filters on it**.
That filter is now the only thing keeping two pipelines apart, which is why the
smoke suite tests it by naming a real id from the other organization and
checking each route refuses.

### Verticals

Each organization picks the verticals it sells into when it is created — at
least one, at most all of them. Only those appear in its filter, its **Add
company** form and its spreadsheet import, so a tenant that doesn't do pest
control never sees pest control. The full list lives in
`web/src/domain/verticals.js`; an organization created before the choice
existed has all of them.

### Brand colour

Any colour, picked from a spectrum rather than a fixed palette. Everything else
is derived from that one value in `web/src/domain/colour.js`:

| | |
|---|---|
| `ink` | what reads on a fill of the colour |
| `text` | the colour darkened until it reads as body text on white |
| `textDark` | lightened until it reads on the dark theme's surface |
| `soft` / `softDark` | the chip and soft-button fills |

Each is **walked in small steps until it actually clears 4.5:1** against the
surface it lands on, rather than nudged by a fixed amount — a fixed amount that
works for teal fails for yellow. A sweep of 1440 colours across the whole hue
wheel at four saturations and five lightnesses produces no failures, and the
worst ratio in that sweep is exactly the 4.5:1 target. The picker shows the
resolved values and their ratios as you drag, so a poor choice is visible
before it is saved rather than after.

Nothing derived is stored. The `ink` column was dropped when colours became
free: a second copy of a value the client recomputes anyway is how the two
drift apart.

### Logos

An organization shows its own mark where it has one and its initials on a tile
of its brand colour where it doesn't. Upload one under **Organization settings
→ Logo** — PNG, JPEG, WebP, GIF or SVG. Anything oversized is scaled to 512px
on the long edge in the browser before it is sent, so a 4000px export just
works rather than being refused.

Uploads are stored as `data:` URIs on the organization row. Shipped assets can
also be referenced by path: CCM uses `/brand/ccm.svg`, converted from the
supplied PDF — those are the original Illustrator paths and the original axial
shadings, not a redraw. Only the letterforms were kept; the PDF's black plate
and the purple radial glow behind it are presentation, so the mark composites
onto whatever ground it is given.

A wordmark is wide, so the tile grows to fit rather than shrinking the artwork
into a square, and it sits on a near-black ground in both themes: a brand
gradient on a background that moves with the theme is how you get an invisible
logo. A logo that fails to load falls back to the initials rather than leaving
a hole.

**What the API accepts**, because this string ends up in an `<img src>` on
every member's landing page: same-origin paths, `https:`, and `data:` image
URIs up to 512KB. `http:`, protocol-relative URLs, `javascript:` and `data:`
documents are refused. SVG **is** allowed — an `<img>` renders it in the
browser's secure static mode, with no script and no external fetches, which is
why the mark is drawn with `<img>` everywhere rather than inlined — and it is
sanitised before storage anyway: `<script>`, event handlers and off-origin
references are stripped, so the stored bytes stay harmless even for a future
caller that inlines them.

The administrator credentials are compared with `timingSafeEqual` from node's
own crypto — overkill for a local tool, but it costs four lines and the
alternative is a habit of comparing secrets with `===`.

## Checks

```powershell
npm run lint       # both halves. no-undef is the rule that matters when the
                   # code is split across modules: a missing import looks
                   # exactly like a global until it runs.
npm run build      # production bundle
npm run smoke      # 146 assertions against a running API, on every route
npm run test:mail  # 51 assertions on reply detection, no mailbox needed
```

Both suites create their own rows and delete them afterwards, and both measure
the company count as a difference rather than against a fixed total, so they
pass against a database people have actually been working in.

- **`smoke.mjs`** needs the API up and a migrated database. Exercises every
  endpoint including the stage remap and the error paths. Two sections matter
  most: **tenant isolation**, which names a real company id belonging to the
  other organization and checks every route refuses it — company ids are a
  single sequence across all tenants, and that filter is now the only thing
  keeping the two pipelines apart; and **the administrator gate**, which checks
  that creating an organization is refused without credentials, with the wrong
  password and with the wrong email, that nothing is created by a refused
  attempt, and that the two failures are indistinguishable. It creates a
  throwaway organization and deletes it again.
- **`test-inbound.mjs`** needs only the database. Feeds raw RFC822 messages —
  multipart, HTML-only, quoted-printable, base64 UTF-8 — through the same
  `parseMessage()` and `fileInbound()` the poller uses, so everything except the
  IMAP socket is covered. Its tenancy section checks that "Log a reply" can't
  file into another organization while the shared-mailbox poller still reaches
  every one of them.
- **`npm --prefix server run check`** imports every server module; catches a bad
  path or a missing export, which a bundler will happily build as an undefined
  global.

## How email works

**Outbound: this app does not send mail.** You write the message in the
composer, click **Open in Gmail**, and it opens Gmail's compose window with the
recipient, subject and body already filled in. You read it over and press send
yourself.

Opening that link is what records the touch — the message goes onto the
company's thread, the activity log gets an entry, and the funnel stage advances.

Why it's built this way:

- no SMTP password or send scope has to exist anywhere;
- mail leaves your real mailbox, so it lands in your Sent folder and threads
  properly when they reply;
- nothing reaches a buyer without a human reading it first.

For a single company that's one button. For a selection, the composer gives you
a checklist of Gmail links to work down, ticking each off as it's recorded —
opening forty tabs at once isn't a workflow.

Merge tags (`{{first_name}}`, `{{company}}`, `{{vertical}}`, …) are filled in
per company, both in the Gmail draft and in the copy the server keeps.

### Inbound: replies are detected automatically

The server watches your mailbox over **read-only IMAP** and files each reply
against the company whose contact address matches the sender, moving it to
*Responded* and flagging it unread in the Emails view. It polls every 90s whether
or not the app is open, so replies are already waiting when you load it.

There is one mailbox for the whole installation. The sender's address decides
which organization a reply lands in, so each one only ever sees its own — but
they do share these credentials. Press **Check now** in one organization and it
will report how many replies it filed for the others without showing you any of
them.

Setup is about three minutes, and needs no Google Cloud project:

1. Turn on 2-step verification — [myaccount.google.com/security](https://myaccount.google.com/security)
2. Create an app password — [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Put your address and that 16-character password in `server/.env` as
   `IMAP_USER` / `IMAP_PASSWORD`, then restart the API.
4. Open **Emails** and press **Test** to confirm it can log in.

Use an app password, **not** your account password — Google blocks plain
password logins over IMAP. Works against any IMAP server; override `IMAP_HOST`.

It only ever reads. The mailbox is opened with `EXAMINE`, not `SELECT`, so
looking at a message can't even mark it read in your own inbox — and there is no
send credential anywhere in the system.

What it does with what it finds:

- **Quoted chains are stripped**, so the thread shows what they actually wrote,
  not the whole conversation echoed back. Handles Gmail, Outlook, Apple Mail and
  a few non-English dividers.
- **HTML-only mail is converted to text** — most corporate mail sends this.
- **A reply can't file twice.** `emails.message_id` is UNIQUE, which is what
  makes the poller idempotent across restarts and overlapping ticks.
- **A reply never drags a company backwards.** Already at *Responded* → stays.
  A reply to a **closed** deal is filed on the thread but does **not** reopen it.
- **Mail from an unknown address is ignored**, not guessed at.

Leave `IMAP_USER` blank and everything else still works — **Log a reply** records
replies by hand through the identical filing path.

There's also `POST /api/emails/inbound` for anyone routing mail through a
provider's inbound-parse webhook instead. Set `INBOUND_SECRET` if you use it.

## API

Nothing needs a session — there are none. Everything below `/api/bootstrap` in
the table needs an `X-Org-Id` header naming an organization that exists; the two
marked **admin** additionally read `adminEmail` and `adminPassword` out of the
request body.

| Method | Path | |
|---|---|---|
| GET | `/api/health` | database reachable? |
| GET | `/api/orgs` | every organization, with its counts |
| GET | `/api/orgs/verticals` | the verticals an organization may choose from |
| POST | `/api/orgs` | create one — **admin** |
| PATCH | `/api/orgs/:id` | branding, verticals and signature |
| POST | `/api/orgs/:id/delete` | `{confirm}` the name — **admin**; the last one can't go |
| GET | `/api/bootstrap` | org + companies + stages + capabilities, one round trip |
| GET | `/api/companies` | |
| POST | `/api/companies` | create |
| PATCH | `/api/companies/:id` | edit fields / contacts |
| POST | `/api/companies/import` | bulk insert from the spreadsheet wizard |
| POST | `/api/companies/advance` | `{ids}` → next funnel stage |
| POST | `/api/companies/:id/move` | `{stage}` → drag-and-drop correction |
| POST | `/api/companies/stamp` | `{ids, to}` → responded \| meeting \| closed |
| POST | `/api/companies/:id/read` | clear unread replies |
| POST | `/api/companies/delete` | `{ids}` |
| GET | `/api/stages` | |
| PUT | `/api/stages` | `{stages, remap}` — save the whole pipeline |
| POST | `/api/emails/record` | log a message you sent from Gmail |
| POST | `/api/emails/log` | record an inbound reply by hand |
| POST | `/api/emails/inbound` | provider webhook |
| GET | `/api/mail/status` | is IMAP configured, when did it last look |
| POST | `/api/mail/sync` | check for replies now |
| POST | `/api/mail/test` | log in and report back, for setup |

Every mutation answers with the company rows it touched, in the same nested
shape the UI reads, so a click is one round trip and never a re-fetch of the
whole table.

## Notes on the data model

- **`org_id` is the tenancy boundary, and it is enforced in SQL.** Every read
  helper in `db.js` takes an organization and every statement filters on it —
  including the ones handed a list of ids, because ids are sequential across all
  tenants and so trivially guessable. A route that forgot to pass one would get
  an error from its own call, not another tenant's data.
- **Stages are rows, not code, and they belong to an organization.** `stages` is
  user-editable, ordered by `position`, and keyed on `(org_id, id)` — so two
  tenants can both have an `outreach`, which is what they will both call their
  first stage. Deleting one that still has companies in it requires saying where
  they go; the remap and the delete happen in the same transaction.
- **Branding is a colour *and* its ink, stored together.** Contrast is a
  property of the pair, so the API takes the fill and looks the ink up from the
  palette in `constants.js` rather than trusting the client for it — a dark
  brand colour needs white ink, and `#0ABAB5` needs deep teal, because white on
  it reaches only 2.4:1.
- **`organizations.logo` is a URL, and a narrow one.** It ends up in an
  `<img src>` on every member's landing page, so the API allows same-origin
  paths, `https:` and base64 raster `data:` URIs, and nothing else. The
  alternative is stored XSS against everyone in the tenant.
- **One mailbox serves every tenant.** Credentials live in `server/.env` and a
  reply is filed against whichever organization has the sender on file, so
  `mail_state` is deliberately not per-organization. A sync started by one
  tenant answers only with its own rows even when it filed mail for others.
- **The three terminal states are not stages.** `responded`, `meeting` and
  `closed` are what the funnel empties into, so `companies.stage` is plain text
  with no foreign key. Anything checking "is this still in the funnel" asks
  whether a `stages` row exists with that id.
- **Dates are `DATE`, read back as `'YYYY-MM-DD'` strings.** A type parser in
  `db.js` stops node-pg building `Date` objects, which would shift `stage_since`
  across midnight for anyone west of UTC.
- **`emails.message_id` is UNIQUE.** It holds the RFC Message-ID, which the
  sender's server assigns and never changes — unlike an IMAP UID, which is only
  unique within one mailbox and resets if the folder is recreated. That's what
  makes the poller idempotent across restarts and overlapping ticks.
- **Import dedupe is advisory.** The wizard flags duplicates by name and
  website, but lets you import one knowingly, so there's no unique constraint to
  fight.
- **A sheet is one vertical's worth of companies, chosen up front.** Step 1 of
  the import asks which vertical the file is, every row is imported into it,
  and there is no vertical column to map. That is how these files arrive, and
  it means the columns can then be laid out the way that vertical's sheets
  always lay them out.
- **Each vertical remembers its column layout.** The mapping is saved against
  the organization and vertical when an import succeeds, and the next sheet of
  the same shape opens already filled in. A remembered column that isn't in
  this sheet is ignored rather than left pointing at nothing, and the vertical
  step says which verticals have a layout saved.
- **A company's vertical may still be empty** — one created by hand without
  one, or an older import. Blank renders as a dash, not an empty pill.
- **Contacts repeat.** A sheet routinely carries POC 1 · POC 2 · POC 3 across
  the row, so the contact block can be added up to five times and each becomes
  its own contact on the company. A block whose columns are all empty on a
  given row is dropped rather than stored as a blank person. The guesser reads
  the number in a header — "POC 2 Email" — so it can tell the blocks apart,
  and refuses to give a numbered column to an unnumbered field.
- **Websites and LinkedIn pages are never rendered as URLs.** A LinkedIn company
  address is routinely sixty characters and there is no width in a board card,
  a table cell or a 420px drawer where that fits — it was overflowing the
  drawer. What renders is a **Website** or **LinkedIn** button of fixed width,
  with the full address on the title attribute.
- **A URL inside the company name is lifted out on import.** Sheets routinely
  carry one cell holding both, `Madrivo\n(https://linkedin.com/company/madrivo/)`,
  which imports as a 117-character company name. The wizard splits it and puts
  the URL in the field it belongs to, only where that field is empty. For rows
  that came in before this existed, `npm run tidy:names` shows what it would
  change and `npm run tidy:names -- --write` applies it — lossless and
  idempotent.
- **The import mapping is a board, not a set of dropdowns.** Step 3 puts the
  sheet's columns on the left and the CRM's fields on the right; a column is
  dragged onto the field it belongs in. Dragging is the fast path, not the only
  one — every slot is also a text box with the column names as autocomplete,
  because drag and drop is unusable from a keyboard, awkward on a phone, and
  slower than typing when a sheet has forty columns. Each slot shows the first
  real value in the column it resolved to, so a mapping is confirmed against
  the data rather than the header.

## Not built

- **No accounts, and so no per-person access.** Anyone who can reach the app
  can open either pipeline and change anything inside it. Only creating and
  deleting an organization is held back, and only by a shared password. Keep
  this behind a VPN or on localhost.
- **No rate limiting on the administrator gate.** The credentials are compared
  in constant time, but nothing stops a script trying repeatedly. Put it behind
  a proxy that throttles before exposing it to the internet.
- **The administrator password lives in `server/.env` in plain text.** That is
  what makes it a gate rather than an account system: there is no user table to
  hash it into, and anyone who can read the server's environment already has
  the database.
- **One mailbox for the whole installation.** Per-tenant IMAP credentials would
  need somewhere safe to keep them, which is a bigger change than it looks. Two
  organizations listing the same contact address is resolved by the lower
  company id — arbitrary, but stable.
