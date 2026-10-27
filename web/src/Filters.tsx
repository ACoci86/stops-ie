// Toggle chips that narrow the map to stops that HAVE something.
// A stop must match every chip that is switched on.

import { BUSY_THRESHOLD } from "./config";
import type { Filters as FilterState } from "./types";

interface Props {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  shown: number;
  total: number;
}

const OPTIONS: { key: keyof FilterState; label: string; icon: string }[] = [
  { key: "shelter", label: "Shelter", icon: "shelter" },
  { key: "seating", label: "Seating", icon: "seating" },
  { key: "rtpi", label: "Real-time display", icon: "realtime-display" },
  { key: "wheelchair", label: "Wheelchair access", icon: "wheelchair-accessible" },
  { key: "busy", label: `Busy, ${BUSY_THRESHOLD}+ a day`, icon: "departures" },
];

export default function Filters({ filters, onChange, shown, total }: Props) {
  const anyOn = Object.values(filters).some(Boolean);

  function toggle(key: keyof FilterState) {
    onChange({ ...filters, [key]: !filters[key] });
  }

  function clear() {
    onChange({ shelter: false, seating: false, rtpi: false, wheelchair: false, busy: false });
  }

  return (
    <section className="filters" aria-labelledby="filters-title">
      <div className="filters-head">
        <h2 id="filters-title">
          <img src="/icons/icon-filter.svg" alt="" className="icon" />
          Show stops with
        </h2>
        {anyOn && (
          <button className="link" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      <div className="chips">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={filters[o.key] ? "chip on" : "chip"}
            aria-pressed={filters[o.key]}
            onClick={() => toggle(o.key)}
          >
            <img src={`/icons/detail/${o.icon}.svg`} alt="" className="icon" />
            {o.label}
          </button>
        ))}
      </div>

      <p className="filter-count" aria-live="polite">
        {anyOn
          ? `${shown.toLocaleString("en-IE")} of ${total.toLocaleString("en-IE")} stops have all of these.`
          : "Surveyed stops only. Unknown is never counted as a yes."}
      </p>
    </section>
  );
}
