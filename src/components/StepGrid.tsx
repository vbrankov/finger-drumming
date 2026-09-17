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
  /** Pads to show as rows, in order. Default: all 16. */
  rows?: number[];
  cell: (pad: number, step: number) => CellState;
  playheadStep?: number | null;
  onCellClick?: (pad: number, step: number) => void;
  onLabelClick?: (pad: number) => void;
  flashPads?: Set<number>;
}

export default function StepGrid({ kit, rows, cell, playheadStep, onCellClick, onLabelClick, flashPads }: Props) {
  const pads = rows ?? Array.from({ length: PAD_COUNT }, (_, i) => i);
  return (
    <div className="step-grid">
      <div />
      {Array.from({ length: STEPS }, (_, s) => (
        <div key={s} className={'head' + (s % 4 === 0 ? ' beat' : '')}>
          {s % 4 === 0 ? s / 4 + 1 : '·'}
        </div>
      ))}
      {pads.map((pad) => (
        <Row
          key={pad}
          pad={pad}
          label={kit.slots[pad]?.role ?? 'Pad ' + (pad + 1)}
          flash={flashPads?.has(pad) ?? false}
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
  cell,
  playheadStep,
  onCellClick,
  onLabelClick,
}: {
  pad: number;
  label: string;
  flash: boolean;
} & Pick<Props, 'cell' | 'playheadStep' | 'onCellClick' | 'onLabelClick'>) {
  return (
    <>
      <div className={'label' + (flash ? ' flash' : '')} onClick={() => onLabelClick?.(pad)} title={'Pad ' + (pad + 1)}>
        {label}
      </div>
      {Array.from({ length: STEPS }, (_, step) => {
        const c = cell(pad, step);
        const cls = [
          'cell',
          step % 4 === 0 ? 'beat' : '',
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
