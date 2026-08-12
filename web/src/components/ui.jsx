import { Building2 } from "lucide-react";
import { S } from "../theme.js";

export function Empty({ label }) {
  return <div style={S.emptyState}><Building2 size={30} style={{ color: "var(--faint)" }} /><p>{label}</p></div>;
}

export function Section({ title, children }) {
  return <div style={{ marginBottom: 22 }}>
    <div style={S.sectionTitle}>{title}</div>{children}</div>;
}

export function Field({ label, children }) {
  return <div style={{ marginBottom: 16 }}>
    <label style={S.fieldLabel}>{label}</label>{children}</div>;
}

