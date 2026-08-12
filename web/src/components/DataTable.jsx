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

export function DataTable({ cols, rows, picked = [], onPick, onPickAll, sort, onSort, onOpen, empty, minWidth }) {
  if (!rows.length) return <Empty label={empty} />;
  const ids = rows.map(r => r.id);
  const allOn = ids.every(i => picked.includes(i));
  const someOn = !allOn && ids.some(i => picked.includes(i));
  return (
    <div style={S.tableWrap}>
      {/* A sheet with many declared columns shows ALL of them: fixed pixel
          widths push the table past the viewport and the wrapper scrolls
          sideways, exactly like the spreadsheet it mirrors. */}
      <table style={{ ...S.table, ...(minWidth ? { minWidth } : {}) }}>
        <colgroup>
          {onPick && <col style={{ width: 44 }} />}
          {cols.map(c => <col key={c.key} style={{ width: c.w }} />)}
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
            {cols.map(c => (
              <th key={c.key} scope="col" className="thead-cell"
                style={{ ...S.th, textAlign: c.align || "left", cursor: c.sortValue ? "pointer" : "default" }}
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

