import { S } from "../theme.js";

export function BulkBar({ n, actions, onClear }) {
  return (
    <div style={S.bulkBar} role="region" aria-label="Actions for selected companies">
      <span style={S.bulkCount}>{n} selected</span>
      <span style={S.bulkRule} />
      {actions.map(a => (
        <button key={a.label} className="bulk-btn"
          style={{ ...S.bulkBtn, ...(a.danger ? S.bulkDanger : {}) }} onClick={a.run}>
          {a.icon}{a.label}
        </button>
      ))}
      <button className="bulk-clear" style={S.bulkClear} onClick={onClear}>Clear</button>
    </div>
  );
}

