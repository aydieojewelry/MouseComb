/**
 * A kitchen-timer dial (FEAT-002): a 60-minute face with the time left
 * marked from 12 o'clock clockwise, as in the OmniBar and Settings designs.
 */
import type { ReactNode } from "react";

const CENTER = 150;

/** A point `r` from the centre at `minute` (0–60, clockwise from the top), in a 300×300 box. */
function at(minute: number, r: number): [number, number] {
  const a = (minute / 60) * 2 * Math.PI;
  return [CENTER + r * Math.sin(a), CENTER - r * Math.cos(a)];
}

/**
 * Everything drawn on the dial for `left` minutes: a tick per minute (longer
 * every 5), a dot every half minute, numbers every 5 (quarters larger), an
 * inner arc ending exactly at the time left, and the pointer.
 */
export function dialMarks(left: number) {
  const l = Math.min(Math.max(left, 0), 60);
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const [x1, y1] = at(i, major ? 102 : 109);
    const [x2, y2] = at(i, 118);
    return { x1, y1, x2, y2, major, on: i <= l };
  });
  const dots = Array.from({ length: 60 }, (_, i) => {
    const [x, y] = at(i + 0.5, 116);
    return { x, y, on: i + 0.5 <= l };
  });
  const labels = Array.from({ length: 12 }, (_, i) => {
    const [x, y] = at(i * 5, 84);
    return { x, y, text: String(i * 5), quarter: i % 3 === 0, on: i * 5 <= l };
  });
  // A full circle can't be one arc: stop just short of the top.
  const end = Math.min(l, 59.99);
  const [ax, ay] = at(end, 97);
  const arc = l > 0 ? `M ${CENTER} ${CENTER - 97} A 97 97 0 ${end > 30 ? 1 : 0} 1 ${ax} ${ay}` : "";
  const [px, py] = at(l, 124);
  const [b1x, b1y] = at(l - 1.4, 136);
  const [b2x, b2y] = at(l + 1.4, 136);
  return { ticks, dots, labels, arc, pointer: `${px},${py} ${b1x},${b1y} ${b2x},${b2y}` };
}

/** The dial, `size` px square, with `children` (the start/pause button) in the middle. */
export function TimerDial(props: { minutesLeft: number; size: number; color: string; label: string; children?: ReactNode }) {
  const g = dialMarks(props.minutesLeft);
  const off = "var(--color-tick)";
  return (
    <div className="relative shrink-0" style={{ width: props.size, height: props.size }}>
      <svg viewBox="0 0 300 300" width={props.size} height={props.size} role="img" aria-label={props.label} className="absolute inset-0">
        <circle cx={CENTER} cy={CENTER} r="128" fill="var(--color-face)" stroke="var(--color-line)" />
        {g.arc && <path d={g.arc} fill="none" stroke={props.color} strokeWidth="3" strokeLinecap="round" />}
        {g.dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="1.1" fill={d.on ? props.color : off} />
        ))}
        {g.ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.on ? props.color : off}
            strokeWidth={t.major ? 2.4 : 1.2}
            strokeLinecap="round"
          />
        ))}
        {g.labels.map((l) => (
          <text
            key={l.text}
            x={l.x}
            y={l.y}
            fill={l.on ? props.color : "var(--color-muted)"}
            fontSize={l.quarter ? 15 : 12}
            fontWeight={l.quarter ? 700 : 500}
            fontFamily="var(--font-sans)"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {l.text}
          </text>
        ))}
        <polygon points={g.pointer} fill={props.color} />
      </svg>
      {props.children && <div className="absolute inset-0 grid place-items-center">{props.children}</div>}
    </div>
  );
}
