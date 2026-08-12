/* ----------------------------------------------------------------------
   Styles
   Every colour is a CSS variable set on the root [data-theme] element, so
   light/dark is one attribute flip and no component re-reads a palette.
   House rule: a Tiffany fill always carries deep-teal ink, never white —
   white on #0ABAB5 only reaches 2.4:1, deep teal reaches 5.9:1.
---------------------------------------------------------------------- */
import { brandTokens, neutralVars, luminance, rgba } from "./domain/colour.js";

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const S = {
  app: { display: "flex", height: "100vh", fontFamily: FONT, background: "var(--bg)", color: "var(--ink)", overflow: "hidden" },

  sidebar: { width: 264, background: "var(--sidebar)", color: "var(--sidebar-ink)", padding: "26px 18px", display: "flex", flexDirection: "column", flexShrink: 0 },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  /* The whole brand block is the control for an owner, so it needs the padding
     and radius of one rather than looking like text that happens to react. */
  brandBtn: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, background: "transparent", border: "1px solid transparent", borderRadius: 12, padding: "6px 8px 6px 6px", margin: "-6px 0 -6px -6px", cursor: "pointer", fontFamily: FONT, color: "var(--sidebar-ink)", transition: "background .16s, border-color .16s" },
  logoMark: { width: 40, height: 40, borderRadius: 11, background: "var(--logo-bg)", color: "var(--logo-ink)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, flexShrink: 0 },
  brandName: { fontWeight: 800, fontSize: 18, letterSpacing: 0.5 },
  brandSub: { fontSize: 11.5, color: "var(--sidebar-mute)", marginTop: 1 },
  themeBtn: { marginLeft: "auto", width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: "1px solid var(--sidebar-border)", background: "var(--sidebar-panel)", color: "var(--sidebar-ink)", display: "grid", placeItems: "center", cursor: "pointer" },

  navItem: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", background: "transparent", border: "none", color: "var(--sidebar-mute)", fontSize: 14, fontWeight: 500, borderRadius: 10, cursor: "pointer", marginBottom: 4, fontFamily: FONT, transition: "all .15s" },
  navActive: { background: "var(--sidebar-active)", color: "var(--sidebar-active-ink)", fontWeight: 700 },
  navCount: { fontSize: 12, fontWeight: 700, background: "var(--sidebar-panel)", padding: "2px 9px", borderRadius: 20, minWidth: 24, textAlign: "center" },
  navCountActive: { background: "var(--accent-fill)", color: "var(--on-accent)" },


  addBtn: { marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--accent-fill)", color: "var(--on-accent)", border: "none", padding: "13px", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  importBtn: { marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: "var(--sidebar-ink)", border: "1px solid var(--sidebar-border)", padding: "12px", borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },

  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { padding: "22px 30px 18px", background: "var(--surface)", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" },
  h1: { fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.4, color: "var(--ink)" },
  sub: { fontSize: 13, color: "var(--mute)", margin: "4px 0 0", maxWidth: 520, lineHeight: 1.5 },
  tools: { display: "flex", gap: 10, alignItems: "center" },

  seg: { display: "flex", background: "var(--surface-3)", borderRadius: 10, padding: 3 },
  /* Sits behind both buttons and slides between them; the buttons themselves
     no longer carry a background, only a colour change. */
  segThumb: { left: 3, width: "calc(50% - 3px)" },
  segBtn: { flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--mute)", fontSize: 13, fontWeight: 600, fontFamily: FONT, padding: "7px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  segOn: { color: "var(--ink)" },

  searchWrap: { display: "flex", alignItems: "center", gap: 8, background: "var(--surface-3)", borderRadius: 10, padding: "9px 13px", width: 240 },
  searchInput: { border: "none", background: "transparent", outline: "none", fontSize: 13.5, width: "100%", fontFamily: FONT, color: "var(--ink)" },
  filterWrap: { display: "flex", alignItems: "center", gap: 6, background: "var(--surface-3)", borderRadius: 10, padding: "8px 11px" },
  select: { border: "none", background: "var(--surface-3)", outline: "none", fontSize: 13, fontFamily: FONT, color: "var(--ink)", cursor: "pointer", fontWeight: 500 },

  canvas: { flex: 1, overflow: "auto", padding: 26 },
  canvasList: { display: "flex", flexDirection: "column", overflow: "hidden" },

  board: { display: "grid", gridTemplateColumns: "repeat(4, minmax(240px,1fr))", gap: 16, minWidth: 1040 },
  col: { background: "var(--surface-3)", borderRadius: 16, display: "flex", flexDirection: "column", maxHeight: "100%" },
  colHead: { padding: "15px 15px 12px" },
  stageDot: { width: 9, height: 9, borderRadius: 3, flexShrink: 0 },
  colTitle: { fontSize: 14, fontWeight: 700 },
  colCount: { fontSize: 11.5, fontWeight: 700, color: "var(--mute)", background: "var(--surface)", padding: "1px 8px", borderRadius: 20 },
  colSub: { fontSize: 11.5, color: "var(--faint)", marginTop: 4, marginLeft: 17 },
  colBody: { padding: "4px 11px 14px", overflow: "auto", flex: 1 },
  colEmpty: { fontSize: 12, color: "var(--faint)", textAlign: "center", padding: "24px 0" },

  card: { background: "var(--surface)", borderRadius: 12, padding: "13px 14px", marginBottom: 9, cursor: "pointer", border: "1px solid var(--line)", boxShadow: "var(--shadow-1)", transition: "all .16s" },
  /* Two lines, then an ellipsis. A card that grows to fit its title pushes
     every card below it down the column, and the import can always hand us a
     name longer than anything designed for. */
  cardName: { fontSize: 13.8, fontWeight: 700, lineHeight: 1.3, minWidth: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" },
  cardContact: { fontSize: 11.5, color: "var(--ink-2)", marginTop: 8, display: "flex", alignItems: "center", gap: 5, minWidth: 0 },
  cardContactText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  dueChip: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--mute)", background: "var(--surface-3)", padding: "3px 8px", borderRadius: 7 },
  dueOver: { color: "var(--danger)", background: "var(--danger-soft)" },
  advanceBtn: { display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "none", padding: "5px 9px", borderRadius: 7, cursor: "pointer", fontFamily: FONT },

  chips: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  chip: { display: "flex", alignItems: "center", gap: 7, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer", fontFamily: FONT, transition: "all .14s" },
  chipOn: { background: "var(--accent-fill)", borderColor: "var(--accent-fill)", color: "var(--on-accent)" },
  chipCount: { fontSize: 11.5, fontWeight: 700, background: "var(--surface-3)", color: "var(--mute)", padding: "1px 7px", borderRadius: 20 },
  chipCountOn: { background: "rgba(4,48,46,.16)", color: "var(--on-accent)" },

  listMeta: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 600, color: "var(--faint)", marginBottom: 10 },
  metaOver: { color: "var(--danger)", background: "var(--danger-soft)", padding: "2px 9px", borderRadius: 20, fontSize: 11.5 },

  tableWrap: { flex: "1 1 auto", minHeight: 0, overflow: "auto", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow-1)" },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 900 },
  th: { position: "sticky", top: 0, zIndex: 2, background: "var(--surface-2)", borderBottom: "1px solid var(--line)", padding: "11px 14px", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--faint)", userSelect: "none", whiteSpace: "nowrap" },
  thCheck: { padding: "11px 0 11px 15px" },
  thInner: { display: "flex", alignItems: "center", gap: 5 },
  tr: { borderBottom: "1px solid var(--line-soft)", cursor: "pointer", transition: "background .12s" },
  trOn: { background: "var(--accent-soft)" },
  td: { padding: "13px 14px", verticalAlign: "middle", overflow: "hidden", fontSize: 14 },
  tdCheck: { padding: "11px 0 11px 15px" },
  check: { width: 15, height: 15, accentColor: "var(--accent-fill)", cursor: "pointer", margin: 0, flexShrink: 0 },

  cellName: { fontSize: 15, fontWeight: 700, letterSpacing: -0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cellStrong: { fontSize: 14.2, fontWeight: 600, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cellSub: { fontSize: 12.8, color: "var(--faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cellMono: { fontSize: 13.8, fontWeight: 600, color: "var(--ink-2)" },
  stageCell: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.8, fontWeight: 600, color: "var(--ink-2)" },
  duePill: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--ink-2)", background: "var(--surface-3)", padding: "4px 9px", borderRadius: 7, whiteSpace: "nowrap" },
  duePillLate: { color: "var(--danger)", background: "var(--danger-soft)" },
  partnerTag: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--good)", background: "var(--good-soft)", padding: "4px 10px", borderRadius: 20 },

  rowActions: { display: "flex", gap: 6, justifyContent: "flex-end" },
  rowBtn: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.8, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "none", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap", transition: "all .14s" },
  rowBtnGo: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.8, fontWeight: 700, color: "var(--good)", background: "var(--good-soft)", border: "none", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap", transition: "all .14s" },

  bulkBar: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, background: "var(--bulk-bg)", padding: "11px 14px", borderRadius: 14, zIndex: 45, boxShadow: "var(--shadow-3)", border: "1px solid var(--bulk-border)" },
  bulkCount: { fontSize: 13, fontWeight: 700, color: "var(--bulk-ink)", padding: "0 4px", whiteSpace: "nowrap" },
  bulkRule: { width: 1, height: 22, background: "var(--bulk-border)" },
  bulkBtn: { display: "flex", alignItems: "center", gap: 6, background: "var(--bulk-btn)", color: "var(--bulk-ink)", border: "none", padding: "9px 13px", borderRadius: 9, fontSize: 12.8, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap", transition: "all .14s" },
  bulkDanger: { color: "var(--bulk-danger)" },
  bulkClear: { background: "transparent", border: "none", color: "var(--bulk-mute)", fontSize: 12.8, fontWeight: 600, cursor: "pointer", fontFamily: FONT, padding: "9px 8px" },

  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "70px 0", color: "var(--faint)", fontSize: 14 },

  scrim: { position: "fixed", inset: 0, background: "var(--scrim)", backdropFilter: "blur(2px)", zIndex: 40 },
  drawer: { position: "fixed", top: 0, right: 0, height: "100%", width: 420, maxWidth: "92vw", background: "var(--surface)", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "var(--shadow-2)" },
  drawerHead: { padding: "24px 26px 18px", borderBottom: "1px solid var(--line)", position: "relative" },
  closeBtn: { position: "absolute", top: 20, right: 20, background: "var(--surface-3)", border: "none", borderRadius: 9, width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--mute)" },
  drawerName: { fontSize: 20, fontWeight: 800, margin: "12px 0 6px", letterSpacing: -0.3, paddingRight: 30, overflowWrap: "anywhere" },
  webLink: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--accent)", textDecoration: "none", fontWeight: 600 },

  /* ---- website / LinkedIn buttons ----
     The label is the word, never the URL, so the width is fixed and a
     sixty-character LinkedIn address can't push anything off the panel. */
  linkRow: { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 },
  linkChip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid transparent", padding: "6px 10px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap", transition: "background .14s, color .14s, border-color .14s" },
  linkChipSm: { fontSize: 11, padding: "3px 7px", borderRadius: 6, gap: 4 },
  linkChipOut: { opacity: 0.55 },
  drawerBody: { flex: 1, overflow: "auto", padding: "22px 26px" },
  sectionTitle: { fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--faint)", marginBottom: 12 },
  contactCard: { background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 },
  contactName: { fontSize: 14.5, fontWeight: 700 },
  contactRole: { fontSize: 12.5, color: "var(--mute)", marginTop: 2, marginBottom: 10 },
  contactMeta: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 },
  notes: { fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6, margin: 0, background: "var(--surface-2)", padding: 14, borderRadius: 12, border: "1px solid var(--line)" },
  timeline: { display: "flex", flexDirection: "column", gap: 0 },
  tlRow: { display: "flex", alignItems: "center", gap: 11, padding: "7px 0", position: "relative" },
  tlDot: { width: 8, height: 8, borderRadius: 4, background: "var(--accent-fill)", flexShrink: 0 },
  tlDate: { fontSize: 11.5, fontWeight: 700, color: "var(--faint)", width: 52, flexShrink: 0 },
  tlText: { fontSize: 13, color: "var(--ink-2)" },
  drawerActions: { padding: "18px 22px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 9, background: "var(--surface-2)" },
  dRespond: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--good)", color: "var(--on-good)", border: "none", padding: "13px", borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  dNext: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--accent-soft)", color: "var(--accent)", border: "none", padding: "12px", borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  dRemove: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--danger-soft)", color: "var(--danger)", border: "none", padding: "12px 16px", borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  wonNote: { display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600, color: "var(--good)", background: "var(--good-soft)", padding: "13px 15px", borderRadius: 11 },
  actPrimary: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "var(--accent-fill)", color: "var(--on-accent)", border: "none", padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  actWin: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "var(--good)", color: "var(--on-good)", border: "none", padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },

  input: { width: "100%", padding: "11px 13px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 14.5, fontFamily: FONT, outline: "none", color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box" },
  fieldLabel: { display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", marginBottom: 7 },
  formContact: { background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 13, marginBottom: 10 },
  addContactBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", padding: "10px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: "pointer", width: "100%", justifyContent: "center", fontFamily: FONT, marginBottom: 18 },

  vtag: { fontWeight: 700, padding: "3px 9px", borderRadius: 7, display: "inline-block", letterSpacing: 0.2 },
  vtagNone: { fontWeight: 600, color: "var(--faint)", display: "inline-block", padding: "3px 2px" },
  toast: { position: "fixed", left: "50%", transform: "translateX(-50%)", background: "var(--bulk-bg)", color: "var(--bulk-ink)", padding: "13px 20px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, zIndex: 60, boxShadow: "var(--shadow-3)", border: "1px solid var(--bulk-border)" },

  navCountAlert: { background: "var(--accent-fill)", color: "var(--on-accent)" },
  stageBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: "var(--sidebar-mute)", border: "1px dashed var(--sidebar-border)", padding: "11px", borderRadius: 11, fontSize: 12.8, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginBottom: 4 },

  /* board drag and drop */
  colOver: { outline: "2px dashed var(--accent-fill)", outlineOffset: -2, background: "var(--accent-soft)" },
  cardHeld: { opacity: 0.4, transform: "scale(.98)" },
  grip: { color: "var(--faint)", verticalAlign: "-2px", marginRight: 4, cursor: "grab" },

  /* email */
  unreadDot: { display: "inline-block", width: 7, height: 7, borderRadius: 4, background: "var(--accent-fill)", marginRight: 7, verticalAlign: "middle" },
  thread: { display: "flex", flexDirection: "column", gap: 10 },
  threadEmpty: { fontSize: 12.8, color: "var(--faint)", background: "var(--surface-2)", border: "1px dashed var(--line)", borderRadius: 12, padding: "18px 14px", textAlign: "center" },
  msg: { background: "var(--surface-2)", border: "1px solid var(--line)", borderLeft: "3px solid var(--faint)", borderRadius: 10, padding: "12px 14px" },
  msgIn: { borderLeftColor: "var(--good)", background: "var(--good-soft)" },
  msgHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 },
  msgTag: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--mute)", background: "var(--surface-3)", padding: "2px 7px", borderRadius: 5 },
  msgTagIn: { color: "var(--good)", background: "transparent", border: "1px solid var(--good)" },
  msgDate: { fontSize: 11, fontWeight: 700, color: "var(--faint)" },
  msgSubject: { fontSize: 13.2, fontWeight: 700, marginBottom: 5 },
  msgBody: { fontSize: 12.8, color: "var(--ink-2)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" },

  /* composer */
  composerTo: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line-soft)", marginBottom: 2 },
  toLabel: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--faint)", width: 46, flexShrink: 0 },
  toValue: { fontSize: 13, fontWeight: 600, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tplRow: { display: "flex", gap: 7, flexWrap: "wrap" },
  tagHint: { fontSize: 11.5, fontWeight: 600, color: "var(--faint)", marginBottom: 7 },
  tags: { display: "flex", gap: 6, flexWrap: "wrap" },
  tagChip: { fontSize: 11.5, fontWeight: 700, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--accent)", background: "var(--accent-soft)", border: "none", padding: "5px 9px", borderRadius: 7, cursor: "pointer" },
  previewBox: { marginTop: 12, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  previewSubject: { fontSize: 13.5, fontWeight: 800, marginBottom: 9, paddingBottom: 9, borderBottom: "1px solid var(--line)" },

  /* stage editor */
  seHead: { display: "grid", gridTemplateColumns: "26px 1fr 150px 96px", gap: 10, alignItems: "center", padding: "0 0 8px" },
  seHeadLabel: { fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--faint)" },
  seRow: { display: "grid", gridTemplateColumns: "26px 1fr 150px 96px", gap: 10, alignItems: "start", padding: "10px 0", borderTop: "1px solid var(--line-soft)" },
  seSwatch: { width: 22, height: 22, borderRadius: 7, border: "1px solid var(--line)", cursor: "pointer", marginTop: 7, padding: 0 },
  seWait: { display: "flex", alignItems: "center", gap: 7 },
  seDays: { fontSize: 12, fontWeight: 600, color: "var(--mute)" },
  seTools: { display: "flex", gap: 4, justifyContent: "flex-end" },
  seIcon: { width: 28, height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--mute)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 13, fontFamily: FONT },
  seConfirm: { background: "var(--warn-soft)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, margin: "10px 0" },
  seConfirmText: { display: "flex", alignItems: "center", gap: 9, fontSize: 12.8, fontWeight: 700, color: "var(--warn)", marginBottom: 11 },
  seConfirmRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  mailBar: { display: "flex", alignItems: "center", gap: 13, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "13px 16px", marginBottom: 14, flexShrink: 0, boxShadow: "var(--shadow-1)" },
  mailDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  mailText: { flex: 1, minWidth: 0 },
  mailTitle: { fontSize: 13.5, fontWeight: 700 },
  mailSub: { fontSize: 12, color: "var(--mute)", marginTop: 2, lineHeight: 1.45 },
  titleIcon: { verticalAlign: "-2px", marginRight: 5 },
  code: { fontSize: 11.5, background: "var(--surface-3)", padding: "1px 5px", borderRadius: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  inlineLink: { color: "var(--accent)", fontWeight: 700 },
  readOnlyTag: { marginLeft: 8, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 7px", borderRadius: 6, verticalAlign: "1px" },

  /* composer — Gmail hand-off */
  toHint: { marginLeft: 7, fontSize: 12, fontWeight: 500, color: "var(--faint)" },
  progressTag: { marginLeft: 9, fontSize: 11, fontWeight: 700, textTransform: "none", letterSpacing: 0, color: "var(--mute)", background: "var(--surface-3)", padding: "2px 8px", borderRadius: 6 },
  recipientList: { border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" },
  recipient: { display: "flex", alignItems: "center", gap: 11, padding: "10px 13px", borderBottom: "1px solid var(--line-soft)", transition: "background .14s" },
  recipientDone: { background: "var(--good-soft)" },
  recipientTick: { width: 16, display: "grid", placeItems: "center", flexShrink: 0 },
  recipientDot: { width: 7, height: 7, borderRadius: 4, background: "var(--faint)" },
  recipientText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  recipientName: { fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  recipientMail: { fontSize: 11.5, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  footNote: { fontSize: 12, fontWeight: 600, color: "var(--mute)" },
  /* an <a> can't be :disabled, so the not-ready state is styled by hand */
  aDisabled: { opacity: 0.45, pointerEvents: "none" },

  /* boot / load failure */
  boot: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, height: "100vh", padding: 30, textAlign: "center", fontFamily: FONT, background: "var(--bg)", color: "var(--ink)" },
  bootTitle: { fontSize: 18, fontWeight: 800, marginTop: 4 },
  bootMsg: { fontSize: 13.5, color: "var(--ink-2)", fontWeight: 600, maxWidth: 460, lineHeight: 1.55 },
  bootHint: { fontSize: 12.5, color: "var(--mute)", maxWidth: 460, lineHeight: 1.6 },

  /* import modal */
  modal: { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 660, maxWidth: "94vw", maxHeight: "88vh", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 18, zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "var(--shadow-2)" },
  modalHead: { padding: "24px 26px 18px", borderBottom: "1px solid var(--line)", position: "relative" },
  modalStep: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--accent)" },
  modalTitle: { fontSize: 19, fontWeight: 800, margin: "8px 0 5px", letterSpacing: -0.3, paddingRight: 40 },
  modalSub: { fontSize: 13, color: "var(--mute)", margin: 0, lineHeight: 1.5 },
  modalBody: { flex: 1, overflow: "auto", padding: "22px 26px" },
  modalFoot: { display: "flex", alignItems: "center", gap: 8, padding: "16px 22px", borderTop: "1px solid var(--line)", background: "var(--surface-2)" },
  btnGhost: { display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--mute)", border: "1px solid var(--line)", padding: "11px 15px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  btnFill: { display: "flex", alignItems: "center", gap: 7, background: "var(--accent-fill)", color: "var(--on-accent)", border: "none", padding: "11px 17px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },

  drop: { display: "flex", flexDirection: "column", alignItems: "center", gap: 9, border: "2px dashed var(--line)", borderRadius: 16, padding: "38px 24px", cursor: "pointer", textAlign: "center", background: "var(--surface-2)", transition: "all .16s" },
  dropOn: { borderColor: "var(--accent-fill)", background: "var(--accent-soft)" },
  dropTitle: { fontSize: 14.5, fontWeight: 700, marginTop: 4 },
  dropSub: { fontSize: 12.5, color: "var(--mute)" },
  linkBtn: { display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: "14px 2px 0", margin: "0 auto" },

  errBox: { display: "flex", alignItems: "flex-start", gap: 9, background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger-line)", padding: "12px 14px", borderRadius: 11, fontSize: 12.8, fontWeight: 600, lineHeight: 1.5, marginBottom: 16 },
  infoBox: { display: "flex", alignItems: "center", gap: 9, background: "var(--accent-soft)", color: "var(--accent)", padding: "11px 14px", borderRadius: 11, fontSize: 12.8, fontWeight: 700, marginBottom: 16 },
  warnBox: { display: "flex", alignItems: "flex-start", gap: 9, background: "var(--warn-soft)", color: "var(--warn)", padding: "12px 14px", borderRadius: 11, fontSize: 12.8, fontWeight: 600, lineHeight: 1.5, marginBottom: 16 },

  /* ---- column mapping board ----------------------------------------------
     The sheet's columns on the left, the CRM's fields on the right. A wider
     modal than the rest of the wizard because two columns of content at the
     usual 660px leaves neither of them readable. */
  modalWide: { width: 940 },
  mapBoard: { display: "grid", gridTemplateColumns: "236px 1fr", gap: 16, alignItems: "start" },

  mapPool: { position: "sticky", top: 0, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 14, padding: 12 },
  mapPoolHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--faint)", marginBottom: 10 },
  mapPoolCount: { fontWeight: 700, letterSpacing: 0, textTransform: "none", fontSize: 11 },
  mapChips: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflow: "auto" },
  mapPoolEmpty: { fontSize: 11.5, color: "var(--faint)", padding: "10px 2px", lineHeight: 1.5 },

  mapChip: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink-2)", background: "var(--surface)", border: "1px solid var(--line)", padding: "6px 8px", borderRadius: 8, cursor: "grab", minWidth: 0, transition: "border-color .14s, box-shadow .14s" },
  mapChipOn: { background: "var(--accent-soft)", borderColor: "transparent", color: "var(--accent)", fontWeight: 700, width: "100%" },
  mapChipText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 },
  mapChipX: { display: "grid", placeItems: "center", border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 2, borderRadius: 5, opacity: 0.7, flexShrink: 0 },

  mapFields: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 },
  mapGroup: { border: "1px solid var(--line)", borderRadius: 14, padding: "12px 13px 4px" },
  mapGroupHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  mapGroupTitle: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--faint)" },

  slotRow: { display: "grid", gridTemplateColumns: "132px 1fr", gap: "0 10px", alignItems: "center", marginBottom: 10 },
  slotLabel: { fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  slot: { minHeight: 36, borderRadius: 9, border: "1px dashed var(--line)", display: "flex", alignItems: "center", padding: 3, transition: "border-color .14s, background .14s" },
  slotFilled: { borderStyle: "solid", borderColor: "transparent", background: "transparent", padding: 0 },
  slotOver: { borderColor: "var(--accent-fill)", background: "var(--accent-soft)", borderStyle: "solid" },
  slotBad: { borderColor: "var(--danger)" },
  slotInput: { flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 12.5, fontFamily: FONT, color: "var(--ink)", padding: "6px 8px" },
  slotNote: { gridColumn: "2", fontSize: 11, marginTop: 3, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  mapLabel: { fontSize: 13, fontWeight: 700, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  mapSelect: { padding: "9px 11px", fontSize: 13 },
  req: { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 6px", borderRadius: 5 },

  stats: { display: "flex", gap: 10, marginBottom: 16 },
  stat: { flex: 1, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 12px", textAlign: "center" },
  statN: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.1 },
  statL: { fontSize: 11.5, fontWeight: 600, color: "var(--mute)", marginTop: 3, lineHeight: 1.35 },
  checkRow: { display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, fontWeight: 600, color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", padding: "13px 14px", borderRadius: 11, cursor: "pointer", marginBottom: 16, lineHeight: 1.45 },

  previewWrap: { border: "1px solid var(--line)", borderRadius: 12, overflow: "auto", marginBottom: 6 },
  preview: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  pTh: { textAlign: "left", background: "var(--surface-2)", borderBottom: "1px solid var(--line)", padding: "9px 12px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--faint)", whiteSpace: "nowrap" },
  pTd: { padding: "9px 12px", borderBottom: "1px solid var(--line-soft)", color: "var(--ink-2)", fontWeight: 600, whiteSpace: "nowrap", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" },
  previewMore: { fontSize: 12, color: "var(--faint)", fontWeight: 600, textAlign: "center", padding: "4px 0 2px" },

  /* ---- landing: pick an organization ----------------------------------
     The one page that isn't inside a tenant, so it is the only place styled
     against the base palette rather than an org's accent. Wide margins and a
     single column on purpose: it has one job, and a picker that looks like a
     dashboard invites you to start working on it. */
  lpApp: { minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", fontFamily: FONT, display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden" },
  /* Two very soft washes behind everything, each drifting slowly and out of
     phase with the other. aria-hidden, pointer-events none — decoration that
     must never intercept a click. `overflow: hidden` on the app root keeps the
     drift from widening the page. */
  lpGlow: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" },
  lpBlobA: { top: "-24%", left: "-12%", width: "70vw", height: "70vw", maxWidth: 900, maxHeight: 900, background: "var(--accent-soft)", opacity: 0.85 },
  lpBlobB: { top: "-16%", right: "-14%", width: "58vw", height: "58vw", maxWidth: 760, maxHeight: 760, background: "var(--good-soft)", opacity: 0.7 },

  lpNav: { position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14, padding: "20px 28px", maxWidth: 1160, width: "100%", margin: "0 auto" },
  lpLogo: { display: "flex", alignItems: "center", gap: 11 },
  lpLogoMark: { width: 34, height: 34, borderRadius: 10, background: "var(--accent-fill)", color: "var(--on-accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 },
  lpLogoName: { fontSize: 15, fontWeight: 800, letterSpacing: -0.2 },
  lpNavRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 },
  lpWho: { display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.3, marginRight: 4 },
  lpWhoName: { fontSize: 13, fontWeight: 700 },
  lpWhoMail: { fontSize: 11.5, color: "var(--faint)" },
  lpIconBtn: { width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--mute)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 },

  lpMain: { position: "relative", zIndex: 1, flex: 1, width: "100%", maxWidth: 1160, margin: "0 auto", padding: "26px 28px 40px" },
  lpHero: { maxWidth: 660, marginBottom: 34 },
  lpEyebrow: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.1, color: "var(--accent)", background: "var(--accent-soft)", padding: "5px 11px", borderRadius: 20, marginBottom: 16 },
  /* clamp() rather than a breakpoint: the headline is the one element whose
     size should track the viewport continuously. */
  lpTitle: { fontSize: "clamp(30px, 4.6vw, 46px)", fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.08, margin: 0 },
  lpLead: { fontSize: 15.5, lineHeight: 1.62, color: "var(--mute)", margin: "14px 0 0", maxWidth: 560 },
  /* The whole account at a glance, above the per-organization detail. */
  lpTotals: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 18, fontSize: 13, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  lpDot: { width: 3, height: 3, borderRadius: 2, background: "var(--faint)", flexShrink: 0 },

  /* Which verticals a tenant sells into, on its card. */
  lpVerts: { display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 },
  lpVert: { fontSize: 10, fontWeight: 800, padding: "3px 7px", borderRadius: 6, letterSpacing: 0.2, whiteSpace: "nowrap" },

  lpSectionHead: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 },
  lpSectionTitle: { fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.9, color: "var(--faint)" },
  lpGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(304px, 1fr))", gap: 16, alignItems: "stretch" },

  /* A whole card is the button. Rendered as <button> so it is tab-reachable
     and answers to Enter and Space without any key handling of our own. */
  lpCard: { position: "relative", display: "flex", flexDirection: "column", textAlign: "left", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 18, padding: "20px 20px 16px", cursor: "pointer", fontFamily: FONT, color: "var(--ink)", boxShadow: "var(--shadow-1)", overflow: "hidden", transition: "transform .18s, box-shadow .18s, border-color .18s" },
  /* The org's colour, on its own card only. Three pixels is enough to tell two
     tenants apart at a glance without turning the page into a paint chart. */
  lpCardBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  lpCardHead: { display: "flex", alignItems: "center", gap: 13, marginBottom: 14 },
  lpCardMark: { width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17, flexShrink: 0, letterSpacing: -0.3 },

  /* ---- an organization's own mark --------------------------------------
     A wordmark is wide, so the tile that holds one stops being a square and
     grows to fit rather than shrinking the artwork into a corner. The ground
     is a near-black constant in both themes: a logo is supplied on the
     assumption of one background, and putting a brand's gradient on a colour
     that moves with the theme is how you get an invisible logo. */
  logoTile: { height: 46, minWidth: 46, borderRadius: 13, display: "grid", placeItems: "center", flexShrink: 0, padding: "0 11px", background: "#0A0A11", border: "1px solid rgba(255,255,255,.09)" },
  logoImg: { height: 22, width: "auto", display: "block" },
  lpCardName: { fontSize: 17, fontWeight: 800, letterSpacing: -0.35, lineHeight: 1.2 },
  lpCardFull: { fontSize: 12, color: "var(--faint)", marginTop: 2, fontWeight: 600 },
  lpRole: { fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, padding: "3px 7px", borderRadius: 5, background: "var(--surface-3)", color: "var(--mute)", marginLeft: "auto", alignSelf: "flex-start" },
  lpCardTag: { fontSize: 12.8, lineHeight: 1.55, color: "var(--ink-2)", margin: "0 0 12px", minHeight: 40 },

  lpStats: { display: "flex", gap: 8, marginTop: "auto" },
  lpStat: { flex: 1, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: "9px 8px", textAlign: "center" },
  lpStatN: { fontSize: 18, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" },
  lpStatL: { fontSize: 10, fontWeight: 700, color: "var(--faint)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  lpEnter: { display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "var(--accent)", marginTop: 14 },
  lpUnread: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: "var(--on-accent)", background: "var(--accent-fill)", padding: "2px 8px", borderRadius: 20, marginLeft: 8 },

  lpAdd: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 232, background: "transparent", border: "2px dashed var(--line)", borderRadius: 18, cursor: "pointer", fontFamily: FONT, color: "var(--mute)", padding: 22, transition: "border-color .18s, background .18s, color .18s" },
  lpAddIcon: { width: 46, height: 46, borderRadius: 13, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--mute)" },
  lpAddTitle: { fontSize: 14.5, fontWeight: 700, color: "var(--ink-2)" },
  lpAddSub: { fontSize: 12, textAlign: "center", lineHeight: 1.5, maxWidth: 210 },

  lpEmpty: { gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "48px 24px", textAlign: "center", background: "var(--surface-2)", border: "1px dashed var(--line)", borderRadius: 18 },
  lpFoot: { position: "relative", zIndex: 1, maxWidth: 1160, width: "100%", margin: "0 auto", padding: "20px 28px 30px", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 },

  /* brand swatch picker, shared by the create and settings forms */
  lpSwatches: { display: "flex", gap: 8, flexWrap: "wrap" },
  lpSwatch: { width: 34, height: 34, borderRadius: 10, border: "2px solid transparent", cursor: "pointer", padding: 0, display: "grid", placeItems: "center", transition: "transform .14s" },
  lpSwatchOn: { borderColor: "var(--ink)", transform: "scale(1.06)" },

  /* ---- colour picker ---------------------------------------------------
     The saturation/value square is one solid hue with two gradients laid over
     it: white to transparent across, then transparent to black down. That is
     the whole trick — no canvas, and it stays crisp at any size. */
  cpTop: { display: "flex", flexDirection: "column", gap: 12 },
  cpSquare: { position: "relative", height: 148, borderRadius: 12, cursor: "crosshair", touchAction: "none", overflow: "hidden", border: "1px solid var(--line)" },
  cpSat: { position: "absolute", inset: 0, background: "linear-gradient(to right, #fff, rgba(255,255,255,0))" },
  cpVal: { position: "absolute", inset: 0, background: "linear-gradient(to top, #000, rgba(0,0,0,0))" },
  cpKnob: { position: "absolute", width: 16, height: 16, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45), 0 1px 4px rgba(0,0,0,.4)", transform: "translate(-50%,-50%)", pointerEvents: "none" },

  cpRail: { position: "relative", height: 16, borderRadius: 9, cursor: "ew-resize", touchAction: "none", border: "1px solid var(--line)", background: "linear-gradient(to right, #f00 0%, #ff0 16.66%, #0f0 33.33%, #0ff 50%, #00f 66.66%, #f0f 83.33%, #f00 100%)" },
  cpRailKnob: { position: "absolute", top: "50%", width: 16, height: 16, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45), 0 1px 4px rgba(0,0,0,.4)", transform: "translate(-50%,-50%)", pointerEvents: "none" },

  cpRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" },
  cpChip: { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 },
  cpPresets: { display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" },
  cpReport: { marginTop: 11, display: "flex", flexDirection: "column", gap: 5 },
  cpNote: { fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55 },

  /* ---- verticals multi-select ----
     A grid of toggles rather than a <select multiple>, which on every platform
     requires holding a modifier to pick a second item and shows no more than
     four rows. Everything here is visible and one tap each. */
  vtSelect: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 8 },
  vtOpt: { display: "flex", alignItems: "flex-start", gap: 9, textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 11px", cursor: "pointer", fontFamily: FONT, color: "var(--ink)", transition: "border-color .14s, background .14s" },
  vtOptOn: { background: "var(--accent-soft)", borderColor: "var(--accent-fill)" },
  vtTick: { width: 17, height: 17, borderRadius: 5, border: "1.5px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1, color: "var(--on-accent)" },
  vtTickOn: { background: "var(--accent-fill)", borderColor: "var(--accent-fill)" },
  vtLabel: { display: "block", fontSize: 13, fontWeight: 700, lineHeight: 1.25 },
  vtHint: { display: "block", fontSize: 11, color: "var(--faint)", marginTop: 2, lineHeight: 1.35 },
  vtFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, fontSize: 12, fontWeight: 600 },
  vtAll: { background: "none", border: "none", color: "var(--accent)", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT, padding: 0 },

  /* ---- logo upload ---- */
  logoRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  logoBtns: { display: "flex", gap: 8, flexWrap: "wrap" },

  /* ---- sign in / create account ---------------------------------------
     A two-panel split on a wide screen, one column below 860px. The brand
     panel is decorative and comes second in the DOM, so a screen reader and
     a narrow viewport both reach the form first. */
  auApp: { minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", fontFamily: FONT, background: "var(--bg)", color: "var(--ink)" },
  auFormSide: { display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 28px", overflowY: "auto" },
  auForm: { width: "100%", maxWidth: 392 },
  auTitle: { fontSize: 27, fontWeight: 800, letterSpacing: -0.7, margin: "20px 0 6px" },
  auSub: { fontSize: 13.5, color: "var(--mute)", margin: "0 0 26px", lineHeight: 1.55 },
  auField: { marginBottom: 15 },
  auSubmit: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--accent-fill)", color: "var(--on-accent)", border: "none", padding: "13px", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 6 },
  auSwap: { fontSize: 13, color: "var(--mute)", textAlign: "center", marginTop: 20 },
  auSwapBtn: { background: "none", border: "none", color: "var(--accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT, padding: 0 },
  auHint: { fontSize: 11.5, color: "var(--faint)", marginTop: 6, lineHeight: 1.5 },
  /* An <input type=password> with a reveal button beside it, so the button
     sits inside the border rather than next to it. */
  auPwWrap: { display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", paddingRight: 4 },
  auPwInput: { flex: 1, border: "none", background: "transparent", outline: "none", padding: "11px 13px", fontSize: 13.5, fontFamily: FONT, color: "var(--ink)", minWidth: 0 },
  auPwBtn: { border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", padding: 7, display: "grid", placeItems: "center", borderRadius: 8 },

  auBrandSide: { background: "var(--bulk-bg)", color: "var(--bulk-ink)", padding: "46px 44px", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" },
  auBrandGlow: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(560px 400px at 80% 12%, rgba(10,186,181,.26), transparent 62%)" },
  auBrandInner: { position: "relative", zIndex: 1, maxWidth: 400 },
  auBrandTitle: { fontSize: 29, fontWeight: 800, letterSpacing: -0.9, lineHeight: 1.2, margin: "0 0 14px" },
  auBrandText: { fontSize: 14, lineHeight: 1.68, color: "var(--bulk-mute)", margin: 0 },
  auPoint: { display: "flex", alignItems: "flex-start", gap: 11, marginTop: 17, fontSize: 13.5, lineHeight: 1.55 },
  auPointIcon: { flexShrink: 0, marginTop: 2, color: "var(--bulk-ink)", opacity: 0.75 },
};

/* ----------------------------------------------------------------------
   Tenant brand tokens

   An organization's colour reaches the interface as a set of CSS variables
   layered over the theme, so switching tenant repaints the app without any
   component knowing a tenant exists.

   Five values per brand, not one, because a single hex cannot do all five
   jobs: a fill needs ink that reads on it, body text on a white surface needs
   to be darker than the fill, and the same text on a dark surface needs to be
   lighter.

   These used to be a hand-checked lookup table of seven approved colours.
   Organizations now pick any colour they like, so they are computed instead —
   see domain/colour.js, where each derived value is walked until it actually
   clears 4.5:1 against the surface it lands on. A sweep of 1440 colours across
   the whole hue wheel produces no failures, which a fixed nudge would not.
---------------------------------------------------------------------- */

/* The variables to spread onto the app's root element for a given tenant.
   React writes custom properties in a style object through unchanged, so this
   is an ordinary inline style and needs no stylesheet surgery.

   In light mode the sidebar is a solid slab of the brand colour, so it takes
   the fill and its ink wholesale. In dark mode the sidebar is near-black in
   every theme and only the highlights carry colour, which is why the two
   branches differ rather than one being derived from the other. */
export function orgVars(org, theme) {
  if (!org?.accent) return null;
  const t = brandTokens(org.accent);
  const fill = t.fill, ink = t.ink;
  const dark = theme === "dark";

  /* The sidebar's secondary tones — muted label text, the panel behind a
     count, the hairline borders — are all the ink at a lower alpha. Which ink
     that is has to follow the brand: the original palette hardcoded
     rgba(4,48,46,…) because a Tiffany slab takes deep teal ink, but the same
     values over indigo would be near-black on near-black. So the alphas are
     kept and the base is swapped, decided by whether the ink is the light one
     or a dark one. */
  const onLight = luminance(ink) < 0.5;
  const veil = (a) => (onLight ? rgba(ink, a) : `rgba(255,255,255,${a})`);

  return {
    /* The neutrals first, so the accent block below can override any of them.
       Every surface, line and ink in the theme is a near-desaturated version of
       the brand hue — without this, a violet sidebar sits on the teal-green
       ground the original palette was built from and the two read as different
       designs stuck together. */
    ...neutralVars(fill, dark),

    "--accent-fill": fill,
    "--accent-fill-hover": fill,
    "--on-accent": ink,
    "--accent": dark ? t.textDark : t.text,
    "--accent-soft": dark ? t.softDark : t.soft,

    ...(dark ? {
      /* The dark sidebar stays near-black in every brand — only its highlights
         carry colour, so these are all low-alpha washes of the fill. The logo
         tile is the exception: it is a solid chip of the brand, the same as it
         is in light mode, or CCM would show a teal mark on a dark screen and
         an indigo one on a light screen. */
      "--logo-bg": fill,
      "--logo-ink": ink,
      "--sidebar-panel": rgba(fill, ".10"),
      "--sidebar-border": rgba(fill, ".20"),
      "--sidebar-hover": rgba(fill, ".14"),
      "--sidebar-active": rgba(fill, ".22"),
      "--sidebar-active-ink": t.textDark,
    } : {
      "--sidebar": fill,
      "--sidebar-ink": ink,
      "--sidebar-mute": veil(onLight ? ".70" : ".78"),
      "--sidebar-panel": onLight ? "rgba(255,255,255,.26)" : "rgba(255,255,255,.16)",
      "--sidebar-border": veil(onLight ? ".14" : ".22"),
      "--sidebar-hover": onLight ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.16)",
      "--sidebar-active": "#FFFFFF",
      "--sidebar-active-ink": t.text,
      "--logo-bg": "#FFFFFF",
      "--logo-ink": t.text,
    }),
  };
}

export const CSS = `
  [data-theme="light"] {
    --bg:#F1F7F6; --surface:#FFFFFF; --surface-2:#F7FBFA; --surface-3:#ECF4F3;
    --ink:#0A2E2B; --ink-2:#2A4E4A; --mute:#5F7A77; --faint:#93ACA9;
    --line:#DFEBE9; --line-soft:#EEF5F4;

    --sidebar:#0ABAB5; --sidebar-ink:#04302E; --sidebar-mute:rgba(4,48,46,.70);
    --sidebar-panel:rgba(255,255,255,.26); --sidebar-border:rgba(4,48,46,.14);
    --sidebar-hover:rgba(255,255,255,.34);
    --sidebar-active:#FFFFFF; --sidebar-active-ink:#065E5A;
    --logo-bg:#FFFFFF; --logo-ink:#0B7873;

    --accent:#0B7873; --accent-soft:#E2F6F5; --accent-fill:#0ABAB5;
    --accent-fill-hover:#06A5A0; --on-accent:#04302E;

    --good:#0F7B3E; --good-soft:#E6F7ED; --on-good:#FFFFFF;
    --danger:#B4232B; --danger-soft:#FDEFEF; --danger-line:#F7D6D6;
    --warn:#96540A; --warn-soft:#FDF4E6;

    --bulk-bg:#04302E; --bulk-ink:#EAF7F6; --bulk-mute:#8FBDB9;
    --bulk-btn:rgba(255,255,255,.10); --bulk-border:rgba(255,255,255,.14); --bulk-danger:#FCA5A5;

    --shadow-1:0 1px 3px rgba(10,46,43,.06);
    --shadow-2:0 10px 30px rgba(10,46,43,.14);
    --shadow-3:0 12px 34px rgba(4,48,46,.30);
    --scrim:rgba(6,34,32,.42); --track:#CFE1DF;

    --v-mva:#B4123C;      --v-mva-bg:#FDEFF2;
    --v-ssdi:#4338CA;     --v-ssdi-bg:#EEEFFD;
    --v-medicare:#B01A6B; --v-medicare-bg:#FDEFF7;
    --v-aca:#B54309;      --v-aca-bg:#FDF2E9;
    --v-auto_ins:#1D4ED8; --v-auto_ins-bg:#EAF0FE;
    --v-home_ins:#6D28D9; --v-home_ins-bg:#F3EEFE;
    --v-pest:#15803D;     --v-pest-bg:#E9F8EF;
    --v-home_svc:#8A5A06; --v-home_svc-bg:#FDF6E8;
    color-scheme: light;
  }

  [data-theme="dark"] {
    --bg:#081514; --surface:#10201E; --surface-2:#152A27; --surface-3:#1B3733;
    --ink:#E9F5F3; --ink-2:#C2DAD7; --mute:#8CA6A3; --faint:#6D8885;
    --line:#22403B; --line-soft:#1A302C;

    --sidebar:#041917; --sidebar-ink:#D6F1EE; --sidebar-mute:#7FA3A0;
    --sidebar-panel:rgba(10,186,181,.08); --sidebar-border:rgba(10,186,181,.18);
    --sidebar-hover:rgba(10,186,181,.14);
    --sidebar-active:rgba(10,186,181,.20); --sidebar-active-ink:#7FF0E6;
    --logo-bg:#0ABAB5; --logo-ink:#04302E;

    --accent:#5EEAD4; --accent-soft:rgba(10,186,181,.15); --accent-fill:#0ABAB5;
    --accent-fill-hover:#2ED3CD; --on-accent:#04302E;

    --good:#4ADE80; --good-soft:rgba(74,222,128,.14); --on-good:#052E16;
    --danger:#FCA5A5; --danger-soft:rgba(248,113,113,.13); --danger-line:rgba(248,113,113,.26);
    --warn:#FCD34D; --warn-soft:rgba(252,211,77,.12);

    --bulk-bg:#0ABAB5; --bulk-ink:#04302E; --bulk-mute:rgba(4,48,46,.62);
    --bulk-btn:rgba(4,48,46,.12); --bulk-border:rgba(4,48,46,.18); --bulk-danger:#6B1218;

    --shadow-1:0 1px 3px rgba(0,0,0,.40);
    --shadow-2:0 10px 30px rgba(0,0,0,.50);
    --shadow-3:0 12px 34px rgba(0,0,0,.55);
    --scrim:rgba(2,12,11,.62); --track:#22403B;

    --v-mva:#FDA4AF;      --v-mva-bg:rgba(244,63,94,.16);
    --v-ssdi:#A5B4FC;     --v-ssdi-bg:rgba(99,102,241,.18);
    --v-medicare:#F9A8D4; --v-medicare-bg:rgba(236,72,153,.16);
    --v-aca:#FDBA74;      --v-aca-bg:rgba(249,115,22,.16);
    --v-auto_ins:#93C5FD; --v-auto_ins-bg:rgba(59,130,246,.18);
    --v-home_ins:#C4B5FD; --v-home_ins-bg:rgba(139,92,246,.18);
    --v-pest:#86EFAC;     --v-pest-bg:rgba(34,197,94,.16);
    --v-home_svc:#FCD34D; --v-home_svc-bg:rgba(234,179,8,.15);
    color-scheme: dark;
  }

  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 9px; height: 9px; }
  ::-webkit-scrollbar-thumb { background: var(--track); border-radius: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::placeholder { color: var(--faint); opacity: 1; }

  /* Native dropdowns don't inherit theme colours reliably — state them outright,
     or dark mode renders near-white text on the browser's default white popup. */
  select { color-scheme: inherit; }
  select option, select optgroup {
    background-color: var(--surface);
    color: var(--ink);
  }
  select option:disabled { color: var(--faint); }

  /* ---- the CRM shell --------------------------------------------------
     Everything here is a transition on transform, opacity or colour. Nothing
     animates a property that forces layout, which is what keeps a 60-row table
     smooth while it is being sorted and filtered. */

  .brand-btn:hover { background: var(--sidebar-hover); border-color: var(--sidebar-border); }

  /* Nav items slide a little towards the content they open, and the active one
     grows a marker on its leading edge rather than only changing colour —
     position should be readable without relying on the fill alone. */
  .nav-item { position: relative; }
  .nav-item::before {
    content: ""; position: absolute; left: 0; top: 50%; width: 3px; height: 0;
    border-radius: 3px; background: currentColor; opacity: .55;
    transform: translateY(-50%); transition: height .22s cubic-bezier(.2,.75,.3,1);
  }
  .nav-item:hover { background: var(--sidebar-hover); color: var(--sidebar-ink); transform: translateX(2px); }
  .nav-item:hover::before { height: 14px; }
  .nav-item[aria-current="page"]::before { height: 20px; opacity: 1; }
  .nav-item { transition: background .16s, color .16s, transform .16s; }

  /* The segmented control's thumb moves rather than blinking between halves. */
  .seg { position: relative; }
  .seg-btn { position: relative; z-index: 1; transition: color .18s; }
  .seg-thumb {
    position: absolute; top: 3px; bottom: 3px; border-radius: 8px;
    background: var(--surface); box-shadow: var(--shadow-1);
    transition: transform .26s cubic-bezier(.2,.75,.3,1), width .26s cubic-bezier(.2,.75,.3,1);
  }

  /* Stage chips and row buttons get a press, so a click feels like one on a
     trackpad where there is no travel. */
  .chip:active, .row-btn:active, .row-btn-go:active,
  .btn-fill:active, .btn-ghost:active, .seg-btn:active { transform: scale(.97); }
  .chip, .row-btn, .row-btn-go, .btn-fill, .btn-ghost { transition: transform .12s, background .14s, color .14s, border-color .14s; }

  /* Table rows: a soft wash and a leading edge in the tenant's colour, which
     reads at a glance on a dense list far better than a grey fill. */
  .trow { position: relative; }
  .trow > td:first-child::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
    background: var(--accent-fill); transform: scaleY(0); transform-origin: center;
    transition: transform .18s cubic-bezier(.2,.75,.3,1);
  }
  .trow:hover > td:first-child::before { transform: scaleY(1); }
  .trow:hover .row-btn { background: var(--accent-fill); color: var(--on-accent); }

  /* The sticky header sits over scrolling content, so it needs to be opaque in
     spirit — a blur keeps it legible without a hard band across the table. */
  .thead-cell { backdrop-filter: saturate(1.4) blur(6px); }

  /* Rows arrive in sequence when a view or filter changes. Capped low: this is
     a data table, and a long cascade on every keystroke would be seasickness. */
  @keyframes row-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: none; }
  }
  .trow-in { animation: row-in .3s cubic-bezier(.2,.75,.3,1) both; animation-delay: var(--d, 0ms); }

  /* Panels arrive from the edge they belong to. */
  @keyframes drawer-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes modal-in { from { transform: translate(-50%, -48%) scale(.97); opacity: 0; } to { transform: translate(-50%,-50%) scale(1); opacity: 1; } }
  @keyframes scrim-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toast-in { from { transform: translate(-50%, 14px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  .drawer { animation: drawer-in .26s cubic-bezier(.2,.75,.3,1) both; }
  .modal { animation: modal-in .24s cubic-bezier(.2,.75,.3,1) both; }
  .scrim { animation: scrim-in .2s ease both; }
  .toast { animation: toast-in .28s cubic-bezier(.2,.9,.3,1) both; }

  .card:hover { transform: translateY(-2px); box-shadow: var(--shadow-2); border-color: var(--accent-fill); }
  .advance-btn:hover { background: var(--accent-fill); color: var(--on-accent); }
  .act-primary:hover, .btn-fill:hover { background: var(--accent-fill-hover); }
  .act-win:hover, .d-respond:hover { filter: brightness(1.08); }
  .d-next:hover { background: var(--accent-fill); color: var(--on-accent); }
  .d-remove:hover { filter: brightness(1.06); }
  .btn-ghost:hover { border-color: var(--accent-fill); color: var(--ink); }

  /* The Gmail hand-off links are real anchors so no popup blocker can eat
     them, which means undoing the browser's link styling. */
  a.row-btn, a.btn-fill { text-decoration: none; }
  .recipient:last-child { border-bottom: none; }
  .boot code { font-size: 12px; background: var(--surface-3); padding: 1px 5px; border-radius: 4px; }

  .trow:hover { background: var(--surface-2); }
  .row-btn:hover { background: var(--accent-fill) !important; color: var(--on-accent); }
  .row-btn-go:hover { background: var(--good) !important; color: var(--on-good); }
  .chip:hover { border-color: var(--accent-fill); }
  .seg-btn:hover { color: var(--ink); }
  .bulk-btn:hover { filter: brightness(1.14); }
  .bulk-clear:hover { color: var(--bulk-ink); }
  .link-btn:hover { text-decoration: underline; }
  .drop:hover { border-color: var(--accent-fill); }
  .tag-chip:hover { background: var(--accent-fill); color: var(--on-accent); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  .card { cursor: grab; }
  .card:active { cursor: grabbing; }
  .col { transition: background .14s, outline-color .14s; }

  input:focus, select:focus, textarea:focus { border-color: var(--accent-fill) !important; box-shadow: 0 0 0 3px var(--accent-soft); }
  button:disabled { opacity: .45; cursor: not-allowed; filter: none !important; }
  :focus-visible { outline: 2px solid var(--accent-fill); outline-offset: 2px; }

  /* ---- landing and sign-in ---- */

  /* Two slow, out-of-phase drifts behind the hero. Long durations and small
     distances on purpose: the page should feel alive when you look at it, not
     move while you are reading it. */
  @keyframes lp-drift-a {
    0%   { transform: translate3d(0,0,0) scale(1); }
    100% { transform: translate3d(6%, 4%, 0) scale(1.12); }
  }
  @keyframes lp-drift-b {
    0%   { transform: translate3d(0,0,0) scale(1.08); }
    100% { transform: translate3d(-5%, 6%, 0) scale(1); }
  }
  .lp-blob { position: absolute; border-radius: 50%; filter: blur(58px); will-change: transform; }
  .lp-blob-a { animation: lp-drift-a 19s ease-in-out infinite alternate; }
  .lp-blob-b { animation: lp-drift-b 24s ease-in-out infinite alternate; }

  /* The headline arrives a word at a time. One element per word rather than
     per character: a per-character split is a lot of DOM for a line this long
     and reads as a gimmick at this size. */
  @keyframes lp-word {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: none; }
  }
  .lp-word { display: inline-block; animation: lp-word .6s cubic-bezier(.2,.75,.3,1) both; animation-delay: var(--d, 0ms); }

  /* A soft light that follows the pointer, tinted with the organization's own
     colour. Painted behind the card's content, which is why the children are
     lifted a layer. */
  .lp-card::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: 0;
    background: radial-gradient(360px circle at var(--mx, 50%) var(--my, 0%), var(--spot, transparent), transparent 62%);
    opacity: 0; transition: opacity .3s; pointer-events: none;
  }
  .lp-card:hover::before { opacity: 1; }
  .lp-card > * { position: relative; z-index: 1; }
  .lp-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-2); border-color: var(--accent-fill); }
  .lp-card:hover .lp-enter { gap: 9px; }
  .lp-enter { transition: gap .18s; }
  /* The brand bar thickens from the top edge, which reads as the card lifting
     rather than as the bar growing. */
  .lp-bar { transform-origin: top; transition: transform .28s cubic-bezier(.2,.75,.3,1); }
  .lp-card:hover .lp-bar { transform: scaleY(2.2); }
  .lp-stat { transition: background .22s, border-color .22s; }
  .lp-card:hover .lp-stat { background: var(--surface); border-color: var(--line); }

  .lp-add { position: relative; overflow: hidden; }
  .lp-add:hover { border-color: var(--accent-fill); background: var(--accent-soft); color: var(--accent); }
  .lp-add:hover .lp-add-icon { transform: rotate(90deg) scale(1.06); }
  .lp-add-icon { transition: transform .3s cubic-bezier(.2,.75,.3,1); }

  /* Unread mail is the one thing on this page worth an eye-catch. */
  @keyframes lp-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--accent-soft); }
    50%      { box-shadow: 0 0 0 5px transparent; }
  }
  .lp-unread { animation: lp-pulse 2.6s ease-in-out infinite; }
  .lp-icon-btn:hover { border-color: var(--accent-fill); color: var(--ink); }
  .lp-swatch:hover { transform: scale(1.06); }
  .link-chip:hover { background: var(--accent-fill); color: var(--on-accent); }
  .map-chip:hover { border-color: var(--accent-fill); box-shadow: var(--shadow-1); }
  .map-chip:active { cursor: grabbing; }
  .map-chip button:hover { opacity: 1; background: rgba(0,0,0,.08); }
  @media (max-width: 880px) {
    /* The board becomes one column: the pool above the fields, which is the
       order they are used in anyway. */
    .modal { width: 94vw !important; }
  }
  .vt-opt:hover { border-color: var(--accent-fill); }
  .cp-square, .cp-rail { user-select: none; }
  .au-pw-btn:hover { color: var(--ink); }
  .au-pw-wrap:focus-within { border-color: var(--accent-fill); box-shadow: 0 0 0 3px var(--accent-soft); }

  /* Cards arrive in sequence rather than all at once — the delay is set per
     card as an inline custom property, so adding an organization doesn't mean
     touching this stylesheet. */
  @keyframes lp-rise {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: none; }
  }
  .lp-rise { animation: lp-rise .42s cubic-bezier(.22,.68,.36,1) both; animation-delay: var(--d, 0ms); }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
    .card:hover { transform: none; }
    .lp-card:hover { transform: none; }
    .lp-card:hover .lp-bar { transform: none; }
    .nav-item:hover { transform: none; }
    /* The "both" fill mode above would otherwise leave anything animated in
       stuck at opacity 0 once the animation itself is switched off. */
    .lp-rise, .lp-word, .trow-in, .drawer, .modal, .scrim, .toast {
      opacity: 1 !important; transform: none !important;
    }
    .modal { transform: translate(-50%, -50%) !important; }
    .toast { transform: translateX(-50%) !important; }
  }
  @media (max-width: 900px) {
    .drawer { width: 100vw !important; }
  }
  @media (max-width: 560px) {
    /* Who you're signed in as is repeated in the footer, so on a phone it can
       leave the header — the sign-out button beside it cannot. */
    .lp-who { display: none !important; }
  }
  @media (max-width: 860px) {
    .au-app { grid-template-columns: 1fr !important; }
    /* The brand panel is decoration. On a phone it would push the form off
       the first screen, so it goes rather than being stacked above it. */
    .au-brand { display: none !important; }
  }
`;

