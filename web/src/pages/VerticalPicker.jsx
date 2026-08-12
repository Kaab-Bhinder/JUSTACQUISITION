import { useRef, useState } from "react";
import {
  Plus, ArrowRight, ArrowLeft, Sun, Moon, Layers, Mail, X, AlertTriangle,
  Settings2, Trash2,
} from "lucide-react";
import { S, CSS, orgVars } from "../theme.js";
import { OrgMark } from "../components/OrgMark.jsx";
import { brandTokens, rgba } from "../domain/colour.js";
import { ConfirmDelete } from "../components/ConfirmDelete.jsx";

/* ----------------------------------------------------------------------
   Vertical picker — inside one organization

   The screen between the landing page and the CRM: which line of business is
   being worked today. Each vertical is its own pipeline — its own columns,
   its own script, its own funnel, its own sending account — so opening one
   opens exactly one board.

   The first visit shows no cards and one action: add a vertical. Creating one
   asks only for a name here; everything else — the sheet format, the script,
   the mailbox — is collected by the setup wizard inside, where each answer
   sits next to the thing it configures.
---------------------------------------------------------------------- */

const ACCENTS = ["#0ABAB5", "#5B6BF0", "#9B5DE5", "#E85D75", "#E8871E", "#2E9E5B", "#0E86D4"];

function VerticalCard({ v, index, onOpen, onAskDelete }) {
  const ref = useRef(null);
  const t = brandTokens(v.accent);
  const track = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div style={{ position: "relative" }}>
    <button ref={ref} className="lp-card lp-rise" onPointerMove={track}
      onClick={() => onOpen(v.id)}
      style={{
        ...S.lpCard,
        "--d": `${index * 70}ms`,
        "--spot": rgba(t.fill, 0.16),
        backgroundImage: `linear-gradient(160deg, ${rgba(t.fill, 0.055)}, transparent 55%)`,
      }}>
      <span className="lp-bar" style={{ ...S.lpCardBar, background: t.fill }} aria-hidden="true" />

      <div style={S.lpCardHead}>
        <div style={{ ...S.lpAddIcon, width: 44, height: 44, borderRadius: 12,
          color: t.text, background: rgba(t.fill, 0.14) }} aria-hidden="true">
          <Layers size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={S.lpCardName}>{v.name}</div>
          <div style={S.lpCardFull}>
            {v.setupDone
              ? (v.smtpUser || "no sending account yet")
              : "opens on its Excel format"}
          </div>
        </div>
      </div>

      <div style={S.lpStats}>
        <div className="lp-stat" style={S.lpStat}>
          <div style={S.lpStatN}>{v.open ?? 0}</div>
          <div style={S.lpStatL}>In funnel</div>
        </div>
        <div className="lp-stat" style={S.lpStat}>
          <div style={S.lpStatN}>{v.companies ?? 0}</div>
          <div style={S.lpStatL}>Companies</div>
        </div>
        <div className="lp-stat" style={S.lpStat}>
          <div style={S.lpStatN}>{v.won ?? 0}</div>
          <div style={S.lpStatL}>Won</div>
        </div>
      </div>

      <div className="lp-enter" style={{ ...S.lpEnter, color: t.text }}>
        Open board <ArrowRight size={14} />
        {v.unread > 0 && (
          <span className="lp-unread" style={{ ...S.lpUnread, background: t.fill, color: t.ink }}>
            <Mail size={11} /> {v.unread} new
          </span>
        )}
      </div>
    </button>
    {/* Outside the card button — a delete must never be a slip of the same
        click that opens the board. */}
    <button type="button"
      style={{ position: "absolute", top: 10, right: 10, zIndex: 2,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
        color: "var(--danger)", background: "var(--surface-3)" }}
      title={`Delete the ${v.name} vertical…`}
      aria-label={`Delete the ${v.name} vertical`}
      onClick={(e) => { e.stopPropagation(); onAskDelete(v); }}>
      <Trash2 size={13} />
    </button>
    </div>
  );
}

/* Name and a colour; nothing else. The wizard inside the vertical collects
   the rest where each answer can be explained next to what it drives. */
