import { useEffect, useState } from "react";
import { AlertTriangle, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import { S } from "../theme.js";
import { ago } from "../domain/email.js";

/* ----------------------------------------------------------------------
   Reply-sync status, shown above the Emails list.

   Three states, and they're kept distinct on purpose because each needs a
   different response from whoever's looking at it:

     not configured  — nobody has set up a mailbox yet. Say what to do.
     configured, erroring — it worked before, or was set up wrong. Show why.
     working — get out of the way; just say when it last looked.

   There's no Connect button. The credential lives in server/.env and never
   reaches the browser, so connecting isn't something this screen can do.
---------------------------------------------------------------------- */
export function MailBar({ state, onSync, onTest }) {
  const [, tick] = useState(0);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 20000);   // keeps "3 min ago" honest
    return () => clearInterval(t);
  }, []);

  const runTest = async () => {
    setTesting(true);
    setResult(await onTest());
    setTesting(false);
  };

  if (!state.configured) {
    return (
      <div style={S.mailBar}>
        <span style={{ ...S.mailDot, background: "var(--warn)" }} />
        <div style={S.mailText}>
          <div style={S.mailTitle}>Reply detection is off</div>
          <div style={S.mailSub}>
            Add <code style={S.code}>IMAP_USER</code> and{" "}
            <code style={S.code}>IMAP_PASSWORD</code> to <code style={S.code}>server/.env</code>{" "}
            (a Gmail app password from{" "}
            <a href="https://myaccount.google.com/apppasswords" target="_blank"
              rel="noreferrer noopener" style={S.inlineLink}>myaccount.google.com/apppasswords</a>),
            then restart the API. Until then, use “Log a reply” to record replies by hand.
          </div>
        </div>
      </div>
    );
  }

  const broken = !!state.error;

  return (
    <div style={S.mailBar}>
      <span style={{ ...S.mailDot, background: broken ? "var(--danger)" : "var(--good)" }} />
      <div style={S.mailText}>
        <div style={S.mailTitle}>
          {broken
            ? <><AlertTriangle size={13} style={S.titleIcon} />Reply syncing has a problem</>
            : <><ShieldCheck size={13} style={S.titleIcon} />Watching {state.user}</>}
          <span style={S.readOnlyTag}>read-only</span>
        </div>
        <div style={{ ...S.mailSub, ...(broken ? { color: "var(--danger)" } : {}) }}>
          {broken
            ? state.error
            : `Checked every ${state.pollSeconds}s · last looked ${ago(state.lastSync)}`}
        </div>
        {/* Test result sits under the status line rather than in a toast: you
            press Test precisely because you want to read the answer. */}
        {result && (
          <div style={{ ...S.mailSub, color: result.ok ? "var(--good)" : "var(--danger)", marginTop: 5 }}>
            {result.ok
              ? `Connected to ${result.mailbox}${result.messages != null ? ` — ${result.messages} messages in it` : ""}`
              : result.error}
          </div>
        )}
      </div>
      <button className="btn-ghost" style={S.btnGhost} disabled={testing} onClick={runTest}>
        <PlugZap size={14} /> {testing ? "Testing…" : "Test"}
      </button>
      <button className="btn-ghost" style={S.btnGhost} disabled={state.busy} onClick={onSync}>
        <RefreshCw size={14} className={state.busy ? "spin" : ""} />
        {state.busy ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
