import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* ----------------------------------------------------------------------
   Sealing the sending credential

   A vertical outreaches from a Gmail account, and Gmail wants a 16-character
   app password for SMTP. That is a real credential for a real mailbox, so it
   is encrypted at rest rather than sat in a column in plaintext: a database
   dump, a backup, or a stray SELECT then yields nothing usable.

   AES-256-GCM, which authenticates as well as encrypts — a tampered
   ciphertext fails to open rather than decrypting to rubbish that then gets
   handed to a mail server.

   This is encryption at rest, and only that. Anyone who can run code on this
   machine can read the key and open the value, exactly as they could read
   whatever an app password would otherwise be sitting in — it removes the
   credential from the database's blast radius, not from the host's.

   THE KEY comes from CREDENTIAL_KEY in server/.env if set. If it isn't, one is
   generated into server/.credential-key on first use, 0600, and reused after.
   Generating rather than refusing to start is deliberate: the alternative is
   an install that boots with an error nobody expected, and the generated file
   is exactly as good a secret as one someone would have pasted.

   Losing the key loses the passwords, which is the intended failure: each
   vertical's sending account is then simply re-entered. Nothing else in the
   database is encrypted, so nothing else is at risk.
---------------------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = join(here, "..", ".credential-key");

let cached = null;
/* Reported at boot so an operator can see which of the two it landed on
   without having to go looking for the file. */
export let keySource = "";

function loadKey() {
  if (cached) return cached;

  const fromEnv = String(process.env.CREDENTIAL_KEY || "").trim();
  if (fromEnv) {
    /* Accepts hex or base64, and insists on 32 bytes either way rather than
       hashing whatever it is given up to length — a key that quietly accepts a
       four-character passphrase is worse than no key, because it looks fine. */
    const buf = /^[0-9a-f]{64}$/i.test(fromEnv)
      ? Buffer.from(fromEnv, "hex")
      : Buffer.from(fromEnv, "base64");
    if (buf.length !== 32)
      throw new Error("CREDENTIAL_KEY must be 32 bytes, as 64 hex characters or base64. Generate one with: openssl rand -hex 32");
    cached = buf;
    keySource = "CREDENTIAL_KEY in .env";
    return cached;
  }

  if (existsSync(KEY_FILE)) {
    const buf = Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "hex");
    if (buf.length === 32) {
      cached = buf;
      keySource = "server/.credential-key";
      return cached;
    }
  }

  const buf = randomBytes(32);
  writeFileSync(KEY_FILE, buf.toString("hex"), { mode: 0o600 });
  try { chmodSync(KEY_FILE, 0o600); } catch { /* filesystem without modes */ }
  cached = buf;
  keySource = "server/.credential-key (generated)";
  return cached;
}

/* Versioned so the day this needs a different cipher, an old value can still
   be recognised and re-sealed rather than silently failing to open. */
const V = "v1";

export function seal(plaintext) {
  const s = String(plaintext ?? "");
  if (!s) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", loadKey(), iv);
  const ct = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return [V, iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

/* Returns "" for anything that will not open — a value sealed under a key that
   has since been lost, or one that has been altered. The caller treats that as
   "no sending account configured", which is the truthful reading of it. */
export function open(sealed) {
  const s = String(sealed ?? "");
  if (!s) return "";
  const [v, iv, tag, ct] = s.split(":");
  if (v !== V || !iv || !tag || !ct) return "";
  try {
    const d = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/* Gmail shows app passwords as four groups of four. People paste them with the
   spaces in, and Google itself accepts them either way, so strip rather than
   reject — a validation error over whitespace is the kind of thing that makes
   someone give up on a settings form. */
export const tidyAppPassword = (s) => String(s ?? "").replace(/\s+/g, "");
