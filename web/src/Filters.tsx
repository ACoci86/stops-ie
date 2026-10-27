// Checkboxes that narrow which stops the map shows.

import { BUSY_THRESHOLD } from "./config";
import type { Filters as FilterState } from "./types";

interface Props {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  shown: number;
  total: number;
}

const OPTIONS: { key: keyof FilterState; label: string }[] = [
  { key: "noShelter", label: "No shelter" },
  { key: "noSeating", label: "No seating" },
  { key: "noRtpi", label: "No real-time display" },
  { key: "notAccessible", label: "Not wheelchair accessible" },
  { key: "notSurveyed", label: "Not surveyed" },
  { key: "busy", label: `Busy: ${BUSY_THRESHOLD}+ buses a weekday` },
];

export default function Filters({ filters, onChange, shown, total }: Props) {
  const anyOn = Object.values(filters).some(Boolean);

  function toggle(key: keyof FilterState) {
    onChange({ ...filters, [key]: !filters[key] });
  }

  function clear() {
    const next = { ...filters };
    for (const k of Object.keys(next) as (keyof FilterState)[]) next[k] = false;
    onChange(next);
  }

  return (
    <fieldset className="filters">
      <legend>
        <img src="/icons/icon-filter.svg" alt="" className="icon" />
        Show only stops with
      </legend>
      {OPTIONS.map((o) => (
        <label key={o.key} className="filter">
          <input type="checkbox" checked={filters[o.key]} onChange={() => toggle(o.key)} />
          {o.label}
        </label>
      ))}
      <p className="filter-count" aria-live="polite">
        {anyOn ? (
          <>
            Showing {shown.toLocaleString("en-IE")} of {total.toLocaleString("en-IE")} stops.{" "}
            <button className="link" onClick={clear}>
              Clear
            </button>
          </>
        ) : (
          `All ${total.toLocaleString("en-IE")} stops shown.`
        )}
      </p>
    </fieldset>
  );
}
