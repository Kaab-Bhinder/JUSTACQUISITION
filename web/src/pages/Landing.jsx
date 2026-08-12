import { useState, useEffect, useRef } from "react";
import {
  Plus, ArrowRight, Sun, Moon, Sparkles, Building2, Mail,
} from "lucide-react";
import { S, CSS } from "../theme.js";
import { OrgForm } from "../components/OrgForm.jsx";
import { OrgMark } from "../components/OrgMark.jsx";
import { brandTokens, rgba } from "../domain/colour.js";

/* ----------------------------------------------------------------------
   Landing — pick an organization

   The only screen that stands outside a tenant, so it is also the only one
   drawn in the base palette rather than an organization's own colours. Each
   card carries its tenant's colour instead — its bar, its wash, the light that
   follows the pointer across it — which is what makes the choice feel like a
   choice rather than a dropdown.

   There are no accounts, so this shows every organization on the installation
   and opening one asks nothing. Adding one does: it changes what the whole
   installation contains rather than what is inside a tenant, so the form
   collects an administrator email and password at the point of use.
---------------------------------------------------------------------- */

const STATS = [
  { key: "open", label: "In funnel" },
  { key: "companies", label: "Companies" },
  { key: "won", label: "Won" },
];

const still = () => typeof window !== "undefined" && !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Counts climb to their value on first paint. Small numbers, so the duration
   is short and the easing settles rather than races — a stat that is still
   moving when you go to read it is worse than one that never moved. */
function useCountUp(target, delay = 0) {
  const [n, setN] = useState(() => (still() ? target : 0));

  useEffect(() => {
    if (still()) { setN(target); return; }
    if (!target) { setN(0); return; }
    let raf = 0, start = 0;
    const run = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / 620);
      setN(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(run);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(run); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, delay]);

  return n;
}

function Stat({ value, label, delay }) {
  const n = useCountUp(value, delay);
  return (
    <div className="lp-stat" style={S.lpStat}>
      <div style={S.lpStatN}>{n}</div>
      <div style={S.lpStatL}>{label}</div>
    </div>
  );
}

function OrgCard({ org, index, onOpen }) {
  const ref = useRef(null);
  const t = brandTokens(org.accent);

  /* The spotlight is two CSS variables written straight onto the element.
     Doing it here rather than in React state keeps a pointer move off the
     render path entirely — this fires at screen refresh rate. */
  const track = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <button ref={ref} className="lp-card lp-rise" onPointerMove={track}
      onClick={() => onOpen(org.id)}
      style={{
        ...S.lpCard,
        "--d": `${index * 70}ms`,
        "--spot": rgba(t.fill, 0.16),
        /* A whisper of the brand across the card, so two tenants differ at a
           glance even before the bar is noticed. */
        backgroundImage: `linear-gradient(160deg, ${rgba(t.fill, 0.055)}, transparent 55%)`,
      }}>
      <span className="lp-bar" style={{ ...S.lpCardBar, background: t.fill }} aria-hidden="true" />

      <div style={S.lpCardHead}>
        <OrgMark org={org} />
        <div style={{ minWidth: 0 }}>
          <div style={S.lpCardName}>{org.name}</div>
          {org.fullName && <div style={S.lpCardFull}>{org.fullName}</div>}
        </div>
        {org.role === "owner" && <span style={S.lpRole}>Owner</span>}
      </div>

      <p style={S.lpCardTag}>
        {org.tagline || <span style={{ color: "var(--faint)" }}>No description yet.</span>}
      </p>

      <div style={S.lpStats}>
        {STATS.map((s, i) => (
          <Stat key={s.key} value={org[s.key] ?? 0} label={s.label}
            delay={index * 70 + 180 + i * 70} />
        ))}
      </div>

      <div className="lp-enter" style={{ ...S.lpEnter, color: t.text }}>
        Open CRM <ArrowRight size={14} />
        {/* Unread replies are the one number worth pulling out of the row —
            it's the only one that means "something is waiting for you". */}
        {org.unread > 0 && (
          <span className="lp-unread" style={{ ...S.lpUnread, background: t.fill, color: t.ink }}>
            <Mail size={11} /> {org.unread} new
          </span>
        )}
      </div>
    </button>
  );
}

/* One <span> per word so the headline can arrive in sequence. Spaces are kept
   outside the animated spans, or the line would reflow as each one lands. */
