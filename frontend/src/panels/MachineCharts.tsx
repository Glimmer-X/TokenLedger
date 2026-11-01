import { useMemo, useState } from "react";
import { Toggle } from "../components/Toggle";
import { TipRow, useTooltip } from "../components/Tooltip";
import type { Lang, Strings } from "../i18n/strings";
import { dotDate, monthCode, percent, tokenParts, tokens } from "../lib/format";
import { type Grain, type MachineRow, type Period, maxOffset, period, periodTotals } from "../lib/machines";
import { useSize } from "../lib/useSize";

// -- what each machine used in one day / week / month ----------------------------------------

interface Slice {
  row: MachineRow;
  value: number;
}

export function Breakdown({ rows, days, today, t, lang }: {
  rows: MachineRow[];
  days: string[];
  today: string;
  t: Strings;
  lang: Lang;
}) {
  const [grain, setGrain] = useState<Grain>("day");
  const [offset, setOffset] = useState(1); // yesterday: the last whole day
  const last = days.length ? maxOffset(grain, today, days[0]) : 0;
  const p = period(grain, today, Math.min(offset, last));
  const totals = useMemo(() => periodTotals(days, rows, p), [days, rows, p.start, p.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const slices: Slice[] = rows
    .map((row) => ({ row, value: totals.get(row.id) ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const sum = slices.reduce((s, x) => s + x.value, 0);

  const pick = (g: Grain) => {
    setGrain(g);
    setOffset(g === "day" ? 1 : 0);
  };

  return (
    <>
      <div className="mc-sh">
        <span className="lab">{t.machines.period}</span>
        <Toggle
          className="mc-grain"
          value={grain}
          onChange={pick}
          label={t.machines.period}
          options={(["day", "week", "month"] as Grain[]).map((g) => ({ value: g, label: t.machines.grains[g] }))}
        />
        <div className="mc-step">
          <button className="sq" disabled={p.offset >= last} onClick={() => setOffset(p.offset + 1)} aria-label={t.machines.earlier}>
            ‹
          </button>
          <span className="when">
            <b>{periodName(grain, p, t)}</b>
            <small className="mono">{periodDates(grain, p)}</small>
          </span>
          <button className="sq" disabled={p.offset <= 0} onClick={() => setOffset(p.offset - 1)} aria-label={t.machines.later}>
            ›
          </button>
        </div>
      </div>
      <div className="mc-split">
        <div className="mc-graphic">
          <Ring slices={slices} sum={sum} lang={lang} label={periodName(grain, p, t)} />
        </div>
        <ol className="mc-legend">
          {slices.map((s) => (
            <li key={s.row.id}>
              <i className="sw" style={{ background: s.row.look.css }} />
              <span className="pix code">{s.row.code}</span>
              <span className="nm">{s.row.label}</span>
              <span className="r">{tokens(s.value, lang)}</span>
              <span className="r dim pct">{percent(s.value / sum, s.value / sum < 0.1 ? 1 : 0)}</span>
            </li>
          ))}
          {slices.length === 0 && <li className="none mono">{t.machines.noUsage}</li>}
          {slices.length > 1 && (
            <li className="sum">
              <span />
              <span />
              <span className="nm">{t.machines.total}</span>
              <span className="r">{tokens(sum, lang, 2)}</span>
              <span className="r dim pct">100%</span>
            </li>
          )}
        </ol>
      </div>
    </>
  );
}

function periodName(grain: Grain, p: Period, t: Strings): string {
  const named = {
    day: [t.machines.today, t.machines.yesterday],
    week: [t.machines.thisWeek, t.machines.lastWeek],
    month: [t.machines.thisMonth, t.machines.lastMonth],
  }[grain][p.offset];
  if (named) return named;
  if (grain === "month") return `${p.start.slice(0, 4)}.${p.start.slice(5, 7)}`;
  return dotDate(p.start) + (grain === "week" ? ` – ${dotDate(p.end)}` : "");
}

function periodDates(grain: Grain, p: Period): string {
  if (grain === "day") return `${p.start.slice(0, 4)}.${dotDate(p.start)}`;
  return `${dotDate(p.start)} – ${dotDate(p.end)}`;
}

// Ring ticks handed out by largest remainder, so they add up.
function allot(slices: Slice[], sum: number, n: number): number[] {
  if (!sum) return slices.map(() => 0);
  const exact = slices.map((s) => (s.value / sum) * n);
  const out = exact.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    out[i]++;
  }
  return out;
}

const RING_TICKS = 72;

// A segmented ring: 72 ticks, each machine's share of them in its look, the total inside.
function Ring({ slices, sum, lang, label }: { slices: Slice[]; sum: number; lang: Lang; label: string }) {
  const size = 200;
  const c = size / 2;
  const counts = allot(slices, sum, RING_TICKS);
  const owner: (Slice | null)[] = [];
  slices.forEach((s, i) => {
    for (let k = 0; k < counts[i]; k++) owner.push(s);
  });
  const [num, unit] = tokenParts(sum, lang, 2);
  return (
    <svg className="mc-ring" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {Array.from({ length: RING_TICKS }, (_, k) => {
        const a = (k / RING_TICKS) * Math.PI * 2 - Math.PI / 2;
        const s = owner[k] ?? null;
        return (
          <g key={k} transform={`translate(${c + Math.cos(a) * 80} ${c + Math.sin(a) * 80}) rotate(${(a * 180) / Math.PI})`}>
            <rect className={s ? "tick on" : "tick"} x={-11} y={-2.6} width={22} height={5.2} fill={s ? s.row.look.fill : undefined} style={{ animationDelay: `${0.2 + k * 0.006}s` }} />
          </g>
        );
      })}
      <text className="ring-num" x={c} y={c + 4} textAnchor="middle">
        {sum ? num : "0"}
        <tspan className="ring-unit">{sum ? unit : ""}</tspan>
      </text>
      <text className="ring-lab" x={c} y={c + 24} textAnchor="middle">
        {label}
      </text>
    </svg>
  );
}

// -- every day of the range, one lane per machine ---------------------------------------------

const LANE = { label: 170, narrowLabel: 46, right: 76, axis: 22, gap: 6 };

// Small multiples: each machine its own lane of daily columns, scaled to its own peak, so
// when each machine was busy reads directly; the lane's total and peak sit on its right.
export function Lanes({ days, rows, t, lang }: { days: string[]; rows: MachineRow[]; t: Strings; lang: Lang }) {
  const [ref, { width: W, height: H }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tip = useTooltip();
  const n = days.length;
  const narrow = W < 560;
  const left = narrow ? LANE.narrowLabel : LANE.label;
  const iw = W - left - LANE.right;
  const laneH = rows.length ? (H - LANE.axis) / rows.length : 0;
  const pitch = n ? iw / n : 0;
  const bw = Math.max(1, Math.min(14, pitch - (pitch > 4 ? 1.5 : pitch > 2 ? 0.6 : 0)));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - left) / pitch);
    if (i < 0 || i >= n) return leave();
    setHover(i);
    showDay(tip, e, days[i], rows, i, t, lang);
  };
  const leave = () => {
    setHover(null);
    tip.hide();
  };

  return (
    <div className="fill mc-lanes" ref={ref} style={{ ["--min" as string]: `${Math.max(180, rows.length * 40 + LANE.axis)}px` }}>
      {W > 0 && H > 0 && n > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.machines.daily} onPointerMove={onMove} onPointerLeave={leave}>
          {rows.map((row, li) => {
            const top = li * laneH;
            const base = top + laneH - LANE.gap / 2;
            const ih = laneH - LANE.gap - 2;
            const peak = Math.max(...row.values, 0);
            return (
              <g key={row.id}>
                <line className="gl" x1={left} x2={W - LANE.right + 8} y1={base} y2={base} />
                <rect className="lane-sw" x={0} y={top + laneH / 2 - 5} width={10} height={10} fill={row.look.fill} />
                <text className="lane-code" x={18} y={top + laneH / 2 + 4}>
                  {row.code}
                </text>
                {!narrow && (
                  <text className="lane-name" x={56} y={top + laneH / 2 + 4}>
                    {clip(row.label, 17)}
                  </text>
                )}
                {row.values.map((v, i) =>
                  v > 0 ? (
                    <rect
                      key={i}
                      className={`grow-y ${hover != null && hover !== i ? "faded" : ""}`}
                      x={left + i * pitch + (pitch - bw) / 2}
                      y={base - Math.max(1, (v / peak) * ih)}
                      width={bw}
                      height={Math.max(1, (v / peak) * ih)}
                      fill={row.look.tone}
                      style={{ animationDelay: `${(i / n) * 0.5}s` }}
                    />
                  ) : null,
                )}
                <text className="lane-total" x={W} y={top + laneH / 2 + 1} textAnchor="end">
                  {tokens(row.tokens, lang)}
                </text>
                <text className="lane-peak" x={W} y={top + laneH / 2 + 14} textAnchor="end">
                  {peak ? `${t.machines.peak} ${tokens(peak, lang)}` : ""}
                </text>
              </g>
            );
          })}
          {hover != null && <line className="xh" x1={left + (hover + 0.5) * pitch} x2={left + (hover + 0.5) * pitch} y1={0} y2={H - LANE.axis} />}
          <DayAxis days={days} x={(i) => left + (i + 0.5) * pitch} y={H - 5} />
        </svg>
      )}
    </div>
  );
}

