// The bottom sheet used on phones. Three heights: peek, half, full.
// Tap the handle to cycle, or drag it up and down.

import { useRef, type ReactNode } from "react";

export type SheetState = "peek" | "half" | "full";

interface Props {
  state: SheetState;
  onChange: (s: SheetState) => void;
  summary: string; // one line shown when peeking
  children: ReactNode;
}

const ORDER: SheetState[] = ["peek", "half", "full"];

export default function Sheet({ state, onChange, summary, children }: Props) {
  const startY = useRef<number | null>(null);

  function step(direction: 1 | -1) {
    const i = ORDER.indexOf(state);
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + direction))];
    onChange(next);
  }

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startY.current === null) return;
    const dy = e.changedTouches[0].clientY - startY.current;
    startY.current = null;
    if (dy < -40) step(1); // dragged up: bigger
    else if (dy > 40) step(-1); // dragged down: smaller
  }

  return (
    <aside className={`sheet sheet-${state}`}>
      <button
        className="sheet-handle"
        onClick={() => onChange(state === "full" ? "peek" : state === "half" ? "full" : "half")}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={state === "peek" ? "Open panel" : "Resize panel"}
      >
        <span className="sheet-grip" />
        <span className="sheet-summary">{summary}</span>
      </button>
      <div className="sheet-body">{children}</div>
    </aside>
  );
}
