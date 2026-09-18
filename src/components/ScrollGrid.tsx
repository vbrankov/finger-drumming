import { useLayoutEffect, useRef, useState } from 'react';
import type { CellState } from './StepGrid';
import { STEPS } from '../model/types';
import type { Kit } from '../model/types';

/** Columns visible at once, and where the playhead sits among them. */
const WINDOW = 40; // 2.5 bars
const LEAD = 8; // steps of history left of the playhead

interface Props {
  kit: Kit;
  rows: number[];
  /** Cell content for a pass-local step; `upcoming` marks steps of the next pass (show expected only). */
  cellAt: (pad: number, step: number, upcoming: boolean) => CellState;
  /** Fractional pass-local step; negative during count-in; null when idle. */
  position: number | null;
  /** Steps in one pass. */
  steps: number;
  /** Label for the bar starting at a pass-local step (e.g. the pattern name), if it starts something new. */
  labelAt: (step: number) => string | undefined;
  flashPads?: Set<number>;
  onLabelClick?: (pad: number) => void;
}

/**
 * A sliding window over the pass: columns are steps, the playhead is fixed
 * at column LEAD, and the content translates smoothly as time passes. Steps
 * beyond the pass wrap to the next pass so the loop restart is visible ahead.
 */
export default function ScrollGrid({ kit, rows, cellAt, position, steps, labelAt, flashPads, onLabelClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [cellW, setCellW] = useState(24);
  useLayoutEffect(() => {
    const fit = () => {
      if (ref.current) setCellW(Math.max(8, Math.floor((ref.current.clientWidth - 2) / WINDOW)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const pos = position ?? 0;
  const first = Math.floor(pos) - LEAD; // pass-local step in the first rendered column
  const count = WINDOW + STEPS; // render a bar beyond the window so nothing pops in at the edge
  const shift = pos - Math.floor(pos); // fractional step → smooth slide
  const cols = Array.from({ length: count }, (_, i) => first + i);

  return (
    <div className="scroll-grid" ref={ref} style={{ ['--cell-w' as string]: cellW + 'px' }}>
      <div className="scroll-labels">
        {rows.map((pad) => (
          <div key={pad} className={'label' + (flashPads?.has(pad) ? ' flash' : '')} onClick={() => onLabelClick?.(pad)}>
            {kit.slots[pad]?.role ?? 'Pad ' + (pad + 1)}
          </div>
        ))}
      </div>
      <div className="scroll-viewport">
        <div className="scroll-playhead" style={{ left: LEAD * cellW }} />
        <div className="scroll-inner" style={{ transform: 'translateX(' + -shift * cellW + 'px)', gridTemplateColumns: 'repeat(' + count + ', ' + cellW + 'px)' }}>
          {cols.map((k) => {
            const inPass = ((k % steps) + steps) % steps;
            const beat = ((k % STEPS) + STEPS) % STEPS;
            const label = k >= 0 && beat === 0 ? labelAt(inPass) : undefined;
            const wraps = k >= steps && inPass === 0;
            return (
              <div key={'h' + k} className={'head' + (beat % 4 === 0 ? ' beat' : '') + (beat === 0 ? ' bar' : '') + (k < 0 ? ' countin' : '')}>
                {label && <span className="bar-label">{(wraps ? '↺ ' : '') + label}</span>}
                {beat % 4 === 0 ? beat / 4 + 1 : '·'}
              </div>
            );
          })}
          {rows.map((pad) =>
            cols.map((k) => {
              const inPass = ((k % steps) + steps) % steps;
              const beat = ((k % STEPS) + STEPS) % STEPS;
              const c = k < 0 ? { on: false } : cellAt(pad, inPass, k >= steps);
              const cls = ['cell', beat % 4 === 0 ? 'beat' : '', beat === 0 && k !== first ? 'bar' : '', c.on ? 'on' : '', k < 0 ? 'countin' : '', c.className ?? '']
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={pad + ':' + k}
                  className={cls}
                  style={c.style}
                  title={c.title}
                  {...Object.fromEntries(Object.entries(c.data ?? {}).map(([kk, v]) => ['data-' + kk, v]))}
                >
                  {c.content}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
