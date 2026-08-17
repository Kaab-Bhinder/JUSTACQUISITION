import { useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowUp, ArrowDown, AtSign, Check, ChevronRight,
  Columns3, KeyRound, Link2, ListOrdered, Mail as MailIcon, Plus, ScrollText,
  Send, Trash2, X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { S } from "../theme.js";
import {
  COLUMN_TYPES, starterColumns, validateColumns, mergeTags, keyify,
} from "../domain/columns.js";
import { parseSheet } from "../domain/importSheet.js";
import { Field } from "./ui.jsx";
import { RichText } from "./RichText.jsx";

/* ----------------------------------------------------------------------
   Vertical setup

   Creating a vertical asks two questions and the board opens:

     1 · Format    the columns of this vertical's Excel sheet, named exactly
                   as the sheet spells them. Any number of them can be marked
                   @ email — one per address column the sheet carries — and
                   each email column is LINKED to the column holding that
                   person's name. Generating mail sends one message per
                   address and greets each by its linked first name. One
                   column is marked `name`: what each row is called.

     2 · Pipeline  this vertical's own funnel stages, prefilled with the four
                   defaults and editable here or any time later.

   Everything else is settings, changeable whenever:

     Script    the outreach email — subject and body with {first_name}-style
               tags, filled per message at send time.
     Sending   the Gmail account outreach goes from: address + the
               16-character app password, tested right here.
---------------------------------------------------------------------- */

const TABS = [
  { id: "columns", label: "Sheet columns", icon: Columns3 },
  { id: "pipeline", label: "Pipeline", icon: ListOrdered },
  { id: "script",  label: "Email script",  icon: ScrollText },
  { id: "sending", label: "Sending account", icon: KeyRound },
];

const ROLE_TINT = {
  email: { background: "var(--accent-soft)", borderLeft: "3px solid var(--accent)" },
  name:  { background: "var(--good-soft)",   borderLeft: "3px solid var(--good)" },
};

/* Which column most likely holds the person's name for a just-marked email
   column. "Email 2" reaches for a POC/contact/name column ending in the same
   digit; an undigited "Email" takes the nearest earlier person-ish column.
   Only a guess — the picker on the row is the decision. */
const PERSONISH = /poc|contact|name|person|owner|attn|rep\b/i;

/* ---- reading the format straight off a sheet --------------------------
   The handiest way to declare the format is to hand over the sheet itself:
   every header becomes a column, types are guessed from the header words,
   and the email/name marks are pre-guessed the same way marking by hand
   would have. The editor below is then a review, not a chore. */
const typeFor = (h) =>
  /e-?mail/i.test(h) ? "email"
  : /linkedin|website|url|\bsite\b|homepage|\blink\b/i.test(h) ? "url"
  : /phone|mobile|\btel\b|contact number/i.test(h) ? "phone"
  : /\bdate\b/i.test(h) ? "date"
  : /note|comment|remark/i.test(h) ? "longtext"
  : "text";

export function columnsFromHeaders(headers) {
  const cols = [];
  const seen = new Set();
  let nameDone = false, webDone = false, notesDone = false;

  for (const h of headers) {
    const label = String(h).trim();
    if (!label) continue;
    let key = keyify(label);
    if (!key) continue;
    let n = 2;
    while (seen.has(key)) key = `${keyify(label)}_${n++}`;
    seen.add(key);

    const type = typeFor(label);
    let role = null;
    if (type === "email") role = "email";
    else if (!nameDone && /company|business|firm|organi[sz]ation|account|brand/i.test(label)) {
      role = "name"; nameDone = true;
    } else if (!webDone && type === "url" && !/linkedin/i.test(label)) {
      role = "website"; webDone = true;
    } else if (!notesDone && type === "longtext") {
      role = "notes"; notesDone = true;
    }

    cols.push({ key, label, type, role });
  }

  /* No company-ish header? The first non-email column is the name until the
     person says otherwise — a read sheet must never land on the "mark a
     name" error out of the box. */
  if (!nameDone) {
    const first = cols.find(c => c.role !== "email");
    if (first) first.role = "name";
  }

  /* Link each email column to its person, the same guess a hand-mark gets. */
  cols.forEach((c, i) => {
    if (c.role === "email") {
      const link = guessLink(cols, i);
      if (link) c.linkTo = link;
    }
  });
  return cols;
}

function guessLink(cols, i) {
  const digit = /(\d+)\s*$/.exec(cols[i].label.trim())?.[1];
  const usable = (c, j) => j !== i && c.role !== "email" && c.role !== "name" && c.label.trim();
  if (digit) {
    const hit = cols.findIndex((c, j) => usable(c, j) &&
      new RegExp(`(^|\\D)${digit}\\s*$`).test(c.label.trim()) && PERSONISH.test(c.label));
    if (hit >= 0) return cols[hit].key || keyify(cols[hit].label);
  }
  for (let j = i - 1; j >= 0; j--) {
    if (usable(cols[j], j) && PERSONISH.test(cols[j].label))
      return cols[j].key || keyify(cols[j].label);
  }
  return "";
}

export function VerticalSetup({
  vertical, firstRun, stages, onSave, onSaveStages, onTest, onVerify, onClose, onDelete,
}) {
  const [tab, setTab] = useState("columns");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /* Saving must say so. A settings dialog that stays silent on success reads
     as a save that didn't happen. */
  const [savedNote, setSavedNote] = useState("");
  const noteSaved = () => {
    setSavedNote("Saved");
    setTimeout(() => setSavedNote(""), 2400);
  };

  /* ---- columns ---- */
  const [cols, setCols] = useState(() =>
    vertical.columns?.length ? vertical.columns.map(c => ({ ...c })) : starterColumns());
  const [readNote, setReadNote] = useState("");
  const sheetRef = useRef(null);

  /* Read the format straight off the sheet: headers in, columns out, marks
     pre-guessed — the person reviews instead of typing. */
  const readSheet = async (file) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const p = wb.SheetNames.length ? parseSheet(wb, wb.SheetNames[0]) : null;
      if (!p?.head?.length) { setErr("That file has no header row to read."); return; }
      const next = columnsFromHeaders(p.head);
      if (!next.length) { setErr("No usable column names in that header row."); return; }
      const hadReal = cols.some(c => c.label.trim()) &&
        JSON.stringify(cols) !== JSON.stringify(starterColumns());
      if (hadReal && !window.confirm(
        `Replace the ${cols.length} columns here with the ${next.length} read from "${file.name}"?`)) return;
      setCols(next);
      setErr("");
      setReadNote(`${next.length} columns read from ${file.name} — check the @ email and name marks below, then save.`);
    } catch {
      setErr("That file wouldn't open. Save it as .xlsx, .xls or .csv and try again.");
    }
  };

  /* ---- pipeline ---- */
  const [pipe, setPipe] = useState(() => (stages || []).map(s => ({ ...s })));
  const [repliedStage, setRepliedStage] = useState(vertical.repliedStage || "");

  /* ---- script ---- */
  const [subject, setSubject] = useState(vertical.subject || "");
  const [body, setBody] = useState(vertical.body || "");
  const editorApi = useRef(null);

  /* ---- sending ---- */
  const [smtpUser, setSmtpUser] = useState(vertical.smtpUser || "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState(vertical.smtpFrom || "");
  const [smtpSendAs, setSmtpSendAs] = useState(vertical.smtpSendAs || "");
  const [smtpHost, setSmtpHost] = useState(vertical.smtpHost || "");
  const [smtpPort, setSmtpPort] = useState(vertical.smtpPort || "");
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState(null);   // {ok, text}
  /* The From section appears once the credentials have proven themselves —
     either verified this minute, or saved and working from before. */
  const [verified, setVerified] = useState(!!vertical.smtpConfigured);

  const setCol = (i, patch) => setCols(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeCol = (i) => setCols(cs => cs.filter((_, j) => j !== i));
  const moveCol = (i, d) => setCols(cs => {
    const j = i + d;
    if (j < 0 || j >= cs.length) return cs;
    const next = [...cs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addCol = () => setCols(cs => [...cs, { key: "", label: "", type: "text", role: null }]);

  /* @ email toggles per row — a sheet has as many address columns as it has,
     and marking one links it to its best-guess name column on the spot. The
     name badge stays singular: marking a row steals it from whoever had it. */
  const markEmail = (i) => setCols(cs => cs.map((c, j) => {
    if (j !== i) return c;
    if (c.role === "email") {
      /* Unmarking undoes the whole mark, including the type the mark set —
         "Company Name" must not stay typed as an email address. */
      const rest = { ...c, role: null, ...(c.type === "email" ? { type: "text" } : {}) };
      delete rest.linkTo;
      return rest;
    }
    return { ...c, role: "email", type: "email", linkTo: guessLink(cs, i) || undefined };
  }));
  const markName = (i) => setCols(cs => cs.map((c, j) => ({
    ...c,
    role: j === i
      ? (c.role === "name" ? null : "name")
      : (c.role === "name" ? null : c.role),
  })));

  /* ---- saves (each panel saves itself) ---- */
  const saveColumns = async () => {
    const out = validateColumns(cols);
    if (out.error) { setErr(out.error); return false; }
    setErr("");
    setBusy(true);
    try {
      await onSave({ columns: out.columns });
      setCols(out.columns.map(c => ({ ...c })));
      noteSaved();
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  };

  const savePipeline = async (finish) => {
    if (!pipe.length) { setErr("A pipeline needs at least one stage."); return false; }
    if (pipe.some(s => !String(s.label || "").trim())) { setErr("Every stage needs a name."); return false; }
    setErr("");
    setBusy(true);
    try {
      await onSaveStages(pipe);
      /* The reply-landing mark rides with the pipeline it points into; a
         mark whose stage was just deleted is dropped rather than kept
         dangling. */
      const rs = pipe.some(x => x.id === repliedStage) ? repliedStage : "";
      await onSave({ repliedStage: rs, ...(finish ? { setupDone: true } : {}) });
      if (rs !== repliedStage) setRepliedStage(rs);
      noteSaved();
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  };

  const saveScript = async () => {
    setErr("");
    setBusy(true);
    try { await onSave({ subject, body }); noteSaved(); return true; }
    catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  };

  const saveSending = async (fields) => {
    setErr("");
    setBusy(true);
    try {
      await onSave(fields);
      if (fields.smtpPassword) setSmtpPassword("");
      noteSaved();
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  };

  /* Step one: prove the AUTHENTICATION account — the Gmail address and its
     app password. Saves, then logs in without sending anything. The From
     section only appears past this gate. */
  const verifyAuth = async () => {
    setTestState(null);
    if (!(await saveSending({
      smtpUser,
      smtpHost: smtpHost.trim(),
      smtpPort: Number(smtpPort) || 0,
      ...(smtpPassword ? { smtpPassword } : {}),
    }))) return;
    setBusy(true);
    try {
      const r = await onVerify();
      if (r.ok) {
        setVerified(true);
        setTestState({ ok: true, text: "✓ Gmail authentication verified — set the From address below." });
      } else {
        setVerified(false);
        setTestState({ ok: false, text: r.error });
      }
    } catch (e) {
      setVerified(false);
      setTestState({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };

  /* Step two: the identity recipients see. Saves the Send-As address and the
     From name, then delivers a real test — from that address — to the
     account's own inbox: "Gmail accepted the alias" is only proven by a
     message that arrives wearing it. */
  const saveFromAndTest = async () => {
    setTestState(null);
    const customHost = !!smtpHost.trim() && !/gmail\.com$/i.test(smtpHost);
    const sendAs = customHost ? "" : smtpSendAs.trim().toLowerCase();
    if (sendAs && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sendAs)) {
      setErr("That From address doesn't look like an email address.");
      return;
    }
    const dest = testTo.trim().toLowerCase() || smtpUser;
    if (dest && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dest)) {
      setErr("That test address doesn't look like an email address.");
      return;
    }
    if (!(await saveSending({ smtpFrom, smtpSendAs: sendAs }))) return;
    setBusy(true);
    try {
      const r = await onTest(dest);
      setTestState(r.ok
        ? { ok: true, text: `Test email sent from ${r.from || smtpUser} to ${r.to}. Open that inbox and check the From line.` }
        : { ok: false, text: r.error });
    } catch (e) {
      setTestState({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (firstRun) {
      if (tab === "columns") { if (await saveColumns()) setTab("pipeline"); return; }
      if (await savePipeline(true)) onClose();
      return;
    }
    if (tab === "columns") await saveColumns();
    else if (tab === "pipeline") await savePipeline(false);
    else if (tab === "script") await saveScript();
    else await saveSending();
  };


  const tags = mergeTags(validateColumns(cols).columns || cols.filter(c => c.label));
  const insertTag = (tag) => {
    const token = `{{${tag}}}`;
    if (editorApi.current) editorApi.current.insertText(token);
    else setBody(b => b + token);
  };

  const emailCols = cols.filter(c => c.role === "email");
  const nameMarked = cols.some(c => c.role === "name");
  const unlinked = emailCols.filter(c => !c.linkTo);

  /* Pipeline row helpers. New ids derive from the label; the id is what
     companies.stage stores, so existing ones are pinned. */
  const setStage = (i, patch) => setPipe(ps => ps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeStage = (i) => setPipe(ps => ps.filter((_, j) => j !== i));
  const moveStage = (i, d) => setPipe(ps => {
    const j = i + d;
    if (j < 0 || j >= ps.length) return ps;
    const next = [...ps];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addStage = () => setPipe(ps => {
    let id = `stage-${ps.length + 1}`, n = ps.length + 1;
    while (ps.some(s => s.id === id)) id = `stage-${++n}`;
    /* `wait` is vestigial — the due-date machinery is gone — but the API
       column still wants a number. */
    return [...ps, { id, label: "", sub: "", accent: "#7E9895", wait: 7 }];
  });

  const visibleTabs = firstRun ? TABS.slice(0, 2) : TABS;
  const stepIx = tab === "columns" ? 0 : 1;

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={firstRun ? undefined : onClose} />
      <div className="modal" style={{ ...S.modal, ...S.modalWide }} role="dialog" aria-modal="true"
        aria-label={firstRun ? `${vertical.name} — setup` : `${vertical.name} settings`}>
        <div style={S.modalHead}>
          {!firstRun && (
            <button style={S.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
          )}
          <div style={S.modalStep}>
            {firstRun ? `New vertical — ${vertical.name} · step ${stepIx + 1} of 2`
              : `${vertical.name} settings`}
          </div>
          <h2 style={S.modalTitle}>
            {tab === "columns" && "What's the format of this vertical's Excel sheet?"}
            {tab === "pipeline" && "This vertical's pipeline"}
            {tab === "script" && "The outreach script"}
            {tab === "sending" && "Which account does the outreach go from?"}
          </h2>
          <p style={S.modalSub}>
            {tab === "columns" &&
              <>Name the columns exactly as your sheet has them. Tap{" "}
              <strong>@ email</strong> on every column that holds an address —
              however many the sheet carries — and link each to the column with
              that person&apos;s name: {"{first_name}"} greets each address by its
              linked name. Mark <strong>name</strong> on the column each row is
              called by.</>}
            {tab === "pipeline" &&
              "The funnel stages this vertical works through. Every vertical keeps its own — rename, reorder, add or remove them here whenever."}
            {tab === "script" &&
              "Written once, personalised per message when it goes out. Any column is a tag — {first_name}, {company}, or whatever you named yours."}
            {tab === "sending" &&
              "A Gmail address and its 16-digit app password (Google Account → Security → 2-Step Verification → App passwords) — not the normal account password. Stored encrypted, never shown again."}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {visibleTabs.map((t, i) => {
              const locked = firstRun && i > stepIx;
              return (
                <button key={t.id} className="chip" disabled={locked}
                  aria-pressed={tab === t.id}
                  onClick={() => { if (!locked) { setTab(t.id); setErr(""); } }}
                  style={{ ...S.chip, ...(tab === t.id ? S.chipOn : {}),
                    opacity: locked ? 0.45 : 1, fontSize: 12.5 }}>
                  <t.icon size={12} style={{ verticalAlign: -1.5, marginRight: 5 }} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={S.modalBody}>
          {err && <div style={S.errBox}><AlertTriangle size={15} /><span>{err}</span></div>}

          {/* ---- columns ---- */}
          {tab === "columns" && (
            <>
              {/* The shortcut: hand over the sheet, read the format from it. */}
              <button type="button" className="drop"
                style={{ ...S.drop, padding: "14px 16px", marginBottom: 14, width: "100%" }}
                onClick={() => sheetRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); readSheet(e.dataTransfer.files?.[0]); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                  <Columns3 size={18} style={{ color: "var(--accent)" }} />
                  <span style={S.dropTitle}>
                    Or drop the Excel sheet here — its header row becomes these columns
                  </span>
                </div>
                <div style={S.dropSub}>.xlsx, .xls or .csv · types and marks are guessed, you just review</div>
              </button>
              <input ref={sheetRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={e => { readSheet(e.target.files?.[0]); e.target.value = ""; }} />
              {readNote && (
                <div style={{ ...S.infoBox, marginBottom: 12 }}>
                  <Check size={14} /><span>{readNote}</span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cols.map((c, i) => (
                  <div key={i} style={{ padding: "6px 8px", borderRadius: 10,
                    borderLeft: "3px solid transparent", ...(ROLE_TINT[c.role] || {}) }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button type="button" style={{ ...S.mapChipX, width: 22, height: 18 }}
                          aria-label="Move up" disabled={i === 0} onClick={() => moveCol(i, -1)}>
                          <ArrowUp size={11} />
                        </button>
                        <button type="button" style={{ ...S.mapChipX, width: 22, height: 18 }}
                          aria-label="Move down" disabled={i === cols.length - 1} onClick={() => moveCol(i, 1)}>
                          <ArrowDown size={11} />
                        </button>
                      </div>
                      <input style={{ ...S.input, flex: "1.6 1 0" }} value={c.label}
                        placeholder={`Column ${i + 1} name — as the sheet spells it`}
                        onChange={e => setCol(i, { label: e.target.value,
                          /* The key follows the label until the column has been
                             saved once; after that it is pinned so renaming a
                             label never orphans stored data. */
                          key: c.key && vertical.columns?.some(x => x.key === c.key)
                            ? c.key : keyify(e.target.value) })} />
                      <select style={{ ...S.input, flex: "0.9 1 0" }} value={c.type}
                        aria-label="Column type"
                        onChange={e => setCol(i, { type: e.target.value })}>
                        {COLUMN_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>

                      <button type="button" className="chip"
                        title="This column holds an email address outreach goes to"
                        aria-pressed={c.role === "email"}
                        onClick={() => markEmail(i)}
                        style={{ ...S.chip, ...(c.role === "email" ? S.chipOn : {}),
                          fontSize: 11.5, padding: "7px 10px", flexShrink: 0 }}>
                        <AtSign size={11} style={{ verticalAlign: -1.5, marginRight: 3 }} />
                        email
                      </button>
                      <button type="button" className="chip"
                        title="Rows are titled by this column"
                        aria-pressed={c.role === "name"}
                        onClick={() => markName(i)}
                        style={{ ...S.chip, ...(c.role === "name" ? S.chipOn : {}),
                          fontSize: 11.5, padding: "7px 10px", flexShrink: 0 }}>
                        name
                      </button>
                      <select style={{ ...S.input, flex: "0.8 1 0", fontSize: 12 }}
                        value={c.role === "email" || c.role === "name" ? "" : (c.role || "")}
                        disabled={c.role === "email" || c.role === "name"}
                        aria-label="Extra meaning"
                        onChange={e => setCol(i, { role: e.target.value || null })}>
                        <option value="">— just data —</option>
                        <option value="website">Website</option>
                        <option value="notes">Notes</option>
                      </select>
                      <button type="button" className="row-btn" style={{ ...S.rowBtn, padding: "8px 9px" }}
                        aria-label={`Remove ${c.label || `column ${i + 1}`}`}
                        onClick={() => removeCol(i)}>
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* The link: which column names the person behind this
                        address. Guessed on marking, decided here. */}
                    {c.role === "email" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8,
                        margin: "8px 0 2px 30px", fontSize: 12.5, color: "var(--mute)" }}>
                        <Link2 size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
                        <span>greets the person named in</span>
                        <select style={{ ...S.input, width: "auto", minWidth: 150,
                          padding: "6px 10px", fontSize: 12.5 }}
                          value={c.linkTo || ""}
                          aria-label={`Which column names the person behind ${c.label || "this address"}`}
                          onChange={e => setCol(i, { linkTo: e.target.value || undefined })}>
                          <option value="">nobody — greet as &quot;there&quot;</option>
                          {cols.filter((o, j) => j !== i && o.role !== "email" && o.label.trim())
                            .map(o => {
                              const k = o.key || keyify(o.label);
                              return <option key={k} value={k}>{o.label}</option>;
                            })}
                        </select>
                        <span style={{ color: "var(--faint)" }}>→ {"{first_name}"}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button style={{ ...S.addContactBtn, marginTop: 12 }} onClick={addCol}>
                <Plus size={14} /> Add a column
              </button>

              {/* What is still missing, said before the save button says it. */}
              <div style={{ ...(emailCols.length && nameMarked ? S.infoBox : S.warnBox), marginTop: 16 }}>
                {emailCols.length && nameMarked ? <Check size={14} /> : <AlertTriangle size={15} />}
                <span>
                  {!emailCols.length
                    ? <>Tap <strong>@ email</strong> on every column that holds an address — one message goes to each.</>
                    : !nameMarked
                      ? <>Tap <strong>name</strong> on the column each row is called by.</>
                      : <>{emailCols.length === 1 ? "1 email column" : `${emailCols.length} email columns`} —
                          one message per address, each greeted by its linked name.
                          {unlinked.length > 0 &&
                            <> <strong>{unlinked.map(c => c.label).join(", ")}</strong>{" "}
                            {unlinked.length === 1 ? "has" : "have"} no linked name yet and will greet as &quot;there&quot;.</>}</>}
                </span>
              </div>
            </>
          )}

          {/* ---- pipeline ---- */}
          {tab === "pipeline" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pipe.map((s, i) => (
                  <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button type="button" style={{ ...S.mapChipX, width: 22, height: 18 }}
                        aria-label="Move up" disabled={i === 0} onClick={() => moveStage(i, -1)}>
                        <ArrowUp size={11} />
                      </button>
                      <button type="button" style={{ ...S.mapChipX, width: 22, height: 18 }}
                        aria-label="Move down" disabled={i === pipe.length - 1} onClick={() => moveStage(i, 1)}>
                        <ArrowDown size={11} />
                      </button>
                    </div>
                    <span style={{ ...S.stageDot, background: s.accent, flexShrink: 0 }} />
                    <input style={{ ...S.input, flex: "1.4 1 0" }} value={s.label}
                      placeholder={`Stage ${i + 1} name`}
                      onChange={e => setStage(i, { label: e.target.value })} />
                    <input style={{ ...S.input, flex: "1.6 1 0" }} value={s.sub}
                      placeholder="Sub-line (optional)"
                      onChange={e => setStage(i, { sub: e.target.value })} />
                    {/* One stage may catch replies. Toggling on steals the
                        mark; a lead only ever moves FORWARD into it. */}
                    <button type="button" className="chip"
                      title="Replying leads move INTO this stage (never backwards out of later ones)"
                      aria-pressed={repliedStage === s.id}
                      onClick={() => setRepliedStage(r => (r === s.id ? "" : s.id))}
                      style={{ ...S.chip, ...(repliedStage === s.id ? S.chipOn : {}),
                        fontSize: 11.5, padding: "7px 10px", flexShrink: 0 }}>
                      <MailIcon size={11} style={{ verticalAlign: -1.5, marginRight: 3 }} />
                      replies land here
                    </button>
                    <button type="button" className="row-btn" style={{ ...S.rowBtn, padding: "8px 9px" }}
                      aria-label={`Remove ${s.label || `stage ${i + 1}`}`}
                      disabled={pipe.length <= 1}
                      onClick={() => removeStage(i)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button style={{ ...S.addContactBtn, marginTop: 12 }} onClick={addStage}>
                <Plus size={14} /> Add a stage
              </button>
              <div style={{ ...S.infoBox, marginTop: 16 }}>
                <Check size={14} />
                <span>Companies enter at <strong>{pipe[0]?.label || "the first stage"}</strong> and
                  move down the list with each send.
                  {repliedStage
                    ? <> A reply moves a lead into <strong>{pipe.find(x => x.id === repliedStage)?.label || repliedStage}</strong> — forward only, never out of a later stage.</>
                    : <> Mark a stage with <strong>replies land here</strong> and replying leads move into it automatically — forward only.</>}</span>
              </div>
            </>
          )}

          {/* ---- script ---- */}
          {tab === "script" && (
            <>
              <Field label="Subject">
                <input style={S.input} value={subject}
                  placeholder="e.g. Exclusive {vertical} leads for {company}"
                  onChange={e => setSubject(e.target.value)} />
              </Field>
              <Field label="Body">
                <RichText value={body} onChange={setBody} editorRef={editorApi}
                  minHeight={240}
                  placeholder="Hi {first_name}, write the pitch for this vertical here — style it, paste your signature image, whatever Gmail would let you do." />
              </Field>
              <div style={S.tagHint}>Insert a field — filled in per message when it sends</div>
              <div style={S.tags}>
                {tags.map(t => (
                  <button key={t} className="tag-chip" style={S.tagChip} onClick={() => insertTag(t)}>
                    {`{${t}}`}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ---- sending ---- */}
          {tab === "sending" && (
            <>
              {/* -- step one: the account that AUTHENTICATES ------------- */}
              <div style={S.sectionTitle}>Authentication</div>
              <Field label="Email address the account signs in with">
                <input style={S.input} value={smtpUser} type="email"
                  placeholder="youraccount@gmail.com, or wahaj@yourdomain.com"
                  onChange={e => setSmtpUser(e.target.value)} />
              </Field>
              <Field label={/gmail\.com$/i.test(smtpHost) || !smtpHost.trim()
                ? "App password (16 characters)" : "Mailbox password"}>
                <input style={S.input} value={smtpPassword} type="password"
                  placeholder={vertical.smtpConfigured
                    ? "••••••••  (saved — type to replace)"
                    : !smtpHost.trim()
                      ? "the 16-character app password — spaces don't matter"
                      : "the mailbox password on that server"}
                  onChange={e => setSmtpPassword(e.target.value)} />
              </Field>

              {/* Which server. Empty = Gmail. A domain mailbox names its own
                  host and the From domain then matches the sender — which is
                  what removes Gmail's "via" tag at the receiving end. */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <Field label="SMTP server (optional)">
                    <input style={S.input} value={smtpHost}
                      placeholder="empty = smtp.gmail.com · e.g. smtp.stackmail.com"
                      onChange={e => setSmtpHost(e.target.value)} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Port">
                    <input style={S.input} value={smtpPort} type="number"
                      placeholder="465"
                      onChange={e => setSmtpPort(e.target.value)} />
                  </Field>
                </div>
              </div>
              <button className="btn-fill" style={{ ...S.btnFill, padding: "10px 16px" }}
                disabled={busy || !smtpUser || (!smtpPassword && !vertical.smtpConfigured)}
                onClick={verifyAuth}>
                <KeyRound size={13} /> {busy ? "Verifying…" : "Verify connection"}
              </button>

              {testState && (
                <div style={{ ...(testState.ok ? S.infoBox : S.errBox), marginTop: 12 }}>
                  {testState.ok ? <Check size={14} /> : <AlertTriangle size={15} />}
                  <span>{testState.text}</span>
                </div>
              )}

              {/* -- step two: the identity recipients SEE ----------------
                  Only past a working login. The Send-As address is a Gmail
                  "Send mail as" alias of the account above — an identity,
                  not an account: it has no password and is never asked for
                  one. Empty sends as the account itself, exactly as before. */}
              {verified && (
                <>
                  <div style={{ ...S.sectionTitle, marginTop: 22 }}>From — what recipients see</div>
                  {/* Send-As is a Gmail-alias concept; on a custom host the
                      account IS the identity, so the field doesn't exist and
                      no mismatched From can even be configured. */}
                  {smtpHost.trim() && !/gmail\.com$/i.test(smtpHost) ? (
                    <div style={{ ...S.infoBox, marginBottom: 14 }}>
                      <Check size={14} />
                      <span>Mail goes out as <strong>{smtpUser || "the account above"}</strong> —
                        on its own mail server, the account is the From address.
                        Only the name below is adjustable.</span>
                    </div>
                  ) : (
                  <Field label="From / Send-As email (optional)">
                    <input style={S.input} value={smtpSendAs} type="email"
                      placeholder={`leave empty to send as ${smtpUser || "the account above"}`}
                      onChange={e => setSmtpSendAs(e.target.value)} />
                    <div style={S.auHint}>
                      Must be a verified alias of the account above — Gmail →
                      Settings → Accounts → “Send mail as”. Gmail rejects
                      anything unverified by sending as the account instead.
                    </div>
                  </Field>
                  )}
                  <Field label="From name">
                    <input style={S.input} value={smtpFrom}
                      placeholder="e.g. Wahaj Shah"
                      onChange={e => setSmtpFrom(e.target.value)} />
                  </Field>
                  <Field label="Send the test to">
                    <input style={S.input} value={testTo} type="email"
                      placeholder={smtpUser || "any inbox you can open"}
                      onChange={e => setTestTo(e.target.value)} />
                    <div style={S.auHint}>
                      Any inbox you can open — checking the From line from a
                      different account is the honest test.
                    </div>
                  </Field>
                  <button className="btn-fill" style={{ ...S.btnFill, padding: "10px 16px" }}
                    disabled={busy}
                    onClick={saveFromAndTest}>
                    <Send size={13} /> {busy ? "Sending…" : `Save & send a test to ${testTo.trim() || smtpUser || "yourself"}`}
                  </button>
                </>
              )}

              <div style={{ ...S.infoBox, marginTop: 16 }}>
                <MailIcon size={14} />
                <span>
                  Generate emails works without this — you can review every
                  personalised message first. Only pressing Send needs the account.
                </span>
              </div>

              {onDelete && (
                <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                  <button className="d-remove" style={S.dRemove} onClick={onDelete}>
                    <Trash2 size={14} /> Delete this vertical…
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={S.modalFoot}>
          {firstRun && tab === "pipeline" && (
            <button className="btn-ghost" style={S.btnGhost} onClick={() => setTab("columns")}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {firstRun && (
            <span style={S.footNote}>
              Script and sending account live in settings — change them any time.
            </span>
          )}
          <div style={{ flex: 1 }} />
          {/* The outcome, right next to the button that caused it: the top
              error box scrolls out of sight on a long column list. */}
          {err && !busy && (
            <span style={{ color: "var(--danger)", fontSize: 12.5, maxWidth: 320 }}>
              <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              {err}
            </span>
          )}
          {savedNote && !err && (
            <span style={{ color: "var(--good)", fontSize: 12.5, fontWeight: 700 }}>
              <Check size={13} style={{ verticalAlign: -2, marginRight: 3 }} />
              {savedNote}
            </span>
          )}
          {!firstRun && (
            <button className="btn-ghost" style={S.btnGhost} onClick={onClose}>Close</button>
          )}
          <button className="btn-fill" style={S.btnFill} disabled={busy} onClick={submit}>
            {firstRun
              ? tab === "columns"
                ? <>Save format &amp; set the pipeline <ChevronRight size={15} /></>
                : <><Check size={15} /> Save &amp; open the board</>
              : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
