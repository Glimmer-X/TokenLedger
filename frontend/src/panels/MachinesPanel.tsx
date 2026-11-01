import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Device, MachineUsage, View } from "../api/types";
import { Segs } from "../components/Meters";
import { Panel } from "../components/Panel";
import type { Lang, Strings } from "../i18n/strings";
import { dotDate, hhmm, percent, relativeTime, tokens, usd } from "../lib/format";
import { type MachineRow, OTHER_ID, machineRows, machineState } from "../lib/machines";
import { Breakdown, Lanes } from "./MachineCharts";

const DEVICES_EVERY_MS = 5 * 60 * 1000;

// 06 · the machines in the ledger: one card each (online or not, its share of the range),
// what each machine used in a day / week / month of your choice, and its days in the range.
export function MachinesPanel({ view, t, lang, className }: { view: View; t: Strings; lang: Lang; className: string }) {
  const cloud = view.status.scope === "ledger";
  const devices = useDevices(cloud);
  const all = useAllDays(view);
  useMinuteClock();

  const infos = view.status.machines;
  const rows = useMemo(() => machineRows(view.machines, infos, devices, t.machines.other), [view.machines, infos, devices, t]);
  const allRows = useMemo(() => (all ? machineRows(all, infos, devices, t.machines.other) : null), [all, infos, devices, t]);
  const machines = rows.filter((r) => r.id !== OTHER_ID);
  const online = machines.filter((r) => machineState(r).presence === "online").length;
  const total = rows.reduce((s, r) => s + r.tokens, 0) || 1;

  return (
    <Panel
      id="s06"
      index="06"
      code="MC"
      title="Machines"
      sub={t.panels.machines}
      className={`machines ${className}`}
      meta={<span className="mono">{cloud ? t.machines.onlineCount(online, machines.length) : t.machines.count(machines.length)}</span>}
    >
      <MachineDefs />
      <div className="mc-cards">
        {rows.map((r, i) => (
          <MachineCard key={r.id} row={r} share={r.tokens / total} cloud={cloud} t={t} lang={lang} index={i} />
        ))}
      </div>
      <div className="mc-body">
        <section className="mc-period">
          {allRows && all ? (
            <Breakdown rows={allRows} days={all.days} today={view.status.today} t={t} lang={lang} />
          ) : (
            <p className="mc-wait mono">{t.loading}</p>
          )}
        </section>
        <section className="mc-days">
          <div className="mc-sh">
            <span className="lab">
              {t.machines.daily} <span className="sub">· {t.machines.followsRange}</span>
            </span>
          </div>
          <Lanes days={view.machines.days} rows={rows} t={t} lang={lang} />
        </section>
      </div>
    </Panel>
  );
}

function MachineCard({ row, share, cloud, t, lang, index }: { row: MachineRow; share: number; cloud: boolean; t: Strings; lang: Lang; index: number }) {
  const other = row.id === OTHER_ID;
  const state = machineState(row);
  const presence = other ? null : state.presence;
  const when = state.seenAt ? relativeTime(state.seenAt, lang) : null;
  const status =
    presence === "online" ? t.machines.online : presence === "offline" ? `${t.machines.offline} · ${when}` : presence === "idle" ? t.machines.synced(when!) : t.machines.unknown;
  const seenTitle = state.seenAt ? `${cloud ? t.machines.lastSync("") : t.machines.lastData("")}${new Date(state.seenAt).toLocaleString()}` : undefined;
  const version = row.device?.app_version ?? row.info?.app_version ?? null;
  const facts = other
    ? [t.machines.otherNote]
    : [
        row.info?.this_machine && !cloud ? t.machines.thisMachine : row.os,
        row.info?.last_day ? t.machines.dataTo(dotDate(row.info.last_day)) : null,
      ].filter(Boolean);

  return (
    <article className={`mc-card ${other ? "other" : ""}`} style={{ animationDelay: `${0.15 + index * 0.05}s` }}>
      <header>
        <i className="sw" style={{ background: row.look.css }} />
        <span className="pix code">{row.code}</span>
        {presence && (
          <span className={`presence ${presence}`} title={seenTitle}>
            <i />
            {status}
          </span>
        )}
      </header>
      <div className="nm" title={row.label}>
        {row.label}
      </div>
      <div className="facts mono" title={other ? t.machines.otherNote : [row.os, version].filter(Boolean).join(" · ")}>
        {facts.join(" · ")}
      </div>
      <div className="fig">
        <b className="num">{tokens(row.tokens, lang)}</b>
        <span className="pct">{percent(share, share < 0.1 ? 1 : 0)}</span>
        <span className="cost mono">{row.cost == null ? "" : usd(row.cost, 0)}</span>
      </div>
      <Segs fraction={share} n={28} color="var(--ink)" delay={0.3 + index * 0.05} />
      {cloud && state.seenAt && presence !== "online" && !other && <div className="seen mono">{t.machines.lastSync(hhmm(new Date(state.seenAt)))}</div>}
    </article>
  );
}

// The textures machines are drawn with (lib/machines.ts LOOKS), once per page.
function MachineDefs() {
  return (
    <svg className="mc-defs" aria-hidden="true" width="0" height="0">
      <defs>
        {[4, 3].map((h) => (
          <g key={h}>
            <pattern id={`mc-hatch-${h}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.6" height="4" fill={`var(--h${h})`} />
            </pattern>
            <pattern id={`mc-dots-${h}`} width="3.5" height="3.5" patternUnits="userSpaceOnUse">
              <circle cx="1.75" cy="1.75" r="1.05" fill={`var(--h${h})`} />
            </pattern>
          </g>
        ))}
      </defs>
    </svg>
  );
}

// The cloud's record of each signed-in machine (last contact); none on the local dashboard.
function useDevices(cloud: boolean): Device[] | null {
  const [devices, setDevices] = useState<Device[] | null>(null);
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    const load = () =>
      api
        .devices()
        .then((d) => live && setDevices(d.devices))
        .catch(() => live && setDevices(null));
    load();
    const timer = window.setInterval(load, DEVICES_EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [cloud]);
  return devices;
}

// Every day in the ledger per machine, for stepping through periods outside the range.
function useAllDays(view: View): MachineUsage | null {
  const [all, setAll] = useState<MachineUsage | null>(null);
  const own = view.range === "all" ? view.machines : null;
  useEffect(() => {
    if (own) return;
    let live = true;
    api
      .view("all")
      .then((v) => live && setAll(v.machines))
      .catch(() => live && setAll(null));
    return () => {
      live = false;
    };
  }, [own, view.status.today]);
  return own ?? all;
}

// Re-renders once a minute, so "online" and "x minutes ago" stay true while the page is open.
function useMinuteClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);
}
