// County comparison. Click a county to zoom to it and see its busiest
// stops with no shelter.

import type { CountyStats, SelectedStop } from "./types";

interface Props {
  counties: CountyStats[];
  active: string | null;
  onPickCounty: (c: CountyStats | null) => void;
  onPickStop: (s: SelectedStop) => void;
  onBack: () => void;
  stopById: (id: string) => SelectedStop | null;
}

// Share of surveyed stops that have the facility. Unknown stops are left out.
function pct(f: { yes: number; no: number }) {
  const n = f.yes + f.no;
  return n === 0 ? null : Math.round((100 * f.yes) / n);
}

function Pct({ f }: { f: { yes: number; no: number } }) {
  const v = pct(f);
  return <td className="num">{v === null ? "–" : `${v}%`}</td>;
}

export default function Counties({ counties, active, onPickCounty, onPickStop, onBack, stopById }: Props) {
  const sorted = [...counties]
    .filter((c) => c.county !== "Unknown")
    .sort((a, b) => (pct(a.shelter) ?? 0) - (pct(b.shelter) ?? 0));
  const current = counties.find((c) => c.county === active) ?? null;

  if (current) {
    return (
      <div className="panel">
        <button className="back" onClick={() => onPickCounty(null)}>
          <img src="/icons/detail/arrow-back.svg" alt="" className="icon" />
          All counties
        </button>
        <h2 className="panel-title" tabIndex={-1}>
          {current.county}
        </h2>
        <p className="panel-place">
          {current.stops.toLocaleString("en-IE")} stops, {current.surveyed.toLocaleString("en-IE")} surveyed
        </p>

        <table className="county-table">
          <tbody>
            <tr><th>Shelter</th><Pct f={current.shelter} /><td className="muted">{current.shelter.yes} of {current.shelter.yes + current.shelter.no}</td></tr>
            <tr><th>Seating</th><Pct f={current.bench} /><td className="muted">{current.bench.yes} of {current.bench.yes + current.bench.no}</td></tr>
            <tr><th>Real-time display</th><Pct f={current.rtpi} /><td className="muted">{current.rtpi.yes} of {current.rtpi.yes + current.rtpi.no}</td></tr>
            <tr><th>Wheelchair accessible</th><Pct f={current.wheelchair} /><td className="muted">{current.wheelchair.yes} of {current.wheelchair.yes + current.wheelchair.no}</td></tr>
          </tbody>
        </table>
        <p className="muted small">Percentages are of surveyed stops only.</p>

        <h3 className="panel-h3">Busiest stops with no shelter</h3>
        <ol className="busy-list">
          {current.busy_no_shelter.map((s) => (
            <li key={s.id}>
              <button
                className="busy-stop"
                onClick={() => {
                  const stop = stopById(s.id);
                  if (stop) onPickStop(stop);
                }}
              >
                <span>{s.name ?? s.id}</span>
                <strong>{s.departures}</strong>
              </button>
            </li>
          ))}
        </ol>
        <p className="muted small">Number is average weekday departures.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <button className="back" onClick={onBack}>
        <img src="/icons/detail/arrow-back.svg" alt="" className="icon" />
        Back
      </button>
      <h2 className="panel-title" tabIndex={-1}>
        Counties
      </h2>
      <p className="panel-place">Share of surveyed stops with a shelter, lowest first.</p>
      <table className="county-table county-list">
        <thead>
          <tr>
            <th scope="col">County</th>
            <th scope="col" className="num">Shelter</th>
            <th scope="col" className="num">Seating</th>
            <th scope="col" className="num">Stops</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.county}>
              <th scope="row">
                <button className="link" onClick={() => onPickCounty(c)}>
                  {c.county}
                </button>
              </th>
              <Pct f={c.shelter} />
              <Pct f={c.bench} />
              <td className="num muted">{c.stops.toLocaleString("en-IE")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
