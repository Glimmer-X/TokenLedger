// Machines on the dashboard: how each one is drawn, whether it is online, and the
// calendar periods (day / week / month) the machines panel can step through.

import type { Device, MachineInfo, MachineUsage } from "../api/types";

// Data colours belong to the providers, so machines are told apart by grey shade and
// texture together: solid, hatched, dotted, in three shades. Each look has an SVG fill
// (patterns defined once by <MachineDefs>) and a CSS background for swatches.
interface Look {
  fill: string;
  css: string;
  tone: string; // plain colour, for marks too thin to show a texture
}
const hatch = (c: string) => `repeating-linear-gradient(135deg, ${c} 0 1.5px, transparent 1.5px 4px)`;
const dots = (c: string) => `radial-gradient(${c} 1px, transparent 1.3px) 0 0 / 3.5px 3.5px`;
const LOOKS: Look[] = [
  { fill: "var(--h4)", css: "var(--h4)", tone: "var(--h4)" },
  { fill: "url(#mc-hatch-4)", css: hatch("var(--h4)"), tone: "var(--h4)" },
  { fill: "var(--h3)", css: "var(--h3)", tone: "var(--h3)" },
  { fill: "url(#mc-dots-4)", css: dots("var(--h4)"), tone: "var(--h4)" },
  { fill: "var(--h2)", css: "var(--h2)", tone: "var(--h2)" },
  { fill: "url(#mc-hatch-3)", css: hatch("var(--h3)"), tone: "var(--h3)" },
  { fill: "url(#mc-dots-3)", css: dots("var(--h3)"), tone: "var(--h3)" },
];
export const OTHER_LOOK: Look = { fill: "var(--line-3)", css: "var(--line-3)", tone: "var(--line-3)" };
export const lookOf = (index: number): Look => LOOKS[index % LOOKS.length];

// One machine (or the account usage no machine logged) as every part of the panel uses it.
export interface MachineRow {
  id: string;
  code: string; // "D01", or "··" for the rest
  label: string;
  os: string | null;
  look: Look;
  tokens: number; // over the dashboard's range
  cost: number | null;
  values: number[]; // per day of the dashboard's range
  info: MachineInfo | null;
  device: Device | null;
}

export const OTHER_ID = "_other";

// A machine keeps its code and look whatever the range: both follow its place in the
// ledger's machine list (`infos`), and the rows come sorted by tokens.
export function machineRows(usage: MachineUsage, infos: MachineInfo[], devices: Device[] | null, otherLabel: string): MachineRow[] {
  const order = infos.map((x) => x.id);
  for (const m of usage.machines) if (!order.includes(m.id)) order.push(m.id);
  const rows: MachineRow[] = usage.machines.map((m) => ({
    id: m.id,
    code: `D${String(order.indexOf(m.id) + 1).padStart(2, "0")}`,
    label: m.label,
    os: m.os,
    look: lookOf(order.indexOf(m.id)),
    tokens: m.tokens,
    cost: m.cost_usd,
    values: m.values,
    info: infos.find((x) => x.id === m.id) ?? null,
    device: devices?.find((d) => d.machine === m.id) ?? null,
  }));
  if (usage.other.tokens > 0) {
    rows.push({
      id: OTHER_ID,
      code: "··",
      label: otherLabel,
      os: null,
      look: OTHER_LOOK,
      tokens: usage.other.tokens,
      cost: null,
      values: usage.other.values,
      info: null,
      device: null,
    });
  }
  return rows;
}

// -- online status --------------------------------------------------------------------------

// A signed-in machine talks to the cloud every 10 minutes while TokenLedger runs on it.
const ONLINE_MINUTES = 25;
const ASLEEP_HOURS = 24;

export type Presence = "online" | "idle" | "offline" | "unknown";

export interface MachineState {
  presence: Presence;
  seenAt: string | null; // the machine's last contact (cloud) or its newest data (local)
}

export function machineState(row: MachineRow, now = Date.now()): MachineState {
  const seenAt = row.device?.last_seen_at ?? row.info?.snapshot_at ?? null;
  if (!seenAt) return { presence: "unknown", seenAt: null };
  const minutes = (now - new Date(seenAt).getTime()) / 60000;
  const presence = minutes <= ONLINE_MINUTES ? "online" : minutes <= ASLEEP_HOURS * 60 ? "idle" : "offline";
  return { presence, seenAt };
}

// -- periods ----------------------------------------------------------------------------------

export type Grain = "day" | "week" | "month";

export interface Period {
  start: string; // first day, YYYY-MM-DD
  end: string; // last day
  offset: number; // 0 = the one holding today, 1 = the one before, ...
}

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
};

// The period `offset` steps back from the one holding `today`.
export function period(grain: Grain, today: string, offset: number): Period {
  if (grain === "day") {
    const day = addDays(today, -offset);
    return { start: day, end: day, offset };
  }
  if (grain === "week") {
    const monday = addDays(today, -((toDate(today).getUTCDay() + 6) % 7) - offset * 7);
    return { start: monday, end: addDays(monday, 6), offset };
  }
  const d = toDate(today);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12));
  return { start: toDay(first), end: toDay(last), offset };
}

// How far back a grain can step before it runs out of data.
export function maxOffset(grain: Grain, today: string, firstDay: string): number {
  let n = 0;
  while (period(grain, today, n + 1).end >= firstDay && n < 400) n++;
  return n;
}

// Each row's tokens within a period, from the per-day values of `days`.
export function periodTotals(days: string[], rows: MachineRow[], p: Period): Map<string, number> {
  const from = days.findIndex((d) => d >= p.start);
  const out = new Map<string, number>();
  for (const r of rows) {
    let s = 0;
    if (from >= 0) for (let i = from; i < days.length && days[i] <= p.end; i++) s += r.values[i] ?? 0;
    out.set(r.id, s);
  }
  return out;
}
