import type { CSSProperties, ReactNode } from 'react';
import { PAD_COUNT, STEPS } from '../model/types';
import type { Kit } from '../model/types';

export interface CellState {
  on: boolean;
  className?: string;
  style?: CSSProperties;
  content?: ReactNode;
  title?: string;
}

interface Props {
  kit: Kit;
  /** Total columns (16 per bar). Default one bar. */
  steps?: number;
  /** Pads to show as rows, in order. Default: all 16. */
  rows?: number[];
  cell: (pad: number, step: number) => CellState;
  playheadStep?: number | null;
  onCellClick?: (pad: number, step: number) => void;
  onLabelClick?: (pad: number) => void;
  flashPads?: Set<number>;
}

export default function StepGrid({ kit, steps = STEPS, rows, cell, playheadStep, onCellClick, onLabelClick, flashPads }: Props) {
  const pads = rows ?? Array.from({ length: PAD_COUNT }, (_, i) => i);
  return (
    <div className="step-grid" style={{ gridTemplateColumns: 'var(--label-w, 90px) repeat(' + steps + ', minmax(0, 1fr))' }}>
      <div />
      {Array.from({ length: steps }, (_, s) => (
        <div key={s} className={'head' + (s % 4 === 0 ? ' beat' : '') + (s % STEPS === 0 && s > 0 ? ' bar' : '')}>
          {s % 4 === 0 ? ((s % STEPS) / 4) + 1 : '·'}
        </div>
      ))}
      {pads.map((pad) => (
        <Row
          key={pad}
          pad={pad}
          label={kit.slots[pad]?.role ?? 'Pad ' + (pad + 1)}
          flash={flashPads?.has(pad) ?? false}
          steps={steps}
          cell={cell}
          playheadStep={playheadStep}
          onCellClick={onCellClick}
          onLabelClick={onLabelClick}
        />
      ))}
    </div>
  );
}

function Row({
  pad,
  label,
  flash,
  steps,
  cell,
  playheadStep,
  onCellClick,
  onLabelClick,
}: {
  pad: number;
  label: string;
  flash: boolean;
  steps: number;
} & Pick<Props, 'cell' | 'playheadStep' | 'onCellClick' | 'onLabelClick'>) {
  return (
    <>
      <div className={'label' + (flash ? ' flash' : '')} onClick={() => onLabelClick?.(pad)} title={'Pad ' + (pad + 1)}>
        {label}
      </div>
      {Array.from({ length: steps }, (_, step) => {
        const c = cell(pad, step);
        const cls = [
          'cell',
          step % 4 === 0 ? 'beat' : '',
          step % STEPS === 0 && step > 0 ? 'bar' : '',
          c.on ? 'on' : '',
          onCellClick ? 'editable' : '',
          playheadStep === step ? 'playhead' : '',
          c.className ?? '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={step} className={cls} style={c.style} title={c.title} onClick={() => onCellClick?.(pad, step)}>
            {c.content}
          </div>
        );
      })}
    </>
  );
}