function AddDialog({ taken, busy, onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [accent, setAccent] = useState(ACCENTS[taken.length % ACCENTS.length]);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || busy) return;
    try {
      setErr("");
      await onCreate({ name: name.trim(), accent });
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onCancel} />
      <div className="modal" style={{ ...S.modal, maxWidth: 480 }} role="dialog" aria-modal="true"
        aria-label="Add a vertical">
        <div style={S.modalHead}>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Close"><X size={18} /></button>
          <div style={S.modalStep}>New vertical</div>
          <h2 style={S.modalTitle}>What do you call this line of business?</h2>
          <p style={S.modalSub}>
            MVA, Pest Control, SSDI — whatever your sheets are organised by. Next
            you&apos;ll enter its Excel format, and the board opens. Script and
            sending account live in its settings.
          </p>
        </div>
        <div style={S.modalBody}>
          {err && <div style={S.errBox}><AlertTriangle size={15} /><span>{err}</span></div>}
          <div style={{ marginBottom: 16 }}>
            <label style={S.fieldLabel}>Name</label>
            <input style={S.input} value={name} autoFocus placeholder="e.g. MVA"
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          </div>
          <div>
            <label style={S.fieldLabel}>Colour</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ACCENTS.map(a => (
                <button key={a} type="button" aria-pressed={accent === a}
                  aria-label={`Colour ${a}`}
                  onClick={() => setAccent(a)}
                  style={{
                    width: 30, height: 30, borderRadius: "50%", cursor: "pointer",
                    background: a, border: "none",
                    outline: accent === a ? "3px solid var(--accent-soft)" : "2px solid transparent",
                    boxShadow: accent === a ? `0 0 0 1.5px ${a}` : "none",
                  }} />
              ))}
            </div>
          </div>
        </div>
        <div style={S.modalFoot}>
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" style={S.btnGhost} onClick={onCancel}>Cancel</button>
          <button className="btn-fill" style={S.btnFill} disabled={!name.trim() || busy}
            onClick={submit}>
            <Plus size={15} /> Create vertical
          </button>
        </div>
      </div>
    </>
  );
}

export function VerticalPicker({
  org, verticals, theme, onToggleTheme, onOpen, onCreate, onLeave, onDelete,
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);   // the vertical a card asked about

  const create = async (payload) => {
    setBusy(true);
    try {
      await onCreate(payload);        // throws with the server's message
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  const none = verticals.length === 0;

  return (
    <div style={{ ...S.lpApp, ...orgVars(org, theme) }} data-theme={theme}>
      <style>{CSS}</style>

      <header style={S.lpNav}>
        <div style={S.lpLogo}>
          <OrgMark org={org} size={34} logoHeight={16} />
          <div style={S.lpLogoName}>{org.name}</div>
        </div>
        <div style={S.lpNavRight}>
          <button className="lp-icon-btn" style={S.lpIconBtn} onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main style={S.lpMain}>
        <div style={S.lpHero}>
          <button className="link-btn" style={{ ...S.linkBtn, marginBottom: 18 }} onClick={onLeave}>
            <ArrowLeft size={14} /> All organizations
          </button>
          <h1 style={{ ...S.lpTitle, fontSize: "clamp(30px, 4.4vw, 44px)" }}>
            {none ? `Set up ${org.name}'s first vertical` : "Which vertical today?"}
          </h1>
          <p style={{ ...S.lpLead, marginTop: 10 }}>
            {none
              ? "A vertical is one line of business — MVA, pest control, SSDI. Each keeps its own spreadsheet format, outreach script, funnel and sending account."
              : "Each vertical is its own pipeline: its own sheet format, script, funnel and sending mailbox. Nothing crosses between them."}
          </p>
        </div>

        <div style={S.lpSectionHead}>
          <span style={S.lpSectionTitle}>
            Verticals{verticals.length > 0 && ` · ${verticals.length}`}
          </span>
        </div>

        <div style={S.lpGrid}>
          {verticals.map((v, i) => (
            <VerticalCard key={v.id} v={v} index={i} onOpen={onOpen}
              onAskDelete={setToDelete} />
          ))}

          <button className="lp-add lp-rise" style={{ ...S.lpAdd, "--d": `${verticals.length * 70}ms` }}
            onClick={() => setAdding(true)}>
            <div className="lp-add-icon" style={S.lpAddIcon}><Plus size={22} /></div>
            <div style={S.lpAddTitle}>{none ? "Add your first vertical" : "Add a vertical"}</div>
            <div style={S.lpAddSub}>
              Name it and enter its Excel format — that&apos;s all it takes.
              <span style={{ display: "block", marginTop: 6, color: "var(--faint)" }}>
                <Settings2 size={11} style={{ verticalAlign: -1.5, marginRight: 4 }} />
                Script and Gmail account live in its settings.
              </span>
            </div>
          </button>
        </div>
      </main>

      <footer style={S.lpFoot}>
        Companies, scripts and sending accounts live inside a vertical — deleting
        one from its settings removes everything on its board.
      </footer>

      {adding && (
        <AddDialog taken={verticals} busy={busy}
          onCreate={create} onCancel={() => setAdding(false)} />
      )}

      {toDelete && (
        <ConfirmDelete
          title={`Delete the ${toDelete.name} vertical?`}
          message={`Everything on its board goes with it — all ${toDelete.companies ?? 0} leads, every email thread, the pipeline, the script and the sending account.`}
          requireText={toDelete.name}
          confirmLabel="Delete"
          seconds={5}
          onConfirm={async () => { await onDelete(toDelete); setToDelete(null); }}
          onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}
