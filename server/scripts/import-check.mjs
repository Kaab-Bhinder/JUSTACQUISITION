/* Loads every server module in isolation.
   ESLint's no-undef won't catch a bad relative path or a name that isn't
   actually exported — the module graph has to be executed for that. Importing
   db.js constructs the pg Pool but does not connect, so this needs no database. */
import "dotenv/config";

const MODULES = [
  "../src/constants.js",
  "../src/db.js",
  "../src/auth.js",
  "../src/mail/parse.js",
  "../src/mail/imap.js",
  "../src/inbound.js",
  "../src/sync.js",
  "../src/routes/orgs.js",
  "../src/routes/companies.js",
  "../src/routes/stages.js",
  "../src/routes/emails.js",
  "../src/routes/mail.js",
];

let failed = 0;
for (const m of MODULES) {
  try {
    const ns = await import(m);
    console.log(`ok    ${m.padEnd(30)} exports: ${Object.keys(ns).join(", ") || "(none)"}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${m}\n      ${e.message}`);
  }
}

console.log(failed ? `\n${failed} module(s) failed to load.` : "\nAll modules loaded.");
process.exit(failed ? 1 : 0);
