import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CellState } from './StepGrid';
import { STEPS } from '../model/types';
import type { Kit } from '../model/types';

/** Columns visible at once, and where the playhead sits among them. */
export const WINDOW = 40; // 2.5 bars
export const LEAD = 8; // steps of history left of the playhead
const RENDER_BARS = 5; // columns rendered per strip: enough for the window plus a bar of slack

interface Props {
  kit: Kit;
  rows: number[];
  /** Cell content for a pass-local step; `upcoming` marks steps of the next pass (show expected only). */
  cellAt: (pad: number, step: number, upcoming: boolean) => CellState;
  /**
   * First pass-local step of the rendered strip. The parent advances it once
   * per bar; the strip re-renders only then (or when results change).
   */
  base: number;
  /** Current fractional pass-local position, read every frame outside React. */
  getPosition: () => number | null;
  /** Steps in one pass. */
  steps: number;
  /** Label for the bar starting at a pass-local step (e.g. the pattern name), if it starts something new. */
  labelAt: (step: number) => string | undefined;
  flashPads?: Set<number>;
  onLabelClick?: (pad: number) => void;
}

/** Where the strip should sit for a given position: the playhead column is LEAD. */
export function baseFor(position: number): number {
  return Math.floor((Math.floor(position) - LEAD) / STEPS) * STEPS;
}

/**
 * A sliding window over the pass. The strip of cells is rendered per bar;
 * each frame only its CSS transform moves, driven by the audio clock.
 */
export default function ScrollGrid({ kit, rows, cellAt, base, getPosition, steps, labelAt, flashPads, onLabelClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [cellW, setCellW] = useState(24);
  useLayoutEffect(() => {
    const fit = () => {
      if (ref.current) setCellW(Math.max(8, Math.floor((ref.current.clientWidth - 2) / WINDOW)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // The only per-frame work: move the strip so that `position` sits under the playhead.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = inner.current;
      if (el) {
        const pos = getPosition() ?? base + LEAD;
        el.style.transform = 'translateX(' + -(pos - LEAD - base) * cellW + 'px)';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [base, cellW, getPosition]);

  const count = RENDER_BARS * STEPS;
  const cols = Array.from({ length: count }, (_, i) => base + i);

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
        <div className="scroll-inner" ref={inner} style={{ gridTemplateColumns: 'repeat(' + count + ', ' + cellW + 'px)' }}>
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
              const cls = ['cell', beat % 4 === 0 ? 'beat' : '', beat === 0 && k !== base ? 'bar' : '', c.on ? 'on' : '', k < 0 ? 'countin' : '', c.className ?? '']
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
