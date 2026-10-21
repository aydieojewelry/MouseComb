import { ClockFace, faceSize, type ClockLook } from "@mousecomb/ui";

/** Preview scale: the corner of the screen at 3/4 size, zones and face alike. */
const SCALE = 0.75;
/** Where the face sits in the preview, from the right and bottom edges. */
const RIGHT = 28;
const BOTTOM = 20;

/**
 * A drawing of the screen corner: the clock you picked and its fade
 * distances, measured from the clock's edges (DEC-015), so each zone is
 * the clock's box grown by that distance.
 */
export function HudPreview(props: { look: ClockLook; nearPx: number; farPx: number; showSeconds: boolean; date: Date }) {
  const box = faceSize(props.look.style, SCALE);
  const corner = props.look.style === "analog" ? box.width / 2 : 10;
  const zone = (px: number) => {
    const d = px * SCALE;
    return {
      right: RIGHT - d,
      bottom: BOTTOM - d,
      width: box.width + 2 * d,
      height: box.height + 2 * d,
      borderRadius: corner + d,
    };
  };
  return (
    <div
      role="img"
      aria-label={`Preview: the clock hides when the mouse is within ${props.nearPx} pixels of it and is fully visible beyond ${props.farPx} pixels.`}
      className="relative h-[170px] overflow-hidden rounded-[10px] border border-line bg-[linear-gradient(135deg,#1B2230,#0B0D12)]"
    >
      <div className="absolute border border-dashed border-muted bg-white/[0.03]" style={zone(props.farPx)} />
      <div className="absolute border-[1.5px] border-accent bg-accent/15" style={zone(props.nearPx)} />
      <div className="absolute drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)]" style={{ right: RIGHT, bottom: BOTTOM }}>
        <ClockFace look={props.look} date={props.date} showSeconds={props.showSeconds} scale={SCALE} />
      </div>
      <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden className="absolute left-[34%] top-[38%]">
        <path d="M2 2v15l4-4 3 7 3-1.4-3-6.6h5.6z" fill="#FFFFFF" stroke="#000000" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <div className="absolute left-3 top-3 flex gap-3 text-[11px] text-[#C8C8D0]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border-[1.5px] border-accent bg-accent/15" />
          Hidden
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-dashed border-muted" />
          Fading
        </span>
      </div>
    </div>
  );
}