// -- shared ---------------------------------------------------------------------------------

// Month starts, and weekly dates on short ranges, dropping any label that would touch another.
function DayAxis({ days, x, y }: { days: string[]; x: (i: number) => number; y: number }) {
  const n = days.length;
  const months = days.map((d, i) => (d.endsWith("-01") ? i : -1)).filter((i) => i >= 0);
  const weeks = n <= 60 ? days.map((_, i) => i).filter((i) => i % 7 === 0) : [];
  const shown: number[] = [];
  for (const i of [...months, ...weeks]) if (shown.every((j) => Math.abs(x(i) - x(j)) >= 40)) shown.push(i);
  return (
    <>
      {shown.map((i) => (
        <text key={days[i]} className="ax" x={x(i) + 3} y={y}>
          {days[i].endsWith("-01") ? monthCode(days[i]) : dotDate(days[i])}
        </text>
      ))}
    </>
  );
}

function showDay(tip: ReturnType<typeof useTooltip>, e: React.PointerEvent, day: string, rows: MachineRow[], i: number, t: Strings, lang: Lang) {
  const lit = rows.filter((row) => row.values[i] > 0).sort((a, b) => b.values[i] - a.values[i]);
  const total = lit.reduce((s, r) => s + r.values[i], 0);
  tip.show(
    e,
    <>
      <div className="tip-head pix">{day}</div>
      {lit.length ? (
        lit.map((row) => <TipRow key={row.id} label={<><i className="sw" style={{ background: row.look.css }} />{row.label}</>} value={tokens(row.values[i], lang, 2)} />)
      ) : (
        <TipRow label={t.tooltip.noUsage} value="" />
      )}
      {lit.length > 1 && <TipRow total label={t.tooltip.total} value={tokens(total, lang, 2)} />}
    </>,
  );
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
