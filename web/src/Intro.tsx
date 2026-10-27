// What the sidebar shows when nothing is selected.

import Filters from "./Filters";
import type { Filters as FilterState } from "./types";

interface Props {
  loading: boolean;
  total: number;
  shown: number;
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  onCounties: () => void;
}

export default function Intro({ loading, total, shown, filters, onFilters, onCounties }: Props) {
  return (
    <div className="intro">
      {loading && (
        <p className="status" aria-live="polite">
          <span className="spinner" /> Loading the stops…
        </p>
      )}
      <p className="intro-lead">
        STOPS shows what every bus stop in Ireland has, what it lacks, and where
        improvements are needed.
      </p>

      <Filters filters={filters} onChange={onFilters} shown={shown} total={total} />

      <div className="legend">
        <span>
          <i className="dot dot-yes" /> Shelter
        </span>
        <span>
          <i className="dot dot-no" /> No shelter
        </span>
        <span>
          <i className="dot dot-unknown" /> Not surveyed
        </span>
      </div>

      <ol className="steps">
        <li>
          <strong>Find your stop.</strong>
          <p>Search by name or stop number, or zoom the map.</p>
        </li>
        <li>
          <strong>See what it has.</strong>
          <p>
            Shelter, seating, real-time display, wheelchair access and more, as
            recorded by the National Transport Authority. "Unknown" means the stop
            has not been surveyed yet, not that the facility is missing.
          </p>
        </li>
        <li>
          <strong>Make the case.</strong>
          <p>
            Busy stops with no shelter or seating are the clearest candidates for
            the NTA's Bus Stop Enhancement Programme.{" "}
            <button className="link" onClick={onCounties}>
              Compare counties
            </button>{" "}
            or share a stop's link with your councillor.
          </p>
        </li>
      </ol>
    </div>
  );
}
