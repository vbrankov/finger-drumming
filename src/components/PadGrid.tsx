import type { PointerEvent } from 'react';
import { PAD_COUNT } from '../model/types';
import type { Kit } from '../model/types';
import { PAD_TO_KEY } from '../hooks';

interface Props {
  kit: Kit;
  flashPads?: Set<number>;
  /** Fired on pointerdown (press, not release) so it is usable as an instrument. */
  onPadClick?: (pad: number, perfTime: number) => void;
  showKeys?: boolean;
  /** MIDI note per pad, shown as a small label. */
  notes?: Record<number, number | undefined>;
  learningPad?: number | null;
}

export default function PadGrid({ kit, flashPads, onPadClick, showKeys, notes, learningPad }: Props) {
  const press = (pad: number) => (e: PointerEvent) => {
    e.preventDefault();
    onPadClick?.(pad, e.timeStamp);
  };
  return (
    <div className="pad-grid">
      {Array.from({ length: PAD_COUNT }, (_, pad) => {
        const cls = [
          'pad',
          flashPads?.has(pad) ? 'flash' : '',
          learningPad === pad ? 'learning' : '',
          notes && notes[pad] === undefined ? 'unmapped' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={pad} className={cls} onPointerDown={onPadClick && press(pad)}>
            {showKeys && <span className="key">{PAD_TO_KEY[pad]}</span>}
            <span>{kit.slots[pad]?.role ?? 'Pad ' + (pad + 1)}</span>
            {notes && <span className="note">{notes[pad] === undefined ? 'unmapped' : 'note ' + notes[pad]}</span>}
          </div>
        );
      })}
    </div>
  );
}
