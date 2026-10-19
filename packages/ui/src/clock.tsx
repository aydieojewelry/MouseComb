/**
 * Clock faces for the HUD (FEAT-001) and its Settings preview: four analog
 * dials and four digital faces. Analog faces are drawn in a 100×100 box,
 * shown 96 px square at scale 1; digital faces are 150×58 px at scale 1.
 */
import type { CSSProperties, ReactNode } from "react";

export const DIAL_FACES = ["minimal", "classic", "sport", "orbit"] as const;
export const DIGITAL_FACES = ["stacked", "bold", "pill", "lcd"] as const;
export type DialFace = (typeof DIAL_FACES)[number];
export type DigitalFace = (typeof DIGITAL_FACES)[number];
export type ClockLook = { style: "analog"; face: DialFace } | { style: "digital"; face: DigitalFace };

export const FACE_NAMES: Record<DialFace | DigitalFace, string> = {
  minimal: "Minimal",
  classic: "Classic",
  sport: "Sport",
  orbit: "Orbit",
  stacked: "Stacked",
  bold: "Bold",
  pill: "Pill",
  lcd: "LCD",
};

/** Size in px of a face at `scale`. */
export function faceSize(style: ClockLook["style"], scale = 1): { width: number; height: number } {
  return style === "analog" ? { width: 96 * scale, height: 96 * scale } : { width: 150 * scale, height: 58 * scale };
}

const withSeconds = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const withoutSeconds = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** The time in the user's format, and its pieces for faces that size them apart. */
export function clockParts(date: Date, showSeconds: boolean) {
  const parts = withSeconds.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const separator = parts[parts.findIndex((p) => p.type === "hour") + 1]?.value ?? ":";
  return {
    text: (showSeconds ? withSeconds : withoutSeconds).format(date),
    hoursMinutes: `${pick("hour")}${separator}${pick("minute")}`,
    seconds: showSeconds ? pick("second") : "",
    period: pick("dayPeriod"),
  };
}

// ---- analog -------------------------------------------------------------

type Line = { x1: number; y1: number; x2: number; y2: number; color: string; width: number };
type Dial = {
  fill: string;
  ring: string;
  hub: string;
  ticks: Line[];
  hands: Line[];
  numbers: { x: number; y: number; text: string; size: number; color: string }[];
  arcs: { d: string; color: string; width: number }[];
  dots: { x: number; y: number; r: number; color: string }[];
};

const ACCENT = "var(--color-accent)";

function at(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
}

function line(deg: number, r1: number, r2: number, color: string, width: number): Line {
  const [x1, y1] = at(deg, r1);
  const [x2, y2] = at(deg, r2);
  return { x1, y1, x2, y2, color, width };
}

/** `n` marks around the face, minus those `skip` says. */
function marks(n: number, r1: number, r2: number, color: string, width: number, skip: (i: number) => boolean = () => false) {
  return Array.from({ length: n }, (_, i) => i)
    .filter((i) => !skip(i))
    .map((i) => line((i * 360) / n, r1, r2, color, width));
}

function arc(r: number, deg: number, color: string, width: number) {
  const [x, y] = at(Math.min(deg, 359.9), r);
  return { d: `M 50 ${50 - r} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x} ${y}`, color, width };
}

function num(deg: number, r: number, text: string, size: number, color: string) {
  const [x, y] = at(deg, r);
  return { x, y, text, size, color };
}

/** Hand angles in degrees for `date`. */
export function handAngles(date: Date) {
  const s = date.getSeconds();
  const m = date.getMinutes() + s / 60;
  return { hour: ((date.getHours() % 12) + m / 60) * 30, minute: m * 6, second: s * 6 };
}

function dial(face: DialFace, date: Date, showSeconds: boolean): Dial {
  const { hour: H, minute: M, second: S } = handAngles(date);
  const secondHand = (color: string, len: number) => (showSeconds ? [line(S, -6, len, color, 1.1)] : []);
  const none = { numbers: [], arcs: [], dots: [] };
  switch (face) {
    case "classic":
      return {
        ...none,
        fill: "#F4F1EA",
        ring: "#CFC8BA",
        hub: "#1E1E1E",
        ticks: [...marks(60, 43, 45.5, "#8A8478", 0.6, (i) => i % 5 === 0), ...marks(12, 39.5, 45.5, "#1E1E1E", 1.6)],
        numbers: Array.from({ length: 12 }, (_, i) => num((i + 1) * 30, 32, String(i + 1), 9, "#1E1E1E")),
        hands: [line(H, 0, 22, "#1E1E1E", 3.2), line(M, 0, 34, "#1E1E1E", 2.2), ...secondHand("#C2410C", 38)],
      };
    case "sport":
      return {
        ...none,
        fill: "#121418",
        ring: ACCENT,
        hub: "#FFFFFF",
        ticks: [
          ...marks(60, 42.5, 45, "#4A4F5A", 0.8, (i) => i % 5 === 0),
          ...marks(12, 37, 45, "#FFFFFF", 2.2, (i) => i % 3 === 0),
          ...marks(4, 34, 45, ACCENT, 3.4),
        ],
        numbers: [0, 90, 180, 270].map((deg) => num(deg, 25, String(deg / 30 || 12), 11, "#FFFFFF")),
        hands: [line(H, 0, 21, "#FFFFFF", 4.2), line(M, 0, 35, ACCENT, 3), ...secondHand("#FFFFFF", 40)],
      };
    case "orbit": {
      // No hands: the outer ring fills with the minutes, the inner ring with the hours.
      const [sx, sy] = at(S, 47);
      return {
        ...none,
        fill: "#0B0B0D",
        ring: "#0B0B0D",
        hub: "none",
        ticks: [],
        hands: [],
        arcs: [arc(41, 360, "#23232A", 5), arc(41, M, ACCENT, 5), arc(30, 360, "#23232A", 5), arc(30, H, "#FFFFFF", 5)],
        dots: showSeconds ? [{ x: sx, y: sy, r: 1.8, color: ACCENT }] : [],
      };
    }
    default:
      return {
        ...none,
        fill: "#0B0B0D",
        ring: "#2A2A30",
        hub: ACCENT,
        ticks: [...marks(12, 41, 44, "#6B6B74", 1.6, (i) => i % 3 === 0), ...marks(4, 35, 44, "#FFFFFF", 3)],
        hands: [line(H, 0, 24, "#FFFFFF", 4), line(M, 0, 36, "#FFFFFF", 2.6), ...secondHand(ACCENT, 40)],
      };
  }
}

