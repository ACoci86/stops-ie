// The About page: who made it, where the data comes from, what it means,
// privacy, accessibility, and a download link. Opens as a modal.

import { useEffect, useRef } from "react";
import { CONTACT_EMAIL, SITE_AUTHOR, SITE_AUTHOR_URL } from "./config";
import type { Meta } from "./types";

interface Props {
  meta: Meta | null;
  onClose: () => void;
}

function day(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
}

export default function DataSources({ meta, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus into the modal, close on Escape, and put focus back
  // where it was when the modal goes away.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const updated = day(meta?.built);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close" ref={closeRef}>
          ×
        </button>
        <h2 id="about-title">About STOPS</h2>

        <p>
          STOPS is a free, independent map of Ireland's bus stops and what each one
          has. It exists to show where shelters, seating and accessible boarding are
          missing, so that passengers, community groups and councillors can make the
          case for improvements with evidence.
        </p>
        <p>
          Made by{" "}
          <a href={SITE_AUTHOR_URL} target="_blank" rel="noreferrer">
            {SITE_AUTHOR}
          </a>
          . It is not connected to the National Transport Authority or any operator.
          {CONTACT_EMAIL && (
            <>
              {" "}Questions and corrections: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </>
          )}
        </p>

        <h3>Where the data comes from</h3>
        <p>
          Everything on the map comes from the National Transport Authority's
          published records of Ireland's bus stops.
          {updated && <> The map was last updated on <strong>{updated}</strong> and refreshes every week.</>}
        </p>
        <ul>
          <li>Where each stop is and what it is called.</li>
          <li>
            What the NTA found when it surveyed the stop: shelter, seating, bin,
            bike stand, footpath, raised kerb, step, wheelchair access, and an
            overall accessibility grade from A+ to C.
          </li>
          <li>Which routes call there and how many buses stop on a typical weekday.</li>
        </ul>

        <h3>What the records do not say</h3>
        <p>
          A record is what the NTA has on file, not a promise about today. Shelters
          get added and removed, and surveys age. A stop marked{" "}
          <strong>unknown</strong> has not been surveyed yet, so nothing is known
          either way. If a stop looks wrong, use "Report a problem" on its page.
        </p>

        <h3>Privacy</h3>
        <p>
          This site sets no cookies and collects no personal data. If you press the
          "find me" button, your location is used by your browser to move the map
          and is never sent anywhere.
        </p>

        <h3>Accessibility</h3>
        <p>
          The site works with a keyboard and a screen reader: search, filters, the
          stop page and the county list can all be reached by Tab. The dots on the
          map itself cannot, so use the search box to open a stop instead. If
          something gets in your way, please say.
        </p>

        <h3>Use the data</h3>
        <p>
          <a href="/data/stops.geojson" download="stops-ireland.geojson">
            Download every stop as GeoJSON
          </a>{" "}
          (about 9 MB). Free to reuse with credit to the National Transport Authority.
        </p>

        <p className="modal-note">
          Stop data: National Transport Authority, open data, CC BY 4.0. County and
          urban boundaries: Tailte Éireann and the Central Statistics Office, CC BY
          4.0. Map background: OpenFreeMap, © OpenStreetMap contributors.
        </p>
      </div>
    </div>
  );
}
