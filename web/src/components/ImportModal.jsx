import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, Download, FileSpreadsheet,
  Upload, X, GripVertical,
} from "lucide-react";
import * as XLSX from "xlsx";
import { S } from "../theme.js";
import { useStages, labelOf } from "../domain/stages.js";
import {
  parseSheet, guessNames, resolveNames, buildImport,
  downloadTemplate, rememberMapping, recallMapping, forgetMapping,
} from "../domain/importSheet.js";
import { Field } from "./ui.jsx";

/* ----------------------------------------------------------------------
   Spreadsheet import

   Three steps: which file, which columns, then check. The vertical isn't
   asked — the board being worked IS the vertical, and its declared columns
   are the slots the sheet's headers get mapped onto. When the columns were
   named after the sheet itself (what the setup wizard asks for), the guess
   is simply right and the mapping step is a glance.

   The corrected mapping is remembered against the vertical, so the next
   sheet of the same shape needs no work at all.
---------------------------------------------------------------------- */

const STEPS = ["file", "map", "review"];

export function ImportModal({ vertical, existing, progress, onCancel, onImport }) {
  const stages = useStages();
  const columns = vertical.columns || [];

  const [step, setStep] = useState("file");
  const [book, setBook] = useState(null);
  const [sheet, setSheet] = useState("");
  const [head, setHead] = useState([]);
  const [body, setBody] = useState([]);
  /* What the user says each declared column is called in this sheet, keyed by
     column key. Indices are derived, so the slots are the single source of
     truth and cannot disagree with the mapping. */
  const [names, setNames] = useState({});
  const [recalled, setRecalled] = useState(false);
  const [err, setErr] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dragCol, setDragCol] = useState(null);
  const [overField, setOverField] = useState(null);
  const fileRef = useRef(null);

  const { map, clashes } = useMemo(
    () => resolveNames(names, head, columns), [names, head, columns]);

  const nameKey = columns.find(c => c.role === "name")?.key;

  const load = (wb, name) => {
    const p = parseSheet(wb, name);
    if (!p) { setErr(`"${name}" has no rows in it.`); return false; }
    const memory = recallMapping(vertical.id);
    setHead(p.head);
    setBody(p.body);
    setNames(guessNames(p.head, columns, memory?.names));
    setRecalled(!!memory);
    setErr("");
    return true;
  };

  const onFile = async (file) => {
    if (!file) return;
    setErr("");
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      if (!wb.SheetNames.length) { setErr("That file has no sheets in it."); return; }
      setBook(wb);
      setSheet(wb.SheetNames[0]);
      if (load(wb, wb.SheetNames[0])) setStep("map");
    } catch {
      setErr("That file wouldn't open. Save it as .xlsx, .xls or .csv and try again.");
    }
  };

  const result = useMemo(
    () => (step === "review"
      ? buildImport(body, map, existing, stages, columns) : null),
    [step, body, map, existing, stages, columns]);
  /* New rows plus updates to rows already here — an import never mints a
     duplicate: a match by name or website refreshes the existing lead. */
  const queue = result ? [...result.ready, ...result.updates] : [];
  const matched = columns.filter(c => map[c.key] >= 0).length;

  /* Which sheet columns nobody has claimed — the pool chips are dragged from. */
  const assigned = new Set(Object.values(map).filter(i => i >= 0));
  const spare = head.map((h, i) => ({ h, i })).filter(({ i }) => !assigned.has(i));

  const assign = (key, colIndex) => setNames(n => {
    const next = { ...n };
    if (colIndex >= 0) {
      for (const k of Object.keys(next))
        if (next[k] && next[k] === head[colIndex]) next[k] = "";
      next[key] = head[colIndex];
    } else {
      next[key] = "";
    }
    return next;
  });

  const commit = () => {
    rememberMapping(vertical.id, names);
    onImport(queue);
  };

  const titles = {
    file: "Choose the spreadsheet",
    map: "Match your columns",
    review: "Check before importing",
  };
  const subs = {
    file: `Everything in the file lands on the ${vertical.name} board, in its columns.`,
    map: "Drag a column onto the field it belongs to, or type its name. Sheets in this vertical's declared format map themselves.",
    review: "Nothing is written until you press import.",
  };

  const stepNo = STEPS.indexOf(step) + 1;
  const back = () => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)]);

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onCancel} />
      <div className="modal" style={{ ...S.modal, ...(step === "map" ? S.modalWide : {}) }}
        role="dialog" aria-modal="true" aria-label={titles[step]}>
        <div style={S.modalHead}>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Close"><X size={18} /></button>
          <div style={S.modalStep}>Step {stepNo} of 3</div>
          <h2 style={S.modalTitle}>{titles[step]}</h2>
          <p style={S.modalSub}>{subs[step]}</p>
        </div>

        <div style={S.modalBody}>
          {err && <div style={S.errBox}><AlertTriangle size={15} /><span>{err}</span></div>}

          {/* ---- 1. file ---- */}
          {step === "file" && (
            <>
              <div className="drop" style={{ ...S.drop, ...(dragging ? S.dropOn : {}) }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}>
                <FileSpreadsheet size={32} style={{ color: "var(--accent)" }} />
                <div style={S.dropTitle}>Drop a spreadsheet here, or click to choose one</div>
                <div style={S.dropSub}>.xlsx, .xls or .csv — a header row on top, one row per company</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={e => onFile(e.target.files?.[0])} />
              </div>
              {recallMapping(vertical.id) && (
                <div style={{ ...S.infoBox, marginTop: 16 }}>
                  <Check size={14} />
                  <span style={{ flex: 1 }}>
                    The last {vertical.name} sheet&apos;s column layout will be filled in for you.
                  </span>
                  <button type="button" style={S.vtAll}
                    onClick={() => { forgetMapping(vertical.id); setRecalled(false); }}>
                    Forget it
                  </button>
                </div>
              )}
              <button className="link-btn" style={S.linkBtn} onClick={() => downloadTemplate(vertical)}>
                <Download size={14} /> Download this vertical&apos;s template sheet
              </button>
            </>
          )}

          {/* ---- 2. columns ---- */}
          {step === "map" && (
            <>
              {book && book.SheetNames.length > 1 && (
                <Field label="Sheet">
                  <select style={S.input} value={sheet}
                    onChange={e => { setSheet(e.target.value); load(book, e.target.value); }}>
                    {book.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              )}

              <div style={S.infoBox}>
                <Check size={14} />
                <span>
                  {body.length} rows, {head.length} columns. Matched {matched} of {columns.length} fields.
                  {recalled && " Filled in from the last sheet of this vertical."}
                </span>
              </div>

              <div style={S.mapBoard}>
                {/* the pool */}
                <div style={S.mapPool}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData("text/field");
                    if (from) assign(from, -1);
                    setDragCol(null);
                  }}>
                  <div style={S.mapPoolHead}>
                    Columns in your sheet
                    <span style={S.mapPoolCount}>{spare.length} unused</span>
                  </div>
                  <div style={S.mapChips}>
                    {spare.length === 0 && (
                      <div style={S.mapPoolEmpty}>Every column is mapped.</div>
                    )}
                    {spare.map(({ h, i }) => (
                      <div key={i} className="map-chip" draggable style={S.mapChip}
                        title={h}
                        onDragStart={e => {
                          setDragCol(i);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/column", String(i));
                        }}
                        onDragEnd={() => { setDragCol(null); setOverField(null); }}>
                        <GripVertical size={11} style={{ color: "var(--faint)", flexShrink: 0 }} />
                        <span style={S.mapChipText}>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* the slots: the vertical's own columns. Deliberately no
                    stage slot — every imported lead starts at the first
                    stage, and the board's Update-stage dropdown moves it. */}
                <div style={S.mapFields}>
                  <div style={S.mapGroup}>
                    <div style={S.mapGroupHead}>
                      <span style={S.mapGroupTitle}>{vertical.name} columns</span>
                    </div>
                    {columns.map(c => (
                      <Slot key={c.key}
                        field={{ key: c.key, label: c.label, required: c.role === "name" }}
                        typed={names[c.key] || ""} index={map[c.key]}
                        head={head} body={body} dragCol={dragCol}
                        overField={overField} setOverField={setOverField}
                        onType={v => setNames(n => ({ ...n, [c.key]: v }))}
                        onDropCol={i => assign(c.key, i)}
                        onDropField={(from) =>
                          setNames(n => ({ ...n, [from]: "", [c.key]: n[from] }))}
                        onClear={() => assign(c.key, -1)} />
                    ))}
                  </div>
                </div>
              </div>

              {clashes.length > 0 && (
                <div style={S.warnBox}>
                  <AlertTriangle size={15} />
                  <span>
                    {clashes.map(c => `"${c.column}" is being read as both ${c.fields.join(" and ")}`).join("; ")}.
                  </span>
                </div>
              )}

              {nameKey && map[nameKey] < 0 && (
                <div style={S.errBox}>
                  <AlertTriangle size={15} />
                  <span>Give the <strong>{columns.find(c => c.key === nameKey)?.label}</strong> column
                    a match to continue — it&apos;s what each row is called.</span>
                </div>
              )}
            </>
          )}

          {/* ---- 3. review ---- */}
          {step === "review" && result && (
            <>
              <div style={S.stats}>
                <Stat n={result.ready.length} label="new leads" tone="good" />
                <Stat n={result.updates.length} label="already here — will be updated" tone="warn" />
                <Stat n={result.skipped.length} label="skipped, no name" tone="mute" />
              </div>

              <div style={S.infoBox}>
                <Check size={14} />
                <span>No duplicates, ever: a row matching an existing lead (by name or
                  website) <strong>updates</strong> it — fills and refreshes its columns,
                  keeps its stage and its email thread. New leads start at{" "}
                  <strong>{labelOf(stages[0]?.id, stages)}</strong>.</span>
              </div>

              {queue.length > 0 && (
                <>
                  <div style={S.sectionTitle}>First few rows</div>
                  <div style={S.previewWrap}>
                    <table style={S.preview}>
                      <thead><tr>
                        {columns.slice(0, 3).map(c => <th key={c.key} style={S.pTh}>{c.label}</th>)}

                      </tr></thead>
                      <tbody>
                        {queue.slice(0, 6).map((r, i) => (
                          <tr key={i}>
                            {columns.slice(0, 3).map(c =>
                              <td key={c.key} style={S.pTd}>{r.data[c.key] || "—"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {queue.length > 6 && <div style={S.previewMore}>and {queue.length - 6} more</div>}
                </>
              )}
            </>
          )}
        </div>

        <div style={S.modalFoot}>
          {step !== "file" && (
            <button className="btn-ghost" style={S.btnGhost} onClick={back}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" style={S.btnGhost} onClick={onCancel}>Cancel</button>
          {step === "map" && (
            <button className="btn-fill" style={S.btnFill} disabled={!nameKey || map[nameKey] < 0}
              onClick={() => setStep("review")}>
              Continue <ChevronRight size={15} />
            </button>
          )}
          {step === "review" && (
            <button className="btn-fill" style={S.btnFill}
              disabled={!queue.length || !!progress} onClick={commit}>
              <Upload size={15} />
              {progress
                ? `Importing ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}…`
                : result.updates.length
                  ? `Import ${result.ready.length} new · update ${result.updates.length}`
                  : `Import ${queue.length} ${queue.length === 1 ? "row" : "rows"}`}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* One declared column: a drop target and a text box for the same value. */
function Slot({
  field, typed, index, head, body, dragCol, overField, setOverField,
  onType, onDropCol, onDropField, onClear,
}) {
  const missing = typed.trim() && index < 0;
  const over = overField === field.key && dragCol !== null;

  return (
    <div style={S.slotRow}>
      <span style={S.slotLabel}>
        {field.label}
        {field.required && <span style={S.req}>required</span>}
      </span>
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverField(field.key); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverField(null); }}
        onDrop={e => {
          e.preventDefault();
          const col = e.dataTransfer.getData("text/column");
          const from = e.dataTransfer.getData("text/field");
          if (col !== "") onDropCol(Number(col));
          else if (from && from !== field.key) onDropField(from);
          setOverField(null);
        }}
        style={{ ...S.slot, ...(over ? S.slotOver : {}),
          ...(missing ? S.slotBad : {}), ...(index >= 0 ? S.slotFilled : {}) }}>
        {index >= 0 ? (
          <div className="map-chip" draggable style={{ ...S.mapChip, ...S.mapChipOn }}
            title={head[index]}
            onDragStart={e => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/field", field.key);
            }}>
            <GripVertical size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
            <span style={S.mapChipText}>{head[index]}</span>
            <button type="button" style={S.mapChipX} aria-label={`Clear ${field.label}`}
              onClick={onClear}>
              <X size={11} />
            </button>
          </div>
        ) : (
          <input
            style={S.slotInput}
            list="sheet-columns"
            value={typed}
            placeholder="drop a column here, or type its name"
            aria-label={`Which column holds ${field.label}`}
            onChange={e => onType(e.target.value)} />
        )}
      </div>
      <div style={{ ...S.slotNote, color: missing ? "var(--danger)" : "var(--faint)" }}>
        {index >= 0
          ? <>e.g. {sample(body, index) || "(blank)"}</>
          : missing
            ? `No column called "${typed}"`
            : "Not imported"}
      </div>
      <datalist id="sheet-columns">
        {head.map((h, n) => <option key={n} value={h} />)}
      </datalist>
    </div>
  );
}

function sample(rows, i) {
  if (i < 0) return "";
  for (const r of rows) {
    const v = String(r[i] ?? "").trim();
    if (v) return v.length > 28 ? `${v.slice(0, 28)}…` : v;
  }
  return "";
}

export function Stat({ n, label, tone }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statN, color: `var(--${tone === "good" ? "accent" : tone === "warn" ? "warn" : "faint"})` }}>{n}</div>
      <div style={S.statL}>{label}</div>
    </div>
  );
}
