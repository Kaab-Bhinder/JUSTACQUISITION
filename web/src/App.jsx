import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus, Search, ChevronRight, CheckCircle2, TrendingUp,
  Trash2, List, LayoutGrid, Sun, Moon, Upload, Send,
  Inbox, Reply, ChevronLeft, SlidersHorizontal, Layers,
  Check, AlertTriangle, Square, Settings2,
} from "lucide-react";

import * as api from "./api.js";
import { S, CSS, orgVars } from "./theme.js";
import { OrgForm } from "./components/OrgForm.jsx";
import { OrgMark } from "./components/OrgMark.jsx";

import { emptyRow, byRole, displayValue, recipientsFor, emailColumns } from "./domain/columns.js";
import {
  StageCtx, DEFAULT_STAGES, stageOf, inFunnelStage, labelOf,
} from "./domain/stages.js";
import { fmtDate } from "./domain/dates.js";

import { NavItem } from "./components/NavItem.jsx";
import { Card } from "./components/Card.jsx";
import { ListMeta, DataTable } from "./components/DataTable.jsx";
import { CompanyCell, DirCell } from "./components/cells.jsx";
import { EmailThread } from "./components/EmailThread.jsx";
import { SendPreview } from "./components/SendPreview.jsx";
import { ConfirmDelete } from "./components/ConfirmDelete.jsx";
import { Empty } from "./components/ui.jsx";
import { BulkBar } from "./components/BulkBar.jsx";
import { Boot } from "./components/Boot.jsx";
import { MailBar } from "./components/MailBar.jsx";
import { Composer } from "./components/Composer.jsx";
import { ImportModal } from "./components/ImportModal.jsx";
import { Drawer } from "./components/Drawer.jsx";
import { AddForm } from "./components/AddForm.jsx";
import { VerticalSetup } from "./components/VerticalSetup.jsx";

/* ----------------------------------------------------------------------
   Buyer Outreach CRM — one vertical's board

   Everything on screen belongs to one vertical of one organization: its own
   columns (declared in setup), its own funnel, its own script and its own
   sending account. Root remounts this component on any switch, so nothing
   below thinks about there being other boards.

   A vertical that hasn't finished setup renders the wizard instead of an
   empty board whose columns nobody has described yet.
---------------------------------------------------------------------- */

