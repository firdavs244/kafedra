// Guruhlangan ustunli grafik (2 seriya). Qoidalar (dataviz): ustun ≤ 24px,
// yuqori uchi 4px yumaloq, ustunlar orasida 2px bo'shliq, bitta o'q, ingichka
// panjara, legenda doim bor, har bir guruhga hover/focus tooltip, jadval ko'rinishi.
import { useMemo, useState } from 'react';

const W = 560;
const H = 230;
const PAD = { l: 38, r: 8, t: 10, b: 34 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

function colPath(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
}

export default function BarChart({ data, series, unit = '', format = (v) => String(Math.round(v)), maxValue, table = false }) {
  const [hover, setHover] = useState(null);
  const max = useMemo(() => maxValue || niceMax(Math.max(1, ...data.flatMap((d) => d.values))), [data, maxValue]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, (band * 0.62 - 2) / series.length);
  const groupW = barW * series.length + 2 * (series.length - 1);
  const y = (v) => PAD.t + innerH - (v / max) * innerH;

  if (table) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              {series.map((s) => (
                <th key={s.name} className="right">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.full || d.label}</td>
                {d.values.map((v, i) => (
                  <td key={series[i].name} className="num right">
                    {format(v)}
                    {unit}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const hd = hover != null ? data[hover] : null;
  return (
    <div className="chart">
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.map((s) => s.name).join(' va ')} grafigi`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, gi) => {
          const cx = PAD.l + band * gi + band / 2;
          const x0 = cx - groupW / 2;
          return (
            <g key={d.label} className={hover === gi ? 'hover' : ''}>
              <g>
                {d.values.map((v, si) => {
                  const bx = x0 + si * (barW + 2);
                  const by = y(Math.max(0, v));
                  return <path key={series[si].name} d={colPath(bx, by, barW, PAD.t + innerH - by, 4)} fill={series[si].color} />;
                })}
              </g>
              <text className="axis-text" x={cx} y={H - PAD.b + 16} textAnchor="middle">
                {d.label}
              </text>
              <rect
                className="bar-hit"
                x={PAD.l + band * gi}
                y={PAD.t}
                width={band}
                height={innerH + 22}
                tabIndex={0}
                aria-label={`${d.full || d.label}: ${d.values.map((v, i) => `${series[i].name} ${format(v)}${unit}`).join(', ')}`}
                onPointerEnter={() => setHover(gi)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(gi)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hd ? (
        <div className="tooltip" style={{ left: `${((PAD.l + band * hover + band / 2) / W) * 100}%`, top: `${(y(Math.max(...hd.values)) / H) * 100}%` }}>
          <div className="tt-h">{hd.full || hd.label}</div>
          {hd.values.map((v, i) => (
            <div key={series[i].name} className="tt-row">
              <span>
                <i style={{ background: series[i].color }} />
                {series[i].name}
              </span>
              <b>
                {format(v)}
                {unit}
              </b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