function AnalogFace(props: { face: DialFace; date: Date; showSeconds: boolean; size: number }) {
  const d = dial(props.face, props.date, props.showSeconds);
  const stroke = (l: Line, key: number) => (
    <line key={key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth={l.width} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 100 100" width={props.size} height={props.size} aria-hidden className="block">
      <circle cx="50" cy="50" r="47" fill={d.fill} stroke={d.ring} strokeWidth="1.5" />
      {d.arcs.map((a, i) => (
        <path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" />
      ))}
      {d.ticks.map(stroke)}
      {d.numbers.map((n) => (
        <text
          key={n.text}
          x={n.x}
          y={n.y}
          fill={n.color}
          fontSize={n.size}
          fontWeight={700}
          fontFamily="var(--font-sans)"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {n.text}
        </text>
      ))}
      {d.hands.map(stroke)}
      {d.dots.map((dot, i) => (
        <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.color} />
      ))}
      <circle cx="50" cy="50" r="2.6" fill={d.hub} />
    </svg>
  );
}

// ---- digital ------------------------------------------------------------

function DigitalFaceView(props: { face: DigitalFace; date: Date; showSeconds: boolean; scale: number }) {
  const px = (n: number) => `${Math.round(n * props.scale * 10) / 10}px`;
  const t = clockParts(props.date, props.showSeconds);
  // Long times (12-hour clocks with seconds) get a little smaller to fit.
  const fit = t.text.length > 8 ? 0.8 : 1;
  const box: CSSProperties = { width: px(150), height: px(58), boxSizing: "border-box" };
  const day = weekday.format(props.date);
  const date = dayMonth.format(props.date);
  const shell = (className: string, style: CSSProperties, children: ReactNode) => (
    <span className={`flex items-center justify-center text-fg ${className}`} style={{ ...box, ...style }}>
      {children}
    </span>
  );
  switch (props.face) {
    case "bold":
      return shell("rounded-[10px] border border-line bg-idle", {}, (
        <span className="flex items-start gap-0.5">
          <span className="font-display font-extrabold leading-none tracking-[-0.04em] tabular-nums" style={{ fontSize: px(30 * fit) }}>
            {t.hoursMinutes}
          </span>
          <span className="flex flex-col font-bold leading-none" style={{ fontSize: px(10) }}>
            <span className="text-accent">{t.seconds}</span>
            <span className="text-muted">{t.period}</span>
          </span>
        </span>
      ));
    case "pill":
      return shell("rounded-full border border-tick bg-raised", { gap: px(10) }, (
        <>
          <span className="font-display font-bold leading-none tabular-nums" style={{ fontSize: px(20 * fit) }}>
            {t.text}
          </span>
          <span className="w-px bg-tick" style={{ height: px(26) }} />
          <span className="flex flex-col gap-0.5 leading-none" style={{ fontSize: px(10) }}>
            <span className="font-mono font-semibold uppercase tracking-[0.06em] text-accent">{day}</span>
            <span className="text-muted">{date}</span>
          </span>
        </>
      ));
    case "lcd":
      return shell("flex-col rounded-md border border-[#2E2A1E] bg-[#0C0B08]", { gap: px(3) }, (
        <>
          <span
            className="flex justify-between self-stretch font-mono font-semibold uppercase leading-none tracking-[0.08em]"
            style={{ padding: `0 ${px(12)}`, fontSize: px(8), color: "color-mix(in srgb, var(--color-accent) 75%, transparent)" }}
          >
            <span>{day}</span>
            <span>{date}</span>
          </span>
          <span className="relative font-mono font-semibold leading-none" style={{ fontSize: px(22 * fit) }}>
            {/* Unlit segments behind the digits, like a real display. */}
            <span style={{ color: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }}>{t.text.replace(/\d/g, "8")}</span>
            <span
              className="absolute left-0 top-0 text-accent"
              style={{ textShadow: "0 0 6px color-mix(in srgb, var(--color-accent) 55%, transparent)" }}
            >
              {t.text}
            </span>
          </span>
        </>
      ));
    default:
      return shell("flex-col gap-[3px] rounded-[10px] border border-line bg-idle", {}, (
        <>
          <span className="leading-none text-muted" style={{ fontSize: px(10) }}>
            {day}, {date}
          </span>
          <span className="font-display font-bold leading-none tabular-nums" style={{ fontSize: px(24 * fit) }}>
            {t.text}
          </span>
        </>
      ));
  }
}

/** The clock in the chosen look. Decorative: say the time in a nearby label if it matters. */
export function ClockFace(props: { look: ClockLook; date: Date; showSeconds: boolean; scale?: number }) {
  const scale = props.scale ?? 1;
  return props.look.style === "analog" ? (
    <AnalogFace face={props.look.face} date={props.date} showSeconds={props.showSeconds} size={96 * scale} />
  ) : (
    <DigitalFaceView face={props.look.face} date={props.date} showSeconds={props.showSeconds} scale={scale} />
  );
}
