import { AlertTriangle, RefreshCw } from "lucide-react";
import { S, CSS } from "../theme.js";

/* Shown while /api/bootstrap is in flight, and instead of the app if it fails.
   An empty pipeline and an unreachable database look identical in a table, so
   they get different screens. */
export function Boot({ theme, error }) {
  return (
    <div className="boot" style={S.boot} data-theme={theme}>
      <style>{CSS}</style>
      {error ? (
        <>
          <AlertTriangle size={30} style={{ color: "var(--danger)" }} />
          <div style={S.bootTitle}>Can't load the pipeline</div>
          <div style={S.bootMsg}>{error}</div>
          <div style={S.bootHint}>
            Check the API is running (<code>npm run dev</code> in <code>server/</code>)
            and that Postgres is up. If this is a fresh database, run{" "}
            <code>npm run migrate</code> first.
          </div>
          <button className="btn-fill" style={{ ...S.btnFill, marginTop: 18 }}
            onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Try again
          </button>
        </>
      ) : (
        <>
          <RefreshCw size={26} className="spin" style={{ color: "var(--accent)" }} />
          <div style={S.bootMsg}>Loading your pipeline…</div>
        </>
      )}
    </div>
  );
}

