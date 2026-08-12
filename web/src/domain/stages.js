import { createContext, useContext } from "react";
import { DAY, iso } from "./dates.js";

/* Funnel stages are user-editable, so they live in state and travel by context.
   The three lifecycle states below are NOT editable — they're what the funnel
   empties into, and the views key off them. */
export const TERMINAL = ["responded", "meeting", "closed"];

export const DEFAULT_STAGES = [
  { id: "outreach", label: "Outreach",    sub: "Not yet contacted",      accent: "#7E9895", wait: 7 },
  { id: "fu1",      label: "Follow-up 1", sub: "1 week after outreach",  accent: "#0E9F94", wait: 7 },
  { id: "fu2",      label: "Follow-up 2", sub: "2 weeks after outreach", accent: "#5B6BF0", wait: 7 },
  { id: "fu3",      label: "Follow-up 3", sub: "3 weeks after outreach", accent: "#9B5DE5", wait: 7 },
];

// dot colours for custom stages — each one legible on both themes
export const STAGE_PALETTE = ["#7E9895", "#0E9F94", "#5B6BF0", "#9B5DE5", "#E0709A",
  "#E08A4B", "#C9A227", "#4FA65B", "#3C8FC4", "#B4636F"];

export const StageCtx = createContext(DEFAULT_STAGES);
export const useStages = () => useContext(StageCtx);

export const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;


// when the next touch is due — each stage carries its own wait in days
export const nextDue = (c, stages) => {
  if (TERMINAL.includes(c.stage)) return null;
  const st = (stages || DEFAULT_STAGES).find(s => s.id === c.stage);
  if (!st) return null;
  return iso(new Date(new Date(c.stageSince).getTime() + (Number(st.wait) || 7) * DAY));
};

export const stageOf = (id, stages) => (stages || DEFAULT_STAGES).find(s => s.id === id) || null;
export const inFunnelStage = (c, stages) => !!stageOf(c.stage, stages);
export const TERMINAL_LABEL = { responded: "Replied", meeting: "Meeting set", closed: "Closed — won" };
export const labelOf = (id, stages) => stageOf(id, stages)?.label || TERMINAL_LABEL[id] || id;

