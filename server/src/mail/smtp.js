import nodemailer from "nodemailer";
import { open } from "../crypto.js";

/* ----------------------------------------------------------------------
   Sending

   Outreach now leaves the server, from the mailbox each vertical configured
   in its setup wizard: a Gmail address and a 16-character app password. The
   password is sealed at rest (crypto.js) and opened only here, in the moment
   a message is being handed to Gmail.

   Compose links did this job before, and their virtue — a human reads every
   message before it goes — is kept in the composer's preview step rather
   than lost. What they could not do is a 40-row selection: forty tabs is
   not a workflow, and that is precisely the job a per-vertical script with
   merge tags exists for.

   Why SMTP and not the Gmail API: an app password works the moment the user
   pastes it. The API path needs a Google Cloud project, an OAuth consent
   screen and Google's verification of the gmail.send scope before anyone
   outside the project's test list can grant it — external setup this product
   cannot do for its user.

   Sent through smtp.gmail.com the messages land in the account's own Sent
   folder, so threading and reply detection behave exactly as if they had been
   sent by hand.
---------------------------------------------------------------------- */

/* One transporter per mailbox, kept while the credential stays the same, so a
   40-row send reuses one connection pool rather than performing 40 logins.
   Gmail counts logins with far less patience than it counts messages. */
const pools = new Map();

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);

/* The server an account authenticates against is the account's own fact:
   empty means the installation default (Gmail), a domain mailbox names its
   host — smtp.stackmail.com for a Stackmail-hosted address — and the From
   domain then matches the authenticating server, which is what removes the
   "via gmail.com" annotation at the receiving end. */
const hostFor = (v) => v?.smtpHost || HOST;
const portFor = (v) => Number(v?.smtpPort) || PORT;
const isGmail = (v) => /gmail\.com$/i.test(hostFor(v));

/* What the From address actually is. Send-As exists because Gmail keeps a
   registry of verified aliases; no other host offers that contract, so on a
   custom server the account sends as itself, always. One function, used by
   the send path, the test endpoint and (mirrored) the previews — the number
   the user sees is the number that dials. */
export const fromAddressFor = (v) =>
  (isGmail(v) && v?.smtpSendAs) || v?.smtpUser || "";

export function transporterFor(vertical) {
  const user = String(vertical.smtpUser || "").trim();
  const pass = open(vertical.smtpSecret);
  if (!user || !pass) return null;

  const host = hostFor(vertical), port = portFor(vertical);
  const key = `${user}\n${host}:${port}\n${vertical.smtpSecret}`;
  if (pools.has(key)) return pools.get(key);

  /* A changed credential must not keep answering from the old login. */
  for (const [k, t] of pools) {
    if (k.startsWith(`${user}\n`)) { t.close(); pools.delete(k); }
  }

  const t = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 2,
    /* Gmail's own guidance is gentle sending; this also keeps one bad address
       in a bulk send from stalling the rest behind it. */
    maxMessages: 50,
    /* Hosts that BLOCK outbound SMTP (Render's free tier drops 465/587
       silently) would otherwise hang a verify or a send forever — the
       browser's button spins until someone gives up and refreshes. Bounded
       waits turn that into an error with a name within seconds. */
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 30000,
  });
  pools.set(key, t);
  return t;
}

/* True/throws. Used by the settings form's "Test" button, so its failure
   message is the thing the user actually reads — nodemailer's raw EAUTH text
   mentions neither Gmail nor app passwords. */
export async function verify(vertical) {
  const t = transporterFor(vertical);
  if (!t) throw new Error("Enter the email address and its password first.");
  try {
    await t.verify();
    return true;
  } catch (e) {
    throw new Error(friendly(e, vertical));
  }
}

/* One message. Returns nodemailer's info so the caller can keep messageId —
   that is what lets a reply thread back onto the company later.

   `html` may carry <img src="data:…"> from the rich editor (pasted
   signatures). attachDataUrls converts those to proper CID inline
   attachments at send time — mail clients, Gmail first among them, refuse
   data: images but render CID parts fine. The plain-text part rides along:
   multipart mail with a text alternative reads better to spam filters than
   HTML alone. */
export async function send(vertical, { to, subject, text, html, inReplyTo, references }) {
  const t = transporterFor(vertical);
  if (!t) throw new Error("This vertical has no sending account. Add one in its settings.");

  const address = fromAddressFor(vertical);
  const from = vertical.smtpFrom
    ? { name: vertical.smtpFrom, address }
    : address;

  try {
    return await t.sendMail({
      from, to, subject, text,
      ...(html ? { html, attachDataUrls: true } : {}),
      /* A follow-up that references the first touch lands in the SAME
         conversation in the recipient's mailbox — that's these two headers,
         nothing more. */
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
    });
  } catch (e) {
    throw new Error(friendly(e, vertical));
  }
}

/* The errors people actually hit, said in words that name the fix. Everything
   else passes through — an unexpected message is better verbatim than
   paraphrased wrongly. */
function friendly(e, vertical) {
  const s = String(e?.message || e);
  const host = hostFor(vertical), port = portFor(vertical);
  if (e?.code === "EAUTH" || /535|username and password not accepted|authentication failed/i.test(s))
    return isGmail(vertical)
      ? "Gmail refused that sign-in. Check the address, and use an app password (Google Account → Security → 2-Step Verification → App passwords) — not the account password."
      : `${host} refused that sign-in. Check the username and the mailbox password.`;
  if (e?.code === "EDNS" || e?.code === "ECONNECTION" || e?.code === "ETIMEDOUT" ||
      /timed? ?out/i.test(s))
    return `Couldn't reach ${host} on port ${port} from this server. If the CRM is hosted on Render's FREE plan, that's the cause — free instances block outbound email ports (465/587); upgrade the service, or host the API somewhere SMTP is allowed. Otherwise check the host name and the network.`;
  if (/daily.*limit|quota|421|too many/i.test(s))
    return "The mail server is rate-limiting this account. Wait a while before sending more.";
  return s;
}
