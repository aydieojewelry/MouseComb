import { SETTINGS, useSetting } from "@mousecomb/data";
import type { ClockLook } from "@mousecomb/ui";

/** The clock face picked in Settings → General (synced `hud.*` settings). */
export function useClockLook(): { look: ClockLook; showSeconds: boolean } {
  const [style] = useSetting(SETTINGS.hudStyle);
  const [dialFace] = useSetting(SETTINGS.hudDialFace);
  const [digitalFace] = useSetting(SETTINGS.hudDigitalFace);
  const [showSeconds] = useSetting(SETTINGS.hudShowSeconds);
  const look: ClockLook = style === "analog" ? { style, face: dialFace } : { style, face: digitalFace };
  return { look, showSeconds };
}
