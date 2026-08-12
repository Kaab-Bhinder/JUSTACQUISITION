import { useState, useEffect, useCallback } from "react";
import * as api from "./api.js";
import { Boot } from "./components/Boot.jsx";
import { GateLogin } from "./pages/GateLogin.jsx";
import { Landing } from "./pages/Landing.jsx";
import { VerticalPicker } from "./pages/VerticalPicker.jsx";
import App from "./App.jsx";

/* ----------------------------------------------------------------------
   The shell

   Three screens and the rule for being on each:

     no organization picked            → Landing
     an organization, no vertical      → VerticalPicker
     both picked                       → App, the CRM itself

   The CRM is one vertical's board now: its own columns, its own script, its
   own funnel, its own sending account. The organization is the tenant around
   those; picking one shows its verticals, and picking a vertical opens the
   pipeline.

   There are no accounts. Which organization and vertical are in the URL
   fragment (#/org/bsbw/v/3), so a board is bookmarkable and the back button
   walks back out — vertical, then organization.
---------------------------------------------------------------------- */

const prefersDark = () => typeof window !== "undefined" && !!window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const readTheme = () => {
  try {
    const saved = localStorage.getItem("crm.theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* private mode, or storage disabled */ }
  return prefersDark() ? "dark" : "light";
};

const fromHash = () => {
  const h = window.location.hash || "";
  const m = /^#\/org\/([a-z0-9-]+)(?:\/v\/(\d+))?/i.exec(h);
  return {
    org: m ? m[1].toLowerCase() : null,
    vertical: m?.[2] ? Number(m[2]) : null,
  };
};

const setHash = (orgId, verticalId) => {
  const next = orgId
    ? verticalId ? `#/org/${orgId}/v/${verticalId}` : `#/org/${orgId}`
    : "#/";
  if (window.location.hash !== next) window.location.hash = next;
};

export default function Root() {
  const [orgs, setOrgs] = useState(undefined);       // undefined until loaded
  const [orgId, setOrgId] = useState(() => fromHash().org);
  /* undefined = not asked yet for this org; [] = asked, none exist. The
     picker must not say "no verticals" while the request is still out. */
  const [verticals, setVerticals] = useState(undefined);
  const [verticalId, setVerticalId] = useState(() => fromHash().vertical);
  const [theme, setTheme] = useState(readTheme);
  const [error, setError] = useState("");
  /* 401 from the first load: the API's gate wants credentials and (cross-
     origin) the browser prompt can't collect them — our login screen does. */
  const [needGate, setNeedGate] = useState(false);
  const [gateError, setGateError] = useState("");

  const toggleTheme = () => setTheme(t => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("crm.theme", next); } catch { /* ignore */ }
    return next;
  });

  /* One place settles what is open, so the API headers and the URL can never
     disagree. Guards both levels: a stale org id drops to the landing page, a
     stale vertical id drops to the picker. */
  const settle = useCallback((orgList, vertList, wantOrg, wantVertical) => {
    const okOrg = wantOrg && orgList?.some(o => o.id === wantOrg) ? wantOrg : null;
    const okVert = okOrg && vertList?.some(v => v.id === wantVertical) ? wantVertical : null;
    api.setOrg(okOrg);
    api.setVertical(okVert);
    setOrgId(okOrg);
    setVerticalId(okVert);
    setHash(okOrg, okVert);
  }, []);

  const boot = useCallback(async () => {
    try {
      const { orgs: list } = await api.listOrgs();
      setNeedGate(false);
      setOrgs(list || []);
      const want = fromHash();
      const okOrg = want.org && (list || []).some(o => o.id === want.org) ? want.org : null;
      api.setOrg(okOrg);
      setOrgId(okOrg);
      if (!okOrg) { setHash(null, null); return; }
      /* The vertical list needs the org header set first. */
      const { verticals: vs } = await api.listVerticalsIn();
      setVerticals(vs || []);
      settle(list, vs, okOrg, want.vertical);
    } catch (e) {
      if (e.status === 401) { setNeedGate(true); return; }
      setError(e.message);
    }
  }, [settle]);

  useEffect(() => { boot(); }, [boot]);

  /* The login screen's submit: keep the pair for the session, try again.
     A wrong pair lands straight back here with a message instead of looping. */
  const signIn = async (user, pass) => {
    api.setGate(user, pass);
    setGateError("");
    try {
      await api.listOrgs();
    } catch (e) {
      api.clearGate();
      setGateError(e.status === 401 ? "That user and password don't match." : e.message);
      return;
    }
    await boot();
  };

  /* Back/forward. Everything that changes org or vertical also writes the
     hash, so this listener is the single reaction to it. */
  useEffect(() => {
    const onHash = async () => {
      const want = fromHash();
      const okOrg = want.org && (orgs || []).some(o => o.id === want.org) ? want.org : null;
      if (okOrg !== orgId) {
        api.setOrg(okOrg);
        setOrgId(okOrg);
        setVerticals(undefined);
        setVerticalId(null);
        if (okOrg) {
          try {
            const { verticals: vs } = await api.listVerticalsIn();
            setVerticals(vs || []);
            settle(orgs, vs, okOrg, want.vertical);
          } catch (e) { setError(e.message); }
        } else setHash(null, null);
        return;
      }
      const okVert = okOrg && (verticals || []).some(v => v.id === want.vertical)
        ? want.vertical : null;
      if (okVert !== verticalId) {
        api.setVertical(okVert);
        setVerticalId(okVert);
        if (okVert !== want.vertical) setHash(okOrg, okVert);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [orgs, verticals, orgId, verticalId, settle]);

  const openOrg = async (id) => {
    api.setOrg(id);
    setOrgId(id);
    setVerticals(undefined);
    setVerticalId(null);
    setHash(id, null);
    try {
      const { verticals: vs } = await api.listVerticalsIn();
      setVerticals(vs || []);
    } catch (e) { setError(e.message); }
  };

  const leaveOrg = () => {
    api.setOrg(null); api.setVertical(null);
    setOrgId(null); setVerticalId(null);
    setVerticals(undefined);
    setHash(null, null);
  };

  const openVertical = (id) => {
    api.setVertical(id);
    setVerticalId(id);
    setHash(orgId, id);
  };

  const leaveVertical = () => {
    api.setVertical(null);
    setVerticalId(null);
    setHash(orgId, null);
  };

  const createOrg = async (payload, admin) => {
    const { org, orgs: list } = await api.createOrg(payload, admin);
    setOrgs(list);
    /* Straight in: the first thing to do inside a new organization is add its
       first vertical, and the picker is where that happens. */
    if (org?.id) await openOrg(org.id);
    return org;
  };

  const createVertical = async (payload) => {
    const { vertical, verticals: vs } = await api.createVertical(payload);
    setVerticals(vs);
    /* Straight into the new vertical: it opens on its setup wizard. */
    if (vertical?.id) openVertical(vertical.id);
    return vertical;
  };

  /* From the picker's card — the dialog there has already made the person
     type the name and sit out the countdown. */
  const deleteVerticalCard = async (v) => {
    const { verticals: vs } = await api.deleteVertical(v.id, v.name);
    setVerticals(vs);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  if (needGate) return <GateLogin theme={theme} error={gateError} onSubmit={signIn} />;
  if (error) return <Boot theme={theme} error={error} />;
  if (orgs === undefined) return <Boot theme={theme} error="" />;

  const org = (orgs || []).find(o => o.id === orgId) || null;

  if (!org) {
    return (
      <Landing orgs={orgs}
        theme={theme} onToggleTheme={toggleTheme}
        onOpen={openOrg} onCreate={createOrg} />
    );
  }

  if (verticals === undefined) return <Boot theme={theme} error="" />;

  const vertical = (verticals || []).find(v => v.id === verticalId) || null;

  if (!vertical) {
    return (
      <VerticalPicker org={org} verticals={verticals}
        theme={theme} onToggleTheme={toggleTheme}
        onOpen={openVertical} onCreate={createVertical}
        onLeave={leaveOrg}
        onDelete={deleteVerticalCard} />
    );
  }

  return (
    <App
      /* Remounts on an org OR vertical switch: every piece of CRM state —
         selection, filters, the open drawer — belongs to one board. */
      key={`${org.id}/${vertical.id}`}
      org={org}
      vertical={vertical}
      verticals={verticals}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLeave={leaveVertical}
      onLeaveOrg={leaveOrg}
      onSwitchVertical={openVertical}
      onVerticalsUpdated={(vs) => setVerticals(vs)}
      onOrgUpdated={(list) => setOrgs(list)}
    />
  );
}
