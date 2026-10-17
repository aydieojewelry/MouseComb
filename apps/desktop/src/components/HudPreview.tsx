/** A scaled drawing of the screen corner: the HUD and its fade distances. */
export function HudPreview(props: { nearPx: number; farPx: number; showSeconds: boolean }) {
  // Drawn at half size. Distances are measured from the HUD's edges, so each
  // zone is the HUD rectangle grown by that distance.
  const scale = 0.5;
  const width = 560;
  const height = 230;
  const hud = { x: width - 132, y: height - 70, w: 104, h: 46 };
  const grow = (px: number) => {
    const d = px * scale;
    return { x: hud.x - d, y: hud.y - d, width: hud.w + 2 * d, height: hud.h + 2 * d, rx: 8 + d };
  };
  const near = grow(props.nearPx);
  const far = grow(props.farPx);
  const time = props.showSeconds ? "14:05:09" : "14:05";
  const cx = hud.x + hud.w / 2;
  const cy = hud.y + hud.h / 2;

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-line bg-idle">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`The HUD is hidden when the mouse is within ${props.nearPx} pixels of it and fully visible beyond ${props.farPx} pixels.`}
        >
          <rect {...far} fill="var(--color-accent)" fillOpacity="0.07" stroke="var(--color-muted)" strokeDasharray="4 5" />
          <rect {...near} fill="var(--color-accent)" fillOpacity="0.16" stroke="var(--color-accent)" strokeWidth="1.5" />
          <rect x={hud.x} y={hud.y} width={hud.w} height={hud.h} rx="8" fill="#000" stroke="var(--color-line)" />
          <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-muted)" fontSize="9" fontFamily="var(--font-sans)">
            Fri, 17 Oct
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="#eaeaea" fontSize="15" fontWeight="700" fontFamily="var(--font-sans)">
            {time}
          </text>
          <text x="16" y="24" fill="var(--color-muted)" fontSize="11" fontFamily="var(--font-sans)">
            Bottom-right of your screen (half size)
          </text>
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-accent" /> mouse inside: HUD hidden
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-muted" /> mouse outside: HUD fully visible
        </span>
      </figcaption>
    </figure>
  );
}
