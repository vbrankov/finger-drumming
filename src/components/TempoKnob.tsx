import { useRef } from 'react';

interface Props {
  value: number;
  defaultValue: number;
  onChange: (bpm: number) => void;
  min?: number;
  max?: number;
}

const PX_PER_BPM = 3;

/** Tempo readout: press and drag up/down to change it, double-click to reset, wheel for ±1. */
export default function TempoKnob({ value, defaultValue, onChange, min = 20, max = 300 }: Props) {
  const drag = useRef<{ y: number; start: number } | null>(null);
  const clamp = (b: number) => Math.min(max, Math.max(min, Math.round(b)));
  return (
    <span
      className={'tempo-knob' + (value !== defaultValue ? ' changed' : '')}
      title={'Drag up or down to change the tempo, double-click to reset to ' + defaultValue}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, start: value };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) onChange(clamp(d.start + (d.y - e.clientY) / PX_PER_BPM));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(defaultValue)}
      onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY)))}
    >
      {value}
      <small>bpm</small>
    </span>
  );
}
