import { useState } from "react";
import { AlertTriangle, LogIn } from "lucide-react";
import { S, CSS } from "../theme.js";

/* ----------------------------------------------------------------------
   The gate, as a page

   Shown when the API answers 401 and the browser's own basic-auth prompt
   can't help — which is exactly the cross-origin case: a frontend on one
   host (Vercel) talking to the API on another (Render). Collects the same
   APP_USER / APP_PASSWORD pair, keeps it for the session, and every request
   carries it from then on.
---------------------------------------------------------------------- */
export function GateLogin({ theme, error, onSubmit }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    if (!user || !pass || busy) return;
    setBusy(true);
    try { await onSubmit(user, pass); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ ...S.lpApp, display: "grid", placeItems: "center" }} data-theme={theme}>
      <style>{CSS}</style>
      <form onSubmit={go} style={{ width: "min(360px, 92vw)", background: "var(--surface)",
        border: "1px solid var(--line)", borderRadius: 16, padding: "28px 26px",
        boxShadow: "var(--shadow-1)" }}>
        <div style={S.lpLogo}>
          <div style={S.lpLogoMark} aria-hidden="true">◆</div>
          <div style={S.lpLogoName}>Outreach CRM</div>
        </div>
        <p style={{ ...S.sub, margin: "14px 0 18px" }}>
          Sign in to continue — the same credentials the deployment was set up with.
        </p>

        {error && (
          <div style={{ ...S.errBox, marginBottom: 14 }}>
            <AlertTriangle size={15} /><span>{error}</span>
          </div>
        )}

        <label style={S.fieldLabel}>User</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={user} autoFocus
          autoComplete="username"
          onChange={e => setUser(e.target.value)} />
        <label style={S.fieldLabel}>Password</label>
        <input style={{ ...S.input, marginBottom: 18 }} value={pass} type="password"
          autoComplete="current-password"
          onChange={e => setPass(e.target.value)} />

        <button className="btn-fill" type="submit"
          style={{ ...S.btnFill, width: "100%", justifyContent: "center" }}
          disabled={!user || !pass || busy}>
          <LogIn size={15} /> {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
