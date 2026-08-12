import { Calendar, Clock, CornerUpLeft, MessageSquare, Send } from "lucide-react";
import { S } from "../theme.js";
import { useStages, stageOf, nextDue } from "../domain/stages.js";
import { today, daysBetween, fmtDate } from "../domain/dates.js";
import { LinkChips } from "./LinkChips.jsx";
import { linksFor } from "../domain/links.js";

export function CompanyCell({ c }) {
  /* The chips replace the URL line rather than joining it — one row is one
     line tall, and a company with both a site and a LinkedIn would otherwise
     be twice the height of one with neither. */
  const links = linksFor(c);
  return (
    <div>
      <div style={S.cellName}>{c.name}</div>
      {links.length
        ? <LinkChips c={c} size="sm" style={{ marginTop: 4 }} />
        : <div style={S.cellSub}>—</div>}
    </div>
  );
}

export function ContactCell({ c }) {
  const k = c.contacts[0];
  if (!k) return <span style={S.cellSub}>No contact yet</span>;
  return (
    <div>
      <div style={S.cellStrong}>{k.name}</div>
      <div style={S.cellSub}>{k.role}</div>
    </div>
  );
}

export function StageCell({ c }) {
  const st = stageOf(c.stage, useStages());
  if (!st) return null;
  return (
    <span style={S.stageCell}>
      <span style={{ ...S.stageDot, background: st.accent }} />{st.label}
    </span>
  );
}

export function DueCell({ c }) {
  const due = nextDue(c, useStages());
  if (!due) return <span style={S.cellSub}>—</span>;
  const late = daysBetween(due, today) <= 0;
  return (
    <span style={{ ...S.duePill, ...(late ? S.duePillLate : {}) }}>
      <Clock size={11} />{late ? "Due now" : fmtDate(due)}
    </span>
  );
}

export function LateCell({ c }) {
  const due = nextDue(c, useStages());
  if (!due) return <span style={S.cellSub}>—</span>;
  const late = daysBetween(today, due);
  return (
    <span style={{ ...S.duePill, ...S.duePillLate }}>
      <Clock size={11} />{late <= 0 ? "Due today" : late === 1 ? "1 day over" : `${late} days over`}
    </span>
  );
}

export function ThreadCell({ c }) {
  const msgs = c.emails || [];
  const last = msgs[msgs.length - 1];
  const unread = msgs.filter(m => m.dir === "in" && !m.read).length;
  if (!last) return <span style={S.cellSub}>No messages</span>;
  return (
    <div>
      <div style={{ ...S.cellStrong, fontWeight: unread ? 800 : 600 }}>
        {unread > 0 && <span style={S.unreadDot} />}{last.subject}
      </div>
      <div style={S.cellSub}>{msgs.length} message{msgs.length === 1 ? "" : "s"}</div>
    </div>
  );
}

export function DirCell({ c }) {
  const msgs = c.emails || [];
  const last = msgs[msgs.length - 1];
  if (!last) return null;
  const incoming = last.dir === "in";
  return (
    <span style={{ ...S.duePill, background: incoming ? "var(--good-soft)" : "var(--surface-3)",
      color: incoming ? "var(--good)" : "var(--mute)" }}>
      {incoming ? <CornerUpLeft size={11} /> : <Send size={11} />}
      {incoming ? "They replied" : "Awaiting reply"}
    </span>
  );
}

export function StatusCell({ c }) {
  const meet = c.stage === "meeting";
  return (
    <span style={{ ...S.duePill, background: meet ? "var(--accent-soft)" : "var(--good-soft)",
      color: meet ? "var(--accent)" : "var(--good)" }}>
      {meet ? <Calendar size={11} /> : <MessageSquare size={11} />}
      {meet ? "Meeting set" : "Replied"}
    </span>
  );
}

export function MeetingCell({ c }) {
  if (c.stage !== "meeting" || !c.meetingOn) return <span style={S.cellSub}>Not booked</span>;
  return <span style={S.cellMono}>{fmtDate(c.meetingOn)}</span>;
}

