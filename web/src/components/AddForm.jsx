import { X } from "lucide-react";
import { S, FONT } from "../theme.js";
import { byRole } from "../domain/columns.js";
import { Field } from "./ui.jsx";

/* ----------------------------------------------------------------------
   Add or edit one lead by hand.

   Generated from the vertical's own columns, so the form IS the sheet
   format: whoever declared "Company · POC 1 · Email 1 · Location" gets
   exactly those inputs, typed appropriately. The same form adds and edits —
   editing opens it pre-filled with the row's data, and saving writes back
   only what's here.
---------------------------------------------------------------------- */

const inputType = (t) =>
  t === "email" ? "email"
  : t === "phone" ? "tel"
  : t === "number" ? "number"
  : t === "date" ? "date"
  : "text";

const placeholder = (col) =>
  col.role === "name" ? "e.g. Meridian Injury Partners"
  : col.type === "email" ? "person@company.com"
  : col.type === "url" ? "company.com"
  : col.type === "phone" ? "(555) 555-0100"
  : "";

export function AddForm({
  vertical, row, setRow, onSave, onClose, firstStageLabel, editing, editingName,
}) {
  const cols = vertical.columns || [];
  const nameCol = byRole(cols, "name");
  const ready = nameCol && String(row[nameCol.key] ?? "").trim();
  const set = (key, v) => setRow(r => ({ ...r, [key]: v }));

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onClose} />
      <div className="drawer" style={S.drawer}>
        <div style={{ ...S.drawerHead, paddingBottom: 20 }}>
          <button style={S.closeBtn} onClick={onClose}><X size={18} /></button>
          <h2 style={S.drawerName}>
            {editing ? `Edit ${editingName || "lead"}` : `Add to ${vertical.name}`}
          </h2>
          <p style={{ ...S.sub, margin: "4px 0 0" }}>
            {editing
              ? "Change anything — the board, the emails and the merge tags all read from here."
              : `They'll start in ${firstStageLabel || "the first stage"}.`}
          </p>
        </div>
        <div style={S.drawerBody}>
          {cols.map(col => (
            <Field key={col.key} label={
              col.role === "name" ? `${col.label} (required)`
              : col.role === "email" ? `${col.label} — outreach goes here`
              : col.label
            }>
              {col.type === "longtext" ? (
                <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: FONT }}
                  value={row[col.key] ?? ""} placeholder={placeholder(col)}
                  onChange={e => set(col.key, e.target.value)} />
              ) : (
                <input style={S.input} type={inputType(col.type)}
                  value={row[col.key] ?? ""} placeholder={placeholder(col)}
                  onChange={e => set(col.key, e.target.value)} />
              )}
            </Field>
          ))}
        </div>
        <div style={S.drawerActions}>
          <button className="act-primary"
            style={{ ...S.actPrimary, width: "100%", justifyContent: "center" }}
            onClick={onSave} disabled={!ready}>
            {editing ? "Save changes" : `Add to ${firstStageLabel || "the funnel"}`}
          </button>
        </div>
      </div>
    </>
  );
}