function Words({ text, from = 0 }) {
  return text.split(" ").map((w, i) => (
    <span key={i}>
      <span className="lp-word" style={{ "--d": `${from + i * 55}ms` }}>{w}</span>
      {i < text.split(" ").length - 1 ? " " : ""}
    </span>
  ));
}

export function Landing({
  orgs, theme, onToggleTheme, onOpen, onCreate,
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async (payload, admin) => {
    setBusy(true);
    try {
      const org = await onCreate(payload, admin);  // throws with the server's message
      setAdding(false);
      return org;
    } finally {
      setBusy(false);
    }
  };

  const totals = orgs.reduce((a, o) => ({
    companies: a.companies + (o.companies || 0),
    open: a.open + (o.open || 0),
    unread: a.unread + (o.unread || 0),
  }), { companies: 0, open: 0, unread: 0 });

  return (
    <div style={S.lpApp} data-theme={theme}>
      <style>{CSS}</style>

      {/* Decoration, and inert: aria-hidden with pointer events off, so it can
          never intercept a click or reach a screen reader. */}
      <div style={S.lpGlow} aria-hidden="true">
        <span className="lp-blob lp-blob-a" style={S.lpBlobA} />
        <span className="lp-blob lp-blob-b" style={S.lpBlobB} />
      </div>

      <header style={S.lpNav}>
        <div style={S.lpLogo}>
          <div style={S.lpLogoMark} aria-hidden="true">◆</div>
          <div style={S.lpLogoName}>Outreach CRM</div>
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
          <div className="lp-rise" style={{ ...S.lpEyebrow, "--d": "0ms" }}>
            <Sparkles size={12} /> Workspaces
          </div>
          <h1 style={S.lpTitle}>
            <Words text="Two businesses." from={90} />
            <br />
            <Words text="Which pipeline today?" from={260} />
          </h1>
          <p className="lp-rise" style={{ ...S.lpLead, "--d": "620ms" }}>
            Every organization keeps its own buyers, its own funnel stages and its own
            signature. Pick one to open its CRM — nothing crosses between them.
          </p>

          {orgs.length > 0 && (
            <div className="lp-rise" style={{ ...S.lpTotals, "--d": "720ms" }}>
              <span><strong>{totals.companies}</strong> companies</span>
              <span style={S.lpDot} aria-hidden="true" />
              <span><strong>{totals.open}</strong> in funnel</span>
              {totals.unread > 0 && (
                <>
                  <span style={S.lpDot} aria-hidden="true" />
                  <span style={{ color: "var(--accent)" }}>
                    <strong>{totals.unread}</strong> unread {totals.unread === 1 ? "reply" : "replies"}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div style={S.lpSectionHead}>
          <span style={S.lpSectionTitle}>
            Organizations{orgs.length > 0 && ` · ${orgs.length}`}
          </span>
        </div>

        <div style={S.lpGrid}>
          {orgs.map((o, i) => <OrgCard key={o.id} org={o} index={i} onOpen={onOpen} />)}

          <button className="lp-add lp-rise" style={{ ...S.lpAdd, "--d": `${orgs.length * 70}ms` }}
            onClick={() => setAdding(true)}>
            <div className="lp-add-icon" style={S.lpAddIcon}><Plus size={22} /></div>
            <div style={S.lpAddTitle}>Add organization</div>
            <div style={S.lpAddSub}>
              Its own pipeline, verticals, colour and logo. Needs the administrator
              password.
            </div>
          </button>

          {/* Only reachable on a database that has been migrated but never
              seeded. An empty grid with one dashed tile in it reads as broken,
              so it gets a sentence instead. */}
          {orgs.length === 0 && (
            <div style={S.lpEmpty}>
              <Building2 size={26} style={{ color: "var(--faint)" }} />
              <div style={{ ...S.lpAddTitle, marginTop: 2 }}>No organizations yet</div>
              <div style={{ ...S.lpAddSub, maxWidth: 380 }}>
                Run <code style={S.code}>npm run migrate</code> to create BSBW and CCM,
                or add one here with the administrator credentials from{" "}
                <code style={S.code}>server/.env</code>.
              </div>
            </div>
          )}
        </div>
      </main>

      <footer style={S.lpFoot}>
        No sign-in — anyone who can reach this page can open either pipeline.
        Adding an organization asks for the administrator credentials in server/.env.
      </footer>

      {adding && (
        <OrgForm taken={orgs.map(o => o.id)} busy={busy}
          onSave={create} onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}