export default function App({
  org, vertical: verticalProp, verticals, theme, onToggleTheme,
  onLeave, onLeaveOrg, onSwitchVertical, onVerticalsUpdated, onOrgUpdated,
}) {
  /* The vertical is edited in place (settings, the wizard), so the fresh copy
     lives in state seeded from the prop. */
  const [vertical, setVertical] = useState(verticalProp);
  const columns = vertical.columns || [];

  const [companies, setCompanies] = useState([]);
  const [boot, setBoot] = useState({ loading: true, error: "" });
  const [view, setView] = useState("pipeline"); // pipeline | inbox | responded | won
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [row, setRow] = useState(() => emptyRow(columns));
  const [editing, setEditing] = useState(null);            // {id, name} while editing a lead
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
  const [layout, setLayout] = useState("list");            // list | board
  const [stageFilter, setStageFilter] = useState("all");
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [picked, setPicked] = useState([]);                // checked row ids
  const [importOpen, setImportOpen] = useState(false);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [orgSettings, setOrgSettings] = useState(false);
  const [verticalSettings, setVerticalSettings] = useState(false);
  const [composer, setComposer] = useState(null);   // { mode, targets, advance }
  const [dragId, setDragId] = useState(null);
  const [dropOn, setDropOn] = useState(null);
  const [autosavePulse, setAutosavePulse] = useState(0);
  const [mail, setMail] = useState({
    configured: false, busy: false, user: null,
    lastSync: null, lastFiled: 0, error: "", pollSeconds: 90,
  });

  const autosaveRef = useRef({ timer: null, inFlight: false, pending: false, savedKey: "", warnedDuplicate: "" });

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  /* Every mutation answers with the company rows it touched. Merge those in
     place rather than re-fetching the table, so a click is one round trip. */
  const merge = (rows) => {
    if (!rows?.length) return;
    setCompanies(cs => {
      const byId = new Map(rows.map(r => [r.id, r]));
      const next = cs.map(c => byId.get(c.id) || c);
      const seen = new Set(cs.map(c => c.id));
      const added = rows.filter(r => !seen.has(r.id));
      return added.length ? [...next, ...added].sort((a, b) => a.id - b.id) : next;
    });
  };

  const guard = (fn) => async (...args) => {
    try { return await fn(...args); }
    catch (e) { flash(e.message); return null; }
  };

  const openNewLead = () => {
    autosaveRef.current.savedKey = "";
    autosaveRef.current.warnedDuplicate = "";
    setEditing(null);
    setRow(emptyRow(columns));
    setShowForm(true);
  };

  const openEdit = (c) => {
    const nextRow = { ...emptyRow(columns), ...(c.data || {}) };
    autosaveRef.current.savedKey = JSON.stringify({ id: c.id, row: nextRow });
    autosaveRef.current.warnedDuplicate = "";
    setSelected(null);
    setRow(nextRow);
    setEditing({ id: c.id, name: c.name });
    setShowForm(true);
  };

  const persistLead = async ({ close = false, autosave = false } = {}) => {
    const nameCol = byRole(columns, "name");
    const name = nameCol ? String(row[nameCol.key] ?? "").trim() : "";
    if (!name) throw new Error("The name column can't be empty.");

    const wanted = name.toLowerCase();
    const duplicate = companies.find(c =>
      c.id !== editing?.id && String(c.name ?? "").trim().toLowerCase() === wanted);
    if (duplicate) {
      const key = `${editing?.id || "new"}:${wanted}`;
      const message = `"${name}" already exists in this vertical.`;
      if (autosave) {
        if (autosaveRef.current.warnedDuplicate !== key) {
          autosaveRef.current.warnedDuplicate = key;
          flash(message);
        }
        return null;
      }
      throw new Error(message);
    }

    autosaveRef.current.warnedDuplicate = "";

    const result = editing
      ? await api.updateCompany(editing.id, { data: row })
      : await api.createCompany({ data: row });
    merge(result.companies);

    const saved = result.companies[0];
    autosaveRef.current.savedKey = JSON.stringify({ id: saved.id, row });

    if (close) {
      setShowForm(false);
      setEditing(null);
      setRow(emptyRow(columns));
      autosaveRef.current.savedKey = "";
      autosaveRef.current.warnedDuplicate = "";
    } else if (!editing) {
      setEditing({ id: saved.id, name: saved.name });
    }

    return saved;
  };

  /* One request brings back the board, its stages, the vertical itself and
     the mail status — everything the first render needs. */
  const load = async () => {
    const data = await api.bootstrap();
    setCompanies(data.companies);
    if (data.stages?.length) setStages(data.stages);
    if (data.vertical) setVertical(data.vertical);
    if (data.mail) setMail(m => ({ ...m, ...data.mail }));
    return data;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
        if (alive) setBoot({ loading: false, error: "" });
      } catch (e) {
        if (alive) setBoot({ loading: false, error: e.message });
      }
    })();
    return () => { alive = false; };
  }, []);

  /* Search covers the name and every declared column's value — the columns
     ARE the record now. */
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      Object.values(c.data || {}).some(v => String(v).toLowerCase().includes(q)));
  }, [companies, query]);

  const inFunnel = filtered.filter(c => inFunnelStage(c, stages));

  const unread = companies.reduce((n, c) =>
    n + (c.emails || []).filter(m => m.dir === "in" && !m.read).length, 0);
  const threads = companies.filter(c => (c.emails || []).length > 0);

  const stageCounts = useMemo(() => {
    const m = { all: inFunnel.length };
    stages.forEach(s => { m[s.id] = inFunnel.filter(c => c.stage === s.id).length; });
    return m;
  }, [inFunnel, stages]);

  const toggleSort = (key) => setSort(s =>
    s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sortRows = (rows, cols) => {
    const col = cols.find(k => k.key === sort.key && k.sortValue);
    if (!col) return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue(a), bv = col.sortValue(b);
      if (av === bv) return a.name.localeCompare(b.name);
      if (av === null || av === undefined || av === "") return 1;   // blanks always last
      if (bv === null || bv === undefined || bv === "") return -1;
      return av > bv ? dir : -dir;
    });
  };

  const clearPicked = () => setPicked([]);
  const togglePick = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const pickAll = (rows) => setPicked(p => {
    const ids = rows.map(r => r.id);
    const allOn = ids.length > 0 && ids.every(i => p.includes(i));
    return allOn ? p.filter(i => !ids.includes(i)) : [...new Set([...p, ...ids])];
  });
  const goto = (v) => {
    setView(v); clearPicked();
    setSort(v === "pipeline" ? { key: "name", dir: "asc" }
      : v === "responded" ? { key: "status", dir: "desc" }
      : { key: "closed", dir: "desc" });
  };

  /* The sidebar's stage pages: one per pipeline stage, showing that stage's
     leads. "All leads" is the same page unfiltered. */
  const gotoStage = (id) => {
    goto("pipeline");
    setStageFilter(id);
  };

  const FUNNEL = stages.map(s => s.id);

  const nameOf = (ids) => {
    const hits = companies.filter(c => ids.includes(c.id));
    return hits.length === 1 ? hits[0].name : `${hits.length} companies`;
  };

  const advanceMany = guard(async (ids) => {
    const { companies: rows, moved } = await api.advance(ids);
    merge(rows);
    clearPicked();
    flash(moved === 1
      ? `${rows[0].name} moved to ${labelOf(rows[0].stage, stages)}`
      : `${moved} companies moved to their next follow-up`);
  });

  /* Deletes go through one gate: a modal that names what dies, then makes
     the button wait out a countdown. See ConfirmDelete. */
  const [confirmDel, setConfirmDel] = useState(null);  // {title,message,requireText,run}

  const doRemove = guard(async (ids, label) => {
    const { ids: gone } = await api.removeCompanies(ids);
    const dead = new Set(gone);
    setCompanies(cs => cs.filter(c => !dead.has(c.id)));
    clearPicked(); setSelected(null); setConfirmDel(null);
    flash(`${label} deleted`);
  });

  const removeMany = (ids) => {
    if (!ids.length) return;
    const label = nameOf(ids);
    setConfirmDel({
      title: ids.length === 1 ? `Delete ${label}?` : `Delete ${ids.length} leads?`,
      message: ids.length === 1
        ? `${label} will be deleted for good — its data, its email thread and its history go with it.`
        : `${ids.length} leads will be deleted for good — their data, their email threads and their history go with them.`,
      run: () => doRemove(ids, label),
    });
  };

  const removeCompany = (c) => removeMany([c.id]);

  /* For leads contacted OUTSIDE the CRM (an earlier campaign, another tool):
     records their addresses as already-emailed without sending anything, so
     the cells flip to Sent and bulk skips them forever. Idempotent. */
  /* Scan the sending account's mailbox for mail already sent to the
     selected leads (before the CRM, from anywhere) and file it with its
     REAL Message-IDs — follow-ups then thread into those original
     conversations. Chunked: each request is one IMAP session over a small
     batch. */
  const adoptHistoryMany = async (ids) => {
    const CHUNK = 15;
    let adopted = 0, checked = 0;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        flash(`Scanning mailbox… ${Math.min(i + CHUNK, ids.length)}/${ids.length} leads`);
        const r = await api.adoptHistory(ids.slice(i, i + CHUNK));
        merge(r.companies);
        adopted += r.adopted; checked += r.checked;
      }
      clearPicked();
      flash(adopted
        ? `Adopted ${adopted} earlier email${adopted === 1 ? "" : "s"} from the mailbox — follow-ups will thread into them`
        : checked
          ? "No earlier mail found in the mailbox for those addresses"
          : "Nothing to scan — those addresses already have threaded mail on record");
    } catch (e) {
      flash(e.message);
    }
  };

  const markEmailedMany = guard(async (ids) => {
    const { companies: rows, marked } = await api.markEmailed(ids);
    merge(rows);
    clearPicked();
    flash(marked
      ? `${marked} address${marked === 1 ? "" : "es"} marked as already emailed`
      : "Nothing to mark — those addresses are already recorded as sent");
  });

  const saveNew = guard(async () => {
    const saved = await persistLead({ close: true });
    if (saved) flash(`${saved.name} added to ${labelOf(saved.stage, stages)}`);
  });

  const saveEdit = guard(async () => {
    const saved = await persistLead({ close: true });
    if (saved) flash(`${saved.name} updated`);
  });

  const closeForm = () => {
    autosaveRef.current.timer && clearTimeout(autosaveRef.current.timer);
    autosaveRef.current = { timer: null, inFlight: false, pending: false, savedKey: "", warnedDuplicate: "" };
    setShowForm(false);
    setEditing(null);
    setRow(emptyRow(columns));
  };

  const currentName = (() => {
    const col = byRole(columns, "name");
    return col ? String(row[col.key] ?? "").trim() : "";
  })();

  useEffect(() => {
    if (!showForm || !currentName) return;
    const key = JSON.stringify({ id: editing?.id || null, row });
    if (autosaveRef.current.savedKey === key) return;
    clearTimeout(autosaveRef.current.timer);
    autosaveRef.current.timer = setTimeout(async () => {
      autosaveRef.current.timer = null;
      if (autosaveRef.current.inFlight) {
        autosaveRef.current.pending = true;
        return;
      }
      autosaveRef.current.inFlight = true;
      try {
        const saved = await persistLead({ autosave: true });
        if (saved) setAutosavePulse(p => p + 1);
      } catch (e) {
        flash(e.message);
      } finally {
        autosaveRef.current.inFlight = false;
        if (autosaveRef.current.pending) {
          autosaveRef.current.pending = false;
          setAutosavePulse(p => p + 1);
        }
      }
    }, 700);
    return () => clearTimeout(autosaveRef.current.timer);
  }, [showForm, currentName, editing?.id, row, autosavePulse]);

  /* The stage dropdown on each row — the same route the board drag uses,
     reachable from one control. Only the vertical's own stages exist. */
  const setStageTo = guard(async (c, to) => {
    if (!to || to === c.stage || !stages.some(s => s.id === to)) return;
    const { companies: rows, stageLabel } = await api.moveToStage(c.id, to);
    merge(rows);
    flash(`${c.name} moved to ${stageLabel}`);
  });

  const openCompany = (c) => {
    setSelected(c);
    if (!(c.emails || []).some(m => m.dir === "in" && !m.read)) return;
    setCompanies(cs => cs.map(x => x.id === c.id
      ? { ...x, emails: x.emails.map(m => (m.dir === "in" ? { ...m, read: true } : m)) } : x));
    api.markRead(c.id).then(r => merge(r.companies)).catch(() => {});
  };

  const dropOnStage = guard(async (stageId) => {
    const c = companies.find(x => x.id === dragId);
    setDragId(null); setDropOn(null);
    if (!c || c.stage === stageId || !stageOf(stageId, stages)) return;
    const { companies: rows, stageLabel } = await api.moveToStage(c.id, stageId);
    merge(rows);
    flash(`${c.name} moved to ${stageLabel}`);
  });

  /* The settings' pipeline panel saves through here. It has no remap UI, so
     companies stranded in a deleted stage are moved to the first surviving
     one rather than orphaned — on first run the board is empty and this is
     moot; in settings it is the safe default. */
  const saveWizardStages = async (list) => {
    const keep = new Set(list.map(s => s.id));
    const remap = {};
    for (const s of stages) {
      if (!keep.has(s.id) && companies.some(c => c.stage === s.id))
        remap[s.id] = list[0].id;
    }
    const res = await api.saveStages(list, remap);
    setStages(res.stages);
    setCompanies(res.companies);
    if (stageFilter !== "all" && !res.stages.some(s => s.id === stageFilter))
      setStageFilter("all");
    return res;
  };

  /* The send itself. The composer collects the confirmation; this delivers,
     merges what the server recorded, and reports honestly — including partial
     failure, which the composer renders per recipient. */
  const sendEmails = guard(async ({ targets, subject, body, advance }) => {
    const res = await api.sendEmails({
      ids: targets.map(t => t.id), subject, body, advance,
    });
    merge(res.companies);
    flash(res.sent === 1
      ? `Sent to ${res.companies[0]?.name || "1 company"}`
      : `Sent ${res.sent} emails`);
    return res;
  });

  const logReply = guard(async ({ target, subject, body }) => {
    const { companies: rows } = await api.logReply({ id: target.id, subject, body });
    merge(rows);
    setComposer(null);
    flash(`Reply from ${target.name} logged`);
  });

  const refreshMail = async () => {
    const st = await api.mailStatus();
    setMail(m => ({ ...m, ...st, busy: false }));
  };

  const syncMail = guard(async () => {
    if (mail.busy) return;
    setMail(m => ({ ...m, busy: true }));
    try {
      const { filed, mine = 0, companies: rows } = await api.mailSync();
      merge(rows);
      const elsewhere = Math.max(0, filed - mine);
      flash(mine
        ? `${mine} new ${mine === 1 ? "reply" : "replies"} filed` +
          (elsewhere ? ` · ${elsewhere} elsewhere` : "")
        : elsewhere
          ? `No new replies here — ${elsewhere} filed elsewhere`
          : "No new replies");
    } finally {
      await refreshMail().catch(() => setMail(m => ({ ...m, busy: false })));
    }
  });

  const testMail = async () => {
    try { return await api.mailTest(); }
    catch (e) { return { ok: false, error: e.message }; }
  };

  useEffect(() => {
    if (!mail.configured) return;
    const ms = Math.max(15, mail.pollSeconds || 90) * 1000;
    const t = setInterval(() => {
      api.getCompanies().then(d => setCompanies(d.companies))
        .then(() => api.mailStatus())
        .then(st => setMail(m => (m.busy ? m : { ...m, ...st })))
        .catch(() => {});
    }, ms);
    return () => clearInterval(t);
  }, [mail.configured, mail.pollSeconds]);

  /* ---- reply notifications ----------------------------------------------
     The server files replies on its own clock; this watches the unread count
     that results. When it rises, a toast says so here, and — if the browser
     permission was granted — a desktop notification says so even when this
     tab is in the background. First load initialises silently: mail that was
     already waiting is news for the badge, not for a popup. */
  const prevUnread = useRef(null);
  useEffect(() => {
    if (prevUnread.current === null) { prevUnread.current = unread; return; }
    if (unread > prevUnread.current) {
      const n = unread - prevUnread.current;
      flash(`📬 ${n === 1 ? "A reply" : `${n} replies`} just came in — see Emails`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`${vertical.name} — reply received`, {
            body: n === 1 ? "Someone replied to your outreach. Open Emails to read it."
              : `${n} new replies in the Emails tab.`,
          });
        } catch { /* some browsers restrict constructor use */ }
      }
    }
    prevUnread.current = unread;
    /* Deliberately keyed on unread alone — flash/vertical are stable enough
       and re-running on their identity would double-fire toasts. */
  }, [unread]);

  /* Ask for the desktop-notification permission once reply detection is
     actually on — the prompt makes sense only when there is something that
     could notify. */
  useEffect(() => {
    if (!mail.configured) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default")
      Notification.requestPermission().catch(() => {});
  }, [mail.configured]);

  /* Admin-gated on the server: the credentials ride in the same request and
     are verified there — a wrong pair throws back into the form's error box. */
  const saveOrg = async (patch, admin) => {
    const { orgs } = await api.updateOrg(org.id, { ...patch, ...admin });
    onOrgUpdated(orgs);
    setOrgSettings(false);
    flash("Organization updated");
  };

  /* The dialog collected the typed name and the admin credentials; the
     server verifies both. Success ends on the landing page — the place this
     organization no longer is. Thrown errors surface in the dialog. */
  const deleteOrganization = async ({ confirm, adminEmail, adminPassword }) => {
    const { orgs } = await api.deleteOrg(org.id, confirm, { adminEmail, adminPassword });
    onOrgUpdated(orgs);
    setOrgSettings(false);
    onLeaveOrg();
  };

  /* The wizard and the settings dialog both save through here. Partial
     patches, so each panel saves itself; the verticals list upstairs is
     refreshed so the sidebar and the picker stay truthful. */
  const saveVertical = async (patch) => {
    const res = await api.updateVertical(vertical.id, patch);
    setVertical(res.vertical);
    onVerticalsUpdated(res.verticals);
    return res.vertical;
  };

  /* Settings always opens on the server's copy, not the one this page loaded
     with — the columns could have been edited from another tab (or another
     tool) since, and a stale editor would show, and then silently resave,
     yesterday's format. */
  const openVerticalSettings = guard(async () => {
    const { vertical: fresh } = await api.getVerticalDetail(vertical.id);
    if (fresh) setVertical(fresh);
    setVerticalSettings(true);
  });

  const testVerticalSmtp = (to) => api.testVerticalSmtp(vertical.id, to || vertical.smtpUser || "");
  /* Login only, nothing sent — the "Verify connection" step. */
  const verifyVerticalSmtp = () => api.testVerticalSmtp(vertical.id, "");

  const deleteVertical = () => setConfirmDel({
    title: `Delete the ${vertical.name} vertical?`,
    message: `Everything on this board goes with it — all ${companies.length} leads, every email thread, the pipeline, the script and the sending account. The whole vertical, gone.`,
    requireText: vertical.name,
    run: guard(async () => {
      const { verticals: vs } = await api.deleteVertical(vertical.id, vertical.name);
      setConfirmDel(null);
      onVerticalsUpdated(vs);
      onLeave();
    }),
  });

  /* Big sheets go up in slices: one request per 500 rows keeps every request
     under body-size caps and proxy timeouts, and the board fills as slices
     land. A failure mid-way loses nothing — re-running the same import
     resumes safely, because rows already in become updates, not duplicates. */
  const [importProg, setImportProg] = useState(null);   // {done,total} while importing
  const commitImport = async (recs) => {
    const CHUNK = 500;
    let added = 0, updated = 0;
    setImportProg({ done: 0, total: recs.length });
    try {
      for (let i = 0; i < recs.length; i += CHUNK) {
        const slice = recs.slice(i, i + CHUNK);
        const r = await api.importCompanies(slice);
        merge(r.companies);
        added += r.added ?? r.count ?? 0;
        updated += r.updated ?? 0;
        setImportProg({ done: Math.min(i + CHUNK, recs.length), total: recs.length });
      }
      setImportOpen(false);
      flash(updated
        ? `${added.toLocaleString()} new · ${updated.toLocaleString()} updated — no duplicates`
        : `${added.toLocaleString()} rows imported`);
    } catch (e) {
      flash(`${e.message} — ${added + updated} of ${recs.length} made it in. Run the same import again to finish: existing rows update, never duplicate.`);
    } finally {
      setImportProg(null);
    }
  };

  const counts = { pipeline: filtered.length, inbox: threads.length };

  const compose = (targets, advance) =>
    setComposer({ mode: "send", targets, advance: !!advance });

  /* ---- Generate emails: send mode ---------------------------------------
     Clicking "Generate emails" doesn't open a dialog — it adds columns to the
     board: one Send column per email column the vertical declares (however
     many that is), each cell a Send button for exactly that address of that
     row. Sent state is not local bookkeeping: a cell shows "Sent" when the
     row's thread carries an outbound message to that address, so it survives
     reloads and stays honest.

     Bulk works the same cells in sequence with a time gap between messages —
     Gmail tolerates a paced sender far better than a burst — advancing each
     company's stage once per run. Individual sends leave the stage alone and
     light the "move to next stage" tag instead. */
  /* Send mode survives a refresh: it's a working posture, not a transient
     toggle — the person who generated their send columns expects to find
     them tomorrow. Kept per vertical, in the browser. */
  const [sendMode, setSendModeRaw] = useState(() => {
    try { return localStorage.getItem(`crm.sendmode.${verticalProp.id}`) === "1"; }
    catch { return false; }
  });
  const setSendMode = (next) => setSendModeRaw(prev => {
    const v = typeof next === "function" ? next(prev) : next;
    try { localStorage.setItem(`crm.sendmode.${verticalProp.id}`, v ? "1" : "0"); }
    catch { /* private mode */ }
    return v;
  });
  const [gapSec, setGapSec] = useState(30);
  const [rangeFrom, setRangeFrom] = useState("");  // 1-based, inclusive; empty = 1
  const [rangeTo, setRangeTo] = useState("");      // empty = the end
  const [bulk, setBulk] = useState(null);          // {done,total} while running
  const [sendPreview, setSendPreview] = useState(null);   // {c, r} — one cell's message
  const [expandedThread, setExpandedThread] = useState(null);  // company id open in Emails
  const stopRef = useRef(false);

  const scriptReady = !!(vertical.subject || "").trim() && !!(vertical.body || "").trim();
  const credsReady = !!vertical.smtpUser && vertical.smtpConfigured !== false;

  /* Sent-state is PER SCRIPT: the first touch and each follow-up track their
     own outbound record per address, so a follow-up can reach an address the
     first touch already did — but never repeat itself. Rows recorded before
     kinds existed (kind '') count as the first touch. */
  const sentKind = (c, email, kind) => (c.emails || []).some(m =>
    m.dir === "out" &&
    (m.to || "").toLowerCase() === String(email).toLowerCase() &&
    (kind === "script"
      ? !m.kind || m.kind === "script"
      : m.kind === kind));

  /* Which script a row gets: the follow-up linked to its current stage, or
     the first-touch script. The board's Send buttons, the bulk queue and the
     previews all resolve through here — one rule, no divergence. */
  const scriptFor = (c) => {
    const fus = vertical.followups || [];
    const i = fus.findIndex(f => f.stage && f.stage === c.stage);
    if (i >= 0) {
      const f = fus[i];
      return { kind: `fu${i + 1}`, label: `Follow-up ${i + 1}`,
               subject: f.subject || "", body: f.body || "",
               ready: !!(f.body || "").trim() };
    }
    return { kind: "script", label: "First touch",
             subject: vertical.subject || "", body: vertical.body || "",
             ready: !!(vertical.subject || "").trim() && !!(vertical.body || "").trim() };
  };

  const inFunnelAll = companies.filter(c => inFunnelStage(c, stages));
  const emailable = inFunnelAll.filter(c => recipientsFor(columns, c.data).length > 0);
  const messageCount = emailable.reduce(
    (n, c) => n + recipientsFor(columns, c.data).length, 0);

  const generateEmails = () => {
    if (!emailable.length && !sendMode) {
      flash("No rows in the funnel have anything in their email columns yet.");
      return;
    }
    setSendMode(v => !v);
    if (!sendMode) { setView("pipeline"); setLayout("list"); }
  };

  const sendSingle = async (c, colKey, adv, subjectOverride, bodyOverride) => {
    const script = scriptFor(c);
    const res = await api.sendEmails({
      ids: [c.id], subject: subjectOverride ?? script.subject, body: bodyOverride ?? script.body,
      advance: adv, colKey, kind: script.kind,
    });
    merge(res.companies);
    return res;
  };

  const sendCell = guard(async (c, r, subject, body) => {
    const res = await sendSingle(c, r.colKey, false, subject, body);
    flash(`Sent to ${r.email}`);
    return res;      // truthy on success, so the preview knows to close
  });

  const runBulk = async (queue) => {
    /* Row-major over the chosen slice, advance once per company per run. */
    const jobs = [];
    const seen = new Set();
    for (const { c, r } of queue) {
      jobs.push({ c, r, adv: !seen.has(c.id) });
      seen.add(c.id);
    }
    if (!jobs.length) { flash("Nothing unsent in that range."); return; }

    stopRef.current = false;
    setBulk({ done: 0, total: jobs.length });
    let sentCount = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (stopRef.current) break;
      const { c, r, adv } = jobs[i];
      try {
        await sendSingle(c, r.colKey, adv);
        sentCount++;
      } catch (e) {
        flash(e.message);
        /* An auth failure will fail every remaining send the same way. */
        if (/refused that sign-in|app password|sending account/i.test(e.message)) break;
      }
      setBulk({ done: i + 1, total: jobs.length });
      if (i < jobs.length - 1 && !stopRef.current)
        await new Promise(res => setTimeout(res, Math.max(3, gapSec) * 1000));
    }
    setBulk(null);
    flash(stopRef.current
      ? `Stopped — ${sentCount} sent`
      : `Bulk send finished — ${sentCount} sent`);
  };

  /* ---- table columns ----
     The vertical's own columns become the table's. The name column is the
     company cell; long text stays in the drawer; the next few declared
     columns ride along as data cells, sorted as text. */
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  const colCompany = { key: "name", label: byRole(columns, "name")?.label || "Name", w: 210,
    sortValue: c => c.name.toLowerCase(), render: c => <CompanyCell c={c} /> };

  /* Every declared column becomes a table column — the board reads as the
     Excel sheet it mirrors. Fixed pixel widths per column; past the viewport
     the table scrolls sideways rather than squeezing anything out. */
  const colWidth = (col) =>
    col.type === "email" || col.type === "url" ? 190
    : col.type === "longtext" ? 220
    : col.type === "phone" || col.type === "date" || col.type === "number" ? 130
    : 150;

  const makeDataCol = (col) => ({
    key: `d:${col.key}`, label: col.label, w: colWidth(col),
    sortValue: c => String(c.data?.[col.key] ?? "").toLowerCase(),
    render: c => {
      const v = displayValue(col, c.data?.[col.key]);
      if (!v) return <span style={S.cellSub}>—</span>;
      /* Full value, always: long addresses and URLs wrap onto extra lines and
         the row grows to fit, rather than clipping behind an ellipsis. */
      return (
        <span style={{
          ...(col.type === "email" || col.type === "phone" ? S.cellMono : S.cellStrong),
          display: "block", whiteSpace: "normal", overflowWrap: "anywhere",
          lineHeight: 1.45,
        }}>{v}</span>
      );
    },
  });

  /* The full sheet: every declared column, board-wide. */
  const allDataCols = columns.filter(c => c.role !== "name").map(makeDataCol);

  /* The send-mode columns: one per declared email column. A cell is the send
     state of exactly one address of one row — button, Sent tag, or a dash
     when that column is empty on this row. */
  const sendCols = !sendMode ? [] : emailColumns(columns).map(col => ({
    key: `send:${col.key}`, label: `Send · ${col.label}`, w: 150,
    sortValue: c => {
      const rs = recipientsFor(columns, c.data).filter(r => r.colKey === col.key);
      if (!rs.length) return 2;
      const script = scriptFor(c);
      return rs.some(r => !sentKind(c, r.email, script.kind)) ? 0 : 1;   // unsent first
    },
    render: c => {
      /* One control PER ADDRESS the cell carries — cells routinely stack
         two, and each address has its own sent-state per script. */
      const rs = recipientsFor(columns, c.data).filter(r => r.colKey === col.key);
      if (!rs.length) return <span style={S.cellSub}>—</span>;
      const script = scriptFor(c);
      const many = rs.length > 1;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4,
          alignItems: "flex-start" }}>
          {rs.map(r => {
            const shortAddr = r.email.split("@")[0].slice(0, 14);
            if (sentKind(c, r.email, script.kind))
              return (
                <span key={r.email} style={{ ...S.duePill, background: "var(--good-soft)",
                  color: "var(--good)" }}
                  title={`${script.label} already sent to ${r.email}`}>
                  <Check size={11} /> Sent{many ? ` · ${shortAddr}` : ""}
                </span>
              );
            if (!script.ready)
              return (
                <button key={r.email} className="row-btn"
                  style={{ ...S.rowBtn, opacity: 0.55 }} disabled
                  title={`Write the ${script.label} script in Vertical settings → Email script first`}>
                  <Send size={11} /> {script.kind === "script" ? "Send" : script.label}
                </button>
              );
            return (
              <button key={r.email} className="row-btn" style={S.rowBtn}
                disabled={!!bulk}
                title={`Read the generated ${script.label} email for ${r.email}, then send it`}
                onClick={stop(() => setSendPreview({ c, r }))}>
                <Send size={11} />
                {many ? shortAddr
                  : script.kind === "script" ? "Send" : script.label}
              </button>
            );
          })}
        </div>
      );
    },
  }));

  /* The stage as a dropdown on every row: the vertical's own stages, nothing
     else — the pipeline the user built IS the complete set of places a lead
     can be. A lead sitting in a legacy state (an auto-filed reply, say) shows
     that state as the selected line until a real stage is picked. */
  const colStageSelect = {
    key: "stage", label: "Update stage", w: 170,
    sortValue: c => FUNNEL.indexOf(c.stage),
    render: c => {
      const known = stages.some(s => s.id === c.stage);
      return (
        <select
          value={known ? c.stage : ""}
          style={{ ...S.input, padding: "8px 10px", fontSize: 13.5, width: "100%" }}
          aria-label={`Stage of ${c.name}`}
          onClick={e => e.stopPropagation()}
          onChange={e => setStageTo(c, e.target.value)}>
          {!known && <option value="">{c.stage}</option>}
          {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      );
    },
  };

  /* Always-on contact status, read straight off the thread: which of the
     row's addresses have ANY outbound on record (CRM-sent, follow-up, or
     marked as externally emailed), and whether anyone wrote back. The
     definitive "have we already contacted this one?" answer, visible with
     send mode off. */
  const colContacted = {
    key: "contacted", label: "Contacted", w: 150,
    sortValue: c => {
      const rs = recipientsFor(columns, c.data);
      if ((c.emails || []).some(m => m.dir === "in")) return 3;
      if (!rs.length) return -1;
      const outTo = new Set((c.emails || []).filter(m => m.dir === "out")
        .map(m => String(m.to || "").toLowerCase()));
      return rs.filter(r => outTo.has(r.email)).length / rs.length;
    },
    render: c => {
      const rs = recipientsFor(columns, c.data);
      const outs = (c.emails || []).filter(m => m.dir === "out");
      const outTo = new Set(outs.map(m => String(m.to || "").toLowerCase()));
      const done = rs.filter(r => outTo.has(r.email));
      const replied = (c.emails || []).some(m => m.dir === "in");
      if (replied)
        return <span style={{ ...S.duePill, background: "var(--good-soft)",
          color: "var(--good)" }} title="They wrote back — the thread has their reply">
          <Reply size={11} /> Replied
        </span>;
      if (!rs.length) return <span style={S.cellSub}>no email</span>;
      if (!done.length)
        return <span style={S.cellSub} title="No outbound on record for any of this row's addresses">
          not contacted
        </span>;
      const last = outs[outs.length - 1];
      return (
        <span style={{ ...S.duePill, background: "var(--accent-soft)", color: "var(--accent)" }}
          title={`Emailed: ${done.map(r => r.email).join(", ")}`}>
          <Check size={11} /> {done.length}/{rs.length} emailed{last ? ` · ${fmtDate(last.at)}` : ""}
        </span>
      );
    },
  };

  const pipelineCols = [
    /* Update-stage right beside the name: on a wide sheet the data columns
       scroll away, and the one control every row needs must not scroll with
       them. It is also the only hand-control for stages — one dropdown, no
       competing buttons. */
    colCompany, colStageSelect, colContacted,
    ...allDataCols,
    ...sendCols,
    /* Just Edit and delete. Sending lives in the Send cells (send mode) and
       the bulk bar; a custom one-off message lives in the lead's drawer —
       a per-row Email button on top of those was noise, twice questioned. */
    { key: "actions", label: "", w: 130, align: "right", render: c => (
      <div style={S.rowActions}>
        <button className="row-btn-go" style={S.rowBtnGo} onClick={stop(() => openEdit(c))}>
          Edit
        </button>
        <button className="row-btn" style={{ ...S.rowBtn, color: "var(--danger)",
          background: "var(--danger-soft, var(--surface-3))" }}
          title={`Delete ${c.name}`}
          onClick={stop(() => removeCompany(c))}>
          <Trash2 size={11} />
        </button>
      </div>
    ) },
  ];

  const lastMsg = (c) => (c.emails || [])[(c.emails || []).length - 1] || null;

  /* The funnel table's true width: every declared column at its pixel size.
     Past the viewport, the wrapper scrolls sideways. */
  const pipeMinWidth = 44 + pipelineCols.reduce(
    (n, c) => n + (typeof c.w === "number" ? c.w : 150), 0);

  /* "All leads" is genuinely all of them — including any lead sitting in a
     legacy state outside the pipeline (an auto-filed reply moved it there).
     Nothing on this board can ever be invisible. */
  const pipeRows = sortRows(
    stageFilter === "all" ? filtered : filtered.filter(c => c.stage === stageFilter),
    pipelineCols);

  /* The bulk queue IS the table: same order, same stage filter — so a range
     of "#1 to #10" means exactly the rows numbered 1–10 on screen. Only
     funnel rows with an unsent address qualify. */
  const unsentQueue = pipeRows
    .filter(c => inFunnelStage(c, stages))
    .flatMap(c => {
      const script = scriptFor(c);
      if (!script.ready) return [];
      return recipientsFor(columns, c.data)
        .filter(r => !sentKind(c, r.email, script.kind))
        .map(r => ({ c, r }));
    });
  /* What the queue is made of, by script — the proof that rows in a linked
     stage generate their follow-up, not the first touch. */
  const kindBreakdown = {};
  for (const { c } of unsentQueue) {
    const l = scriptFor(c).label;
    kindBreakdown[l] = (kindBreakdown[l] || 0) + 1;
  }

  const rFrom = Math.max(1, Number(rangeFrom) || 1);
  const rTo = Math.min(unsentQueue.length, Number(rangeTo) || unsentQueue.length);
  const rangeSlice = rFrom <= rTo ? unsentQueue.slice(rFrom - 1, rTo) : [];
  /* The Emails tab is a list of threads: unread first, then newest activity.
     A row expands to the complete conversation when clicked. */
  const unreadOf = (c) => (c.emails || []).filter(m => m.dir === "in" && !m.read).length;
  const inboxThreads = [...threads].sort((a, b) => {
    const ua = unreadOf(a) > 0 ? 1 : 0, ub = unreadOf(b) > 0 ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return String(lastMsg(b)?.at || "").localeCompare(String(lastMsg(a)?.at || ""));
  });

  /* Mark a thread read without opening anything — optimistic, like the
     drawer's open does, so the badge drops the instant it's clicked. */
  const markThreadRead = (c) => {
    setCompanies(cs => cs.map(x => x.id === c.id
      ? { ...x, emails: x.emails.map(m => (m.dir === "in" ? { ...m, read: true } : m)) } : x));
    api.markRead(c.id).then(r => merge(r.companies)).catch(() => {});
  };

  const bulkActions =
    view === "pipeline" ? [
      { label: "Send the script", icon: <Send size={14} />,
        run: () => compose(companies.filter(c => picked.includes(c.id)), true) },
      { label: "Advance without emailing", icon: <ChevronRight size={14} />,
        run: () => advanceMany(picked) },
      { label: "Mark as already emailed", icon: <Check size={14} />,
        run: () => markEmailedMany(picked) },
      { label: "Adopt mailbox history", icon: <Inbox size={14} />,
        run: () => adoptHistoryMany(picked) },
      { label: "Clear", icon: <Trash2 size={14} />, danger: true, run: () => removeMany(picked) },
    ] : [];

  const showBulk = picked.length > 0 && bulkActions.length > 0 &&
    !(view === "pipeline" && layout === "board");
  const isList = view !== "pipeline" || layout === "list";
  const dragging = dragId != null;

  if (boot.loading || boot.error)
    return <Boot theme={theme} error={boot.error} />;

  /* The vertical's own colour drives the accent, so two boards in the same
     organization read differently at a glance. */
  const themedOrg = { ...org, accent: vertical.accent || org.accent };

  /* An unfinished vertical opens on its wizard, full stop. The board behind
     it would be a table with columns nobody has declared yet. */
  if (!vertical.setupDone) {
    return (
      <div style={{ ...S.app, ...orgVars(themedOrg, theme) }} data-theme={theme}>
        <style>{CSS}</style>
        <VerticalSetup vertical={vertical} firstRun
          stages={stages}
          onSave={saveVertical}
          onSaveStages={saveWizardStages}
          onTest={testVerticalSmtp}
          onVerify={verifyVerticalSmtp}
          onClose={() => { /* finishing the wizard sets setupDone via save */ }} />
      </div>
    );
  }

  return (
    <StageCtx.Provider value={stages}>
    <div style={{ ...S.app, ...orgVars(themedOrg, theme) }} data-theme={theme}>
      <style>{CSS}</style>

      {/* ---- Sidebar ---- */}
      {/* Scrollable: a pipeline with many stages must never push Add lead
          and Import off the bottom of the screen. */}
      <aside style={{ ...S.sidebar, overflowY: "auto" }}>
        <div style={S.brand}>
          <button className="brand-btn" style={S.brandBtn} onClick={() => setOrgSettings(true)}
            title="Organization settings" aria-label={`${org.name} settings`}>
            <OrgMark org={org} size={40} logoHeight={19} onBrand />
            <div style={{ minWidth: 0, textAlign: "left" }}>
              <div style={S.brandName}>{org.name}</div>
              <div style={{ ...S.brandSub, whiteSpace: "nowrap" }}>
                <Settings2 size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                Settings
              </div>
            </div>
          </button>
          <button className="theme-btn" style={S.themeBtn} onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* Which vertical this board is, and the way to another one. The
            answer and the way to change it belong together. */}
        <button className="nav-item" style={{ ...S.navItem, marginTop: 14, gap: 8, justifyContent: "flex-start" }}
          onClick={onLeave}>
          <ChevronLeft size={16} /> All verticals
        </button>
        <div style={{ ...S.sectionTitle, margin: "12px 12px 4px" }}>
          <Layers size={11} style={{ verticalAlign: -1.5, marginRight: 5 }} />
          {vertical.name}
        </div>
        {verticals.length > 1 && (
          <nav aria-label="Switch vertical">
            {verticals.filter(v => v.id !== vertical.id).slice(0, 4).map(v => (
              <NavItem key={v.id} icon={<Layers size={16} />} label={v.name}
                count={v.open} onClick={() => onSwitchVertical(v.id)} />
            ))}
          </nav>
        )}

        <nav style={{ marginTop: 14 }}>
          {/* The leads, stage by stage: one page per pipeline stage, right
              where the eye goes. Clicking a stage shows only its leads. */}
          <NavItem icon={<TrendingUp size={18} />} label="All leads" count={counts.pipeline}
            active={view === "pipeline" && stageFilter === "all"}
            onClick={() => gotoStage("all")} />
          {stages.map(s => (
            <NavItem key={s.id}
              icon={<span style={{ ...S.stageDot, width: 11, height: 11, background: s.accent }} />}
              label={s.label} count={stageCounts[s.id] ?? 0}
              active={view === "pipeline" && stageFilter === s.id}
              onClick={() => gotoStage(s.id)} />
          ))}
        </nav>

        <nav style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--sidebar-border)" }}>
          <NavItem icon={<Inbox size={18} />} label="Emails" count={counts.inbox} alert={unread > 0}
            active={view === "inbox"} onClick={() => goto("inbox")} />
        </nav>

        <div style={{ flex: 1 }} />

        {/* Everything about THIS vertical — columns, pipeline, script,
            sending account — lives in its own settings. */}
        <button style={S.stageBtn} onClick={openVerticalSettings}>
          <SlidersHorizontal size={16} /> Vertical settings
        </button>

        {/* The product's point, so it gets the accent: flips the board into
            send mode — a Send column per email column, a bulk bar on top. */}
        <button style={{ ...S.addBtn, ...(sendMode ? { outline: "2px solid var(--accent-soft)" } : {}) }}
          onClick={generateEmails}
          title={sendMode
            ? "Hide the send columns"
            : "Adds a Send column per email column — one button per address, plus bulk send with a time gap"}>
          <Send size={16} />
          {sendMode ? "Hide send columns" : `Generate emails${messageCount > 0 ? ` · ${messageCount}` : ""}`}
        </button>
        <button style={S.importBtn}
          onClick={openNewLead}>
          <Plus size={16} /> Add lead
        </button>
        <button style={S.importBtn} onClick={() => setImportOpen(true)}>
          <Upload size={16} /> Import from Excel
        </button>
      </aside>

      {/* ---- Main ---- */}
      <main style={S.main}>
        <header style={S.topbar}>
          <div>
            <h1 style={S.h1}>
              {view === "pipeline" && (stageFilter === "all"
                ? `${vertical.name} — All leads`
                : `${vertical.name} — ${labelOf(stageFilter, stages)}`)}
              {view === "inbox" && "Emails"}
            </h1>
            <p style={S.sub}>
              {view === "pipeline" && (stageFilter === "all"
                ? "Every lead this vertical is pursuing. Change a stage from its dropdown, edit a lead from its row."
                : "Only the leads sitting in this stage. Move one along from its stage dropdown.")}
              {view === "inbox" && "Every message sent and received, newest first."}
            </p>
          </div>
          <div style={S.tools}>
            {/* Always in reach, whatever the sidebar is doing. */}
            {view === "pipeline" && (
              <button className="btn-fill" style={{ ...S.btnFill, padding: "9px 14px" }}
                onClick={openNewLead}>
                <Plus size={14} /> Add lead
              </button>
            )}
            {view === "pipeline" && (
              <div className="seg" style={S.seg} role="group" aria-label="Pipeline layout">
                <span className="seg-thumb" aria-hidden="true"
                  style={{ ...S.segThumb, transform: `translateX(${layout === "board" ? 100 : 0}%)` }} />
                <button className="seg-btn" onClick={() => { setLayout("list"); clearPicked(); }}
                  aria-pressed={layout === "list"}
                  style={{ ...S.segBtn, ...(layout === "list" ? S.segOn : {}) }}>
                  <List size={14} /> List
                </button>
                <button className="seg-btn" onClick={() => { setLayout("board"); clearPicked(); }}
                  aria-pressed={layout === "board"}
                  style={{ ...S.segBtn, ...(layout === "board" ? S.segOn : {}) }}>
                  <LayoutGrid size={14} /> Board
                </button>
              </div>
            )}
            <div style={S.searchWrap}>
              <Search size={16} style={{ color: "var(--faint)" }} />
              <input placeholder="Search any column" value={query}
                onChange={e => setQuery(e.target.value)} style={S.searchInput} />
            </div>
          </div>
        </header>

        <div style={{ ...S.canvas, ...(isList ? S.canvasList : {}) }}>
          {view === "pipeline" && layout === "board" && (
            <div style={S.board}>
              {stages.map(stage => {
                const items = inFunnel.filter(c => c.stage === stage.id);
                const over = dropOn === stage.id && dragId != null;
                return (
                  <div key={stage.id} className="col"
                    style={{ ...S.col, ...(over ? S.colOver : {}) }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move";
                      if (dropOn !== stage.id) setDropOn(stage.id); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOn(null); }}
                    onDrop={e => { e.preventDefault(); dropOnStage(stage.id); }}>
                    <div style={S.colHead}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...S.stageDot, background: stage.accent }} />
                        <span style={S.colTitle}>{stage.label}</span>
                        <span style={S.colCount}>{items.length}</span>
                      </div>
                      <div style={S.colSub}>{stage.sub}</div>
                    </div>
                    <div style={S.colBody}>
                      {items.length === 0 && (
                        <div style={S.colEmpty}>{dragging ? "Drop here" : "No companies here"}</div>
                      )}
                      {items.map(c => (
                        <Card key={c.id} c={c} onClick={() => openCompany(c)}
                          onAdvance={() => compose([c], true)}
                          held={dragId === c.id}
                          onDragStart={e => { setDragId(c.id); e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", String(c.id)); }}
                          onDragEnd={() => { setDragId(null); setDropOn(null); }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "pipeline" && layout === "list" && (
            <>
              {/* ---- bulk send bar (send mode) ----
                  Every unsent address, in sequence, with a breather between
                  messages. The gap is the difference between outreach and a
                  burst Gmail throttles. */}
              {sendMode && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  background: "var(--surface)", border: "1px solid var(--line)",
                  borderRadius: 12, padding: "10px 14px", margin: "0 0 12px" }}>
                  <Send size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ ...S.cellStrong, whiteSpace: "nowrap" }}>
                    {unsentQueue.length === 0 ? "Everything sent" : `${unsentQueue.length} unsent`}
                  </span>
                  {unsentQueue.length > 0 && Object.keys(kindBreakdown).length > 1 && (
                    <span style={{ ...S.cellSub, whiteSpace: "nowrap" }}>
                      {Object.entries(kindBreakdown).map(([l, n]) => `${n} ${l}`).join(" · ")}
                    </span>
                  )}
                  {unsentQueue.length > 1 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6,
                      fontSize: 12.5, color: "var(--mute)", whiteSpace: "nowrap" }}>
                      send
                      <input type="number" min={1} max={unsentQueue.length} value={rangeFrom}
                        disabled={!!bulk} placeholder="1"
                        style={{ ...S.input, width: 64, padding: "6px 8px" }}
                        aria-label="First unsent number to send"
                        onChange={e => setRangeFrom(e.target.value)} />
                      to
                      <input type="number" min={1} max={unsentQueue.length} value={rangeTo}
                        disabled={!!bulk} placeholder={String(unsentQueue.length)}
                        style={{ ...S.input, width: 64, padding: "6px 8px" }}
                        aria-label="Last unsent number to send"
                        onChange={e => setRangeTo(e.target.value)} />
                    </label>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: 6,
                    fontSize: 12.5, color: "var(--mute)", whiteSpace: "nowrap" }}>
                    time gap
                    <input type="number" min={3} max={600} value={gapSec}
                      disabled={!!bulk}
                      style={{ ...S.input, width: 64, padding: "6px 8px" }}
                      aria-label="Seconds between messages"
                      onChange={e => setGapSec(Math.min(600, Math.max(3, Number(e.target.value) || 30)))} />
                    s between emails
                  </label>
                  {!bulk ? (
                    <button className="btn-fill" style={{ ...S.btnFill, padding: "8px 14px" }}
                      disabled={!credsReady || !scriptReady || rangeSlice.length === 0}
                      title={!credsReady
                        ? "Add the app password in Vertical settings → Sending account"
                        : !scriptReady ? "Save a script in Vertical settings → Email script first" : ""}
                      onClick={() => runBulk(rangeSlice)}>
                      <Send size={13} />
                      {rangeSlice.length === unsentQueue.length
                        ? `Send all ${unsentQueue.length}`
                        : `Send #${rFrom}–#${rTo} (${rangeSlice.length})`}
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 700 }}>
                        sending {bulk.done} of {bulk.total}…
                      </span>
                      <button className="btn-ghost" style={{ ...S.btnGhost, padding: "8px 12px" }}
                        onClick={() => { stopRef.current = true; }}>
                        <Square size={12} /> Stop
                      </button>
                    </>
                  )}
                  {(!credsReady || !scriptReady) && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5,
                      fontSize: 12.5, color: "var(--warn)" }}>
                      <AlertTriangle size={13} />
                      {!credsReady
                        ? "Send activates once the Gmail app password is saved in Vertical settings."
                        : "Save a script in Vertical settings → Email script."}
                    </span>
                  )}
                </div>
              )}

              <ListMeta rows={pipeRows} total={inFunnel.length} />
              <DataTable cols={pipelineCols} rows={pipeRows} minWidth={pipeMinWidth}
                numbered widthKey={`crm.colw.v${vertical.id}`}
                picked={picked} onPick={togglePick} onPickAll={() => pickAll(pipeRows)}
                sort={sort} onSort={toggleSort} onOpen={openCompany}
                empty="Nobody in this stage. Add a company or import a sheet." />
            </>
          )}

          {view === "inbox" && (
            <>
              <MailBar state={mail} onSync={() => syncMail()} onTest={testMail} />
              {/* A list, not a wall: one row per thread — who, whether a reply
                  came back, what's unread — and the complete conversation one
                  click away, expanded in place. */}
              {inboxThreads.length === 0
                ? <Empty label="No emails yet. Send your first follow-up from the funnel." />
                : (
                  <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingBottom: 12 }}>
                    {inboxThreads.map(c => {
                      const fresh = unreadOf(c);
                      const open = expandedThread === c.id;
                      const last = lastMsg(c);
                      return (
                        <div key={c.id} style={{ background: "var(--surface)",
                          border: `1px solid ${fresh ? "var(--accent)" : "var(--line)"}`,
                          borderRadius: 12, marginBottom: 10, boxShadow: "var(--shadow-1)",
                          overflow: "hidden" }}>
                          {/* the row */}
                          <div role="button" tabIndex={0}
                            style={{ display: "flex", alignItems: "center", gap: 10,
                              padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}
                            onClick={() => {
                              setExpandedThread(open ? null : c.id);
                              if (!open && fresh) markThreadRead(c);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") setExpandedThread(open ? null : c.id); }}>
                            <ChevronRight size={15} style={{ color: "var(--faint)", flexShrink: 0,
                              transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                            <span style={{ ...S.cellName, fontWeight: fresh ? 800 : 700,
                              flex: "0 1 auto", minWidth: 120 }}>{c.name}</span>
                            <DirCell c={c} />
                            {fresh > 0 && (
                              <span style={{ ...S.duePill, background: "var(--accent)",
                                color: "var(--on-accent, #fff)", fontWeight: 800 }}>
                                {fresh} unread
                              </span>
                            )}
                            <span style={{ ...S.cellSub, flex: "1 1 200px", minWidth: 0,
                              fontWeight: fresh ? 700 : 400, color: fresh ? "var(--ink)" : "var(--faint)" }}>
                              {last ? `${last.dir === "in" ? "↩ " : ""}${last.subject || "(no subject)"}` : ""}
                            </span>
                            <span style={{ ...S.cellSub, flexShrink: 0 }}>
                              {(c.emails || []).length} msg{(c.emails || []).length === 1 ? "" : "s"}
                              {last ? ` · ${fmtDate(last.at)}` : ""}
                            </span>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}
                              onClick={e => e.stopPropagation()}>
                              {fresh > 0 && (
                                <button className="row-btn-go" style={S.rowBtnGo}
                                  title="Clear the unread flag without opening"
                                  onClick={() => markThreadRead(c)}>
                                  <Check size={11} /> Mark read
                                </button>
                              )}
                              <button className="row-btn" style={S.rowBtn}
                                onClick={() => setComposer({ mode: "send", targets: [c], advance: false })}>
                                <Send size={11} /> Email
                              </button>
                              <button className="row-btn" style={S.rowBtn}
                                onClick={() => setComposer({ mode: "log", targets: [c] })}>
                                <Reply size={11} /> Log reply
                              </button>
                            </div>
                          </div>
                          {/* the conversation, complete, when opened */}
                          {open && (
                            <div style={{ padding: "0 16px 14px",
                              borderTop: "1px solid var(--line)" }}>
                              <div style={{ height: 12 }} />
                              <EmailThread c={c} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
            </>
          )}

        </div>
      </main>

      {/* ---- Detail drawer ---- */}
      {selected && <Drawer c={companies.find(x => x.id === selected.id) || selected}
        columns={columns} stages={stages}
        onClose={() => setSelected(null)} onEdit={openEdit}
        onStage={setStageTo} onRemove={removeCompany}
        onCompose={(c, adv = true) => compose([c], adv)}
        onLogReply={(c) => setComposer({ mode: "log", targets: [c] })} />}

      {/* ---- Add / edit form: generated from the vertical's columns ---- */}
      {showForm && <AddForm vertical={vertical} row={row} setRow={setRow}
        firstStageLabel={stages[0]?.label}
        editing={!!editing} editingName={editing?.name}
        onSave={editing ? saveEdit : saveNew} onClose={closeForm} />}

      {importOpen && <ImportModal vertical={vertical} existing={companies}
        progress={importProg}
        onCancel={() => { if (!importProg) setImportOpen(false); }}
        onImport={commitImport} />}

      {orgSettings && <OrgForm org={org}
        onSave={saveOrg} onDelete={deleteOrganization}
        onCancel={() => setOrgSettings(false)} />}

      {verticalSettings && <VerticalSetup vertical={vertical} firstRun={false}
        stages={stages}
        onSave={saveVertical}
        onSaveStages={saveWizardStages}
        onTest={testVerticalSmtp}
          onVerify={verifyVerticalSmtp}
        onDelete={deleteVertical}
        onClose={() => setVerticalSettings(false)} />}

      {composer && <Composer job={composer} vertical={vertical} org={org} stages={stages}
        onSend={sendEmails} onLog={logReply} onCancel={() => setComposer(null)} />}

      {/* One cell's complete email, with the send inside it. The company is
          re-read from state so a preview left open over a background refresh
          still shows current data. */}
      {sendPreview && (() => {
        const live = companies.find(x => x.id === sendPreview.c.id) || sendPreview.c;
        return <SendPreview
          c={live}
          r={sendPreview.r}
          vertical={vertical} org={org} script={scriptFor(live)} credsReady={credsReady}
          onSend={sendCell}
          onCancel={() => setSendPreview(null)} />;
      })()}

      {showBulk && <BulkBar n={picked.length} actions={bulkActions} onClear={clearPicked} />}

      {/* Rendered last so it stacks over whatever opened it — including the
          settings dialog a vertical delete starts from. */}
      {confirmDel && <ConfirmDelete
        title={confirmDel.title}
        message={confirmDel.message}
        requireText={confirmDel.requireText}
        confirmLabel="Delete"
        seconds={5}
        onConfirm={confirmDel.run}
        onCancel={() => setConfirmDel(null)} />}

      {toast && <div className="toast" style={{ ...S.toast, bottom: showBulk ? 96 : 26 }}>
        <CheckCircle2 size={16} />{toast}</div>}
    </div>
    </StageCtx.Provider>
  );
}
