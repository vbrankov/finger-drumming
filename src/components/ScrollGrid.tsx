import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CellState } from './StepGrid';
import { STEPS } from '../model/types';
import type { Kit } from '../model/types';

/** Columns visible at once, and where the playhead sits among them. */
export const WINDOW = 40; // 2.5 bars
export const LEAD = 8; // steps of history left of the playhead
const GAP = 2; // px between columns (must match .scroll-inner's column gap)
const BEFORE = STEPS; // one bar of count-in before step 0
const AFTER = STEPS; // one bar past the end, showing the next pass, so the loop restart is visible ahead

interface Props {
  kit: Kit;
  rows: number[];
  /** Cell content for a pass-local step; `upcoming` marks steps of the next pass (show expected only). */
  cellAt: (pad: number, step: number, upcoming: boolean) => CellState;
  /** Current fractional pass-local position (negative during count-in), read every frame outside React. */
  getPosition: () => number | null;
  /** Steps in one pass. */
  steps: number;
  /** Label for the bar starting at a pass-local step (e.g. the pattern name), if it starts something new. */
  labelAt: (step: number) => string | undefined;
  flashPads?: Set<number>;
  onLabelClick?: (pad: number) => void;
}

/** Column pitch is the cell width plus the grid gap. */
function translateFor(pos: number, cellW: number): string {
  return 'translateX(' + -(pos - LEAD + BEFORE) * (cellW + GAP) + 'px)';
}

/**
 * A sliding window over the pass. Deliberately not rendered through React,
 * and built ONCE per run for the whole pass: rebuilding the strip while it
 * plays makes the compositor show a stale raster under the new transform for
 * a frame. Cells are patched in place when results change; every frame only
 * the CSS transform moves, driven by the audio clock.
 */
export default function ScrollGrid({ kit, rows, cellAt, getPosition, steps, labelAt, flashPads, onLabelClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const cellEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const staticCls = useRef<Map<string, string>>(new Map()); // key → structural classes (beat, bar, countin)
  const applied = useRef<Map<string, string>>(new Map()); // key → signature of what the element currently shows
  const [cellW, setCellW] = useState(24);

  useLayoutEffect(() => {
    const fit = () => {
      if (ref.current) setCellW(Math.max(8, Math.floor((ref.current.clientWidth - 2) / WINDOW) - GAP));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const first = -BEFORE;
  const count = BEFORE + steps + AFTER;

  // Apply a CellState to an element, skipping work when nothing changed.
  const paint = (key: string, el: HTMLDivElement, staticCls: string, c: CellState) => {
    const bg = (c.style?.background as string | undefined) ?? '';
    const data = c.data ? Object.entries(c.data).map(([k, v]) => k + '=' + v).join(';') : '';
    const content = c.content === undefined || c.content === null ? '' : String(c.content);
    const sig = [staticCls, c.on ? 'on' : '', c.className ?? '', bg, content, c.title ?? '', data].join('|');
    if (applied.current.get(key) === sig) return;
    applied.current.set(key, sig);
    el.className = ['cell', staticCls, c.on ? 'on' : '', c.className ?? ''].filter(Boolean).join(' ');
    el.style.background = bg;
    el.textContent = content;
    el.title = c.title ?? '';
    for (const a of [...el.attributes]) if (a.name.startsWith('data-')) el.removeAttribute(a.name);
    if (c.data) for (const [k, v] of Object.entries(c.data)) el.setAttribute('data-' + k, v);
  };

  // Build the whole strip. Runs when the run's shape changes (new song / loop range / kit), not while playing.
  useLayoutEffect(() => {
    const host = inner.current;
    if (!host) return;
    host.innerHTML = '';
    host.style.gridTemplateColumns = 'repeat(' + count + ', ' + cellW + 'px)';
    cellEls.current.clear();
    staticCls.current.clear();
    applied.current.clear();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const k = first + i;
      const inPass = ((k % steps) + steps) % steps;
      const beat = ((k % STEPS) + STEPS) % STEPS;
      const h = document.createElement('div');
      h.className = 'head' + (beat % 4 === 0 ? ' beat' : '') + (beat === 0 && i !== 0 ? ' bar' : '') + (k < 0 ? ' countin' : '');
      const label = k >= 0 && beat === 0 ? labelAt(inPass) : undefined;
      if (label) {
        const span = document.createElement('span');
        span.className = 'bar-label';
        span.textContent = (k >= steps && inPass === 0 ? '↺ ' : '') + label;
        h.appendChild(span);
      }
      h.appendChild(document.createTextNode(k < 0 ? (beat % 4 === 0 ? String(4 - beat / 4) : '·') : beat % 4 === 0 ? String(beat / 4 + 1) : '·'));
      frag.appendChild(h);
    }
    for (const pad of rows) {
      for (let i = 0; i < count; i++) {
        const k = first + i;
        const beat = ((k % STEPS) + STEPS) % STEPS;
        const el = document.createElement('div');
        const cls = [beat % 4 === 0 ? 'beat' : '', beat === 0 && i !== 0 ? 'bar' : '', k < 0 ? 'countin' : ''].filter(Boolean).join(' ');
        el.className = 'cell ' + cls;
        staticCls.current.set(pad + ':' + k, cls);
        cellEls.current.set(pad + ':' + k, el);
        frag.appendChild(el);
      }
    }
    host.appendChild(frag);
    for (const [key, el] of cellEls.current) {
      const [padS, kS] = key.split(':');
      const k = Number(kS);
      const inPass = ((k % steps) + steps) % steps;
      paint(key, el, staticCls.current.get(key) ?? '', k < 0 ? { on: false } : cellAt(Number(padS), inPass, k >= steps));
    }
    host.style.transform = translateFor(getPosition() ?? 0, cellW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellW, rows, steps, kit, labelAt]);

  // Results changed (the parent gives a new cellAt): patch only the cells whose state differs.
  useEffect(() => {
    for (const [key, el] of cellEls.current) {
      const [padS, kS] = key.split(':');
      const k = Number(kS);
      if (k < 0) continue;
      const inPass = ((k % steps) + steps) % steps;
      paint(key, el, staticCls.current.get(key) ?? '', cellAt(Number(padS), inPass, k >= steps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellAt]);

  // The only per-frame work: move the strip so that `position` sits under the playhead.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = inner.current;
      if (el) el.style.transform = translateFor(getPosition() ?? 0, cellW);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cellW, getPosition]);

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
        <div className="scroll-playhead" style={{ left: LEAD * (cellW + GAP) }} />
        <div className="scroll-inner" ref={inner} />
      </div>
    </div>
  );
}
