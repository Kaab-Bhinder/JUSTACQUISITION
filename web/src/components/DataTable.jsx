import { useEffect, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { S } from "../theme.js";
import { useStages, nextDue } from "../domain/stages.js";
import { today, daysBetween } from "../domain/dates.js";
import { Empty } from "./ui.jsx";

export function StageChips({ counts, value, onChange }) {
  const stages = useStages();
  const items = [{ id: "all", label: "All stages", accent: "var(--faint)" }, ...stages];
  return (
    <div style={S.chips}>
      {items.map(s => {
        const on = value === s.id;
        return (
          <button key={s.id} className="chip" onClick={() => onChange(s.id)}
            aria-pressed={on} style={{ ...S.chip, ...(on ? S.chipOn : {}) }}>
            <span style={{ ...S.stageDot, background: s.accent }} />
            {s.label}
            <span style={{ ...S.chipCount, ...(on ? S.chipCountOn : {}) }}>{counts[s.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ListMeta({ rows, total }) {
  const stages = useStages();
  const overdue = rows.filter(c => {
    const d = nextDue(c, stages);
    return d && daysBetween(d, today) <= 0;
  }).length;
  return (
    <div style={S.listMeta}>
      <span>{rows.length === total ? `${total} companies` : `${rows.length} of ${total} companies`}</span>
      {overdue > 0 && <span style={S.metaOver}>{overdue} due now</span>}
    </div>
  );
}

/* ----------------------------------------------------------------------
   The table

   Columns behave like a spreadsheet's: grab the right edge of any header
   and drag. Widths live per board (widthKey) in the browser, so the layout
   someone arranged is the layout they come back to. `numbered` adds the
   Excel-style row count down the left.
---------------------------------------------------------------------- */
export function DataTable({
  cols, rows, picked = [], onPick, onPickAll, sort, onSort, onOpen, empty,
  minWidth, numbered, widthKey,
}) {
  const [widths, setWidths] = useState(() => {
    if (!widthKey) return {};
    try { return JSON.parse(localStorage.getItem(widthKey) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (!widthKey) return;
    try { localStorage.setItem(widthKey, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [widths, widthKey]);

  if (!rows.length) return <Empty label={empty} />;

  const eff = (c) => widths[c.key] ?? c.w;
  const effNum = (c) => (typeof eff(c) === "number" ? eff(c) : 150);

  /* The real total of every column at its current size: past the viewport,
     the wrapper scrolls sideways instead of squeezing anything out. */
  const total = (onPick ? 44 : 0) + (numbered ? 52 : 0) +
    cols.reduce((n, c) => n + effNum(c), 0);
  const tableMin = Math.max(minWidth || 900, total);

  const startResize = (e, key, current) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = typeof current === "number" ? current : 150;
    const move = (ev) =>
      setWidths(w => ({ ...w, [key]: Math.max(70, Math.round(w0 + ev.clientX - x0)) }));
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const ids = rows.map(r => r.id);
  const allOn = ids.every(i => picked.includes(i));
  const someOn = !allOn && ids.some(i => picked.includes(i));

  return (
    <div style={S.tableWrap}>
      <table style={{ ...S.table, minWidth: tableMin }}>
        <colgroup>
          {onPick && <col style={{ width: 44 }} />}
          {numbered && <col style={{ width: 52 }} />}
          {cols.map(c => <col key={c.key} style={{ width: eff(c) }} />)}
        </colgroup>
        <thead>
          <tr>
            {onPick && (
              <th className="thead-cell" style={{ ...S.th, ...S.thCheck }}>
                <input type="checkbox" style={S.check} checked={allOn}
                  ref={el => { if (el) el.indeterminate = someOn; }}
                  onChange={onPickAll} aria-label="Select all rows shown" />
              </th>
            )}
            {numbered && (
              <th className="thead-cell" style={{ ...S.th, textAlign: "right", paddingRight: 10 }}>#</th>
            )}
            {cols.map(c => (
              <th key={c.key} scope="col" className="thead-cell"
                style={{ ...S.th, position: "sticky", textAlign: c.align || "left",
                  cursor: c.sortValue ? "pointer" : "default" }}
                onClick={() => c.sortValue && onSort(c.key)}
                aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <span style={{ ...S.thInner, justifyContent: c.align === "right" ? "flex-end" : "flex-start" }}>
                  {c.label}
                  {c.sortValue && <ArrowUpDown size={11} style={{
                    opacity: sort.key === c.key ? 1 : 0.3,
                    color: sort.key === c.key ? "var(--accent)" : "inherit",
                    transform: sort.key === c.key && sort.dir === "desc" ? "rotate(180deg)" : "none",
                  }} />}
                </span>
                {/* the Excel edge: drag to resize, double-click to reset */}
                {widthKey && (
                  <span role="separator" aria-label={`Resize ${c.label || "column"}`}
                    onMouseDown={e => startResize(e, c.key, eff(c))}
                    onDoubleClick={e => { e.stopPropagation();
                      setWidths(w => { const n = { ...w }; delete n[c.key]; return n; }); }}
                    onClick={e => e.stopPropagation()}
                    style={{ position: "absolute", top: 0, right: -4, width: 9, height: "100%",
                      cursor: "col-resize", zIndex: 3 }} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const on = picked.includes(r.id);
            return (
              <tr key={r.id} className="trow trow-in"
                /* Capped at eight: past that the last row would land noticeably
                   after the first, and this animation runs on every sort and
                   every keystroke in the search box. */
                style={{ ...S.tr, ...(on ? S.trOn : {}), "--d": `${Math.min(i, 8) * 22}ms` }}
                onClick={() => onOpen(r)}>
                {onPick && (
                  <td style={{ ...S.td, ...S.tdCheck }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" style={S.check} checked={on}
                      onChange={() => onPick(r.id)} aria-label={`Select ${r.name}`} />
                  </td>
                )}
                {numbered && (
                  <td style={{ ...S.td, ...S.cellMono, textAlign: "right", paddingRight: 10,
                    color: "var(--faint)", fontSize: 12 }}>{i + 1}</td>
                )}
                {cols.map(c => (
                  <td key={c.key} style={{ ...S.td, textAlign: c.align || "left" }}>{c.render(r)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
