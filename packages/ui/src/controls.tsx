/**
 * Picking and stepping controls from the Settings design: chips, segments,
 * number circles and preview cards (one Ark RadioGroup underneath), a −/+
 * stepper (Ark NumberInput) and round icon buttons with a caption.
 */
import { NumberInput } from "@ark-ui/react/number-input";
import { RadioGroup } from "@ark-ui/react/radio-group";
import type { ReactNode } from "react";

import { cx } from "./cx";
import { AddIcon, MinusIcon } from "./icons";

export type Choice<T extends string> = { value: T; label: string; preview?: ReactNode };

const focusRing = "outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-accent";

const groupStyles = {
  segment: "inline-flex gap-0.5 rounded-[10px] border border-line bg-raised p-[3px]",
  chip: "flex flex-wrap gap-2",
  circle: "flex flex-wrap gap-1.5",
  card: "grid w-full grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5",
} as const;

const itemStyles = {
  segment:
    "flex h-8 cursor-pointer items-center rounded-lg px-4 text-[13px] font-semibold text-muted transition-colors hover:text-fg data-[state=checked]:bg-selected data-[state=checked]:text-fg",
  chip:
    "flex h-9 cursor-pointer items-center rounded-full border border-line bg-raised px-3.5 text-[13px] font-semibold text-fg transition-colors hover:border-muted data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink",
  circle:
    "grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-raised text-sm font-semibold text-muted transition-colors hover:text-fg data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:font-bold data-[state=checked]:text-accent-ink",
  card:
    "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[1.5px] border-line bg-raised px-2 pb-2.5 pt-3 text-[13px] font-medium text-fg transition-colors hover:border-muted data-[state=checked]:border-accent",
} as const;

/**
 * One choice out of a few, drawn as `segment`s in a track, `chip`s,
 * number `circle`s or `card`s with a preview above the label.
 * Arrow keys move between choices. `value` null means none matches.
 */
export function ChoiceGroup<T extends string>(props: {
  label: string;
  /** The label is for screen readers only (a section title already says it). */
  hideLabel?: boolean;
  value: T | null;
  choices: readonly Choice<T>[];
  variant: keyof typeof groupStyles;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      value={props.value}
      orientation="horizontal"
      onValueChange={(e) => {
        const next = props.choices.find((c) => c.value === e.value);
        if (next) props.onValueChange(next.value);
      }}
      className={cx("flex flex-wrap items-center justify-between gap-3", props.className)}
    >
      <RadioGroup.Label className={props.hideLabel ? "sr-only" : "text-sm text-fg"}>{props.label}</RadioGroup.Label>
      <div className={groupStyles[props.variant]}>
        {props.choices.map((c) => (
          <RadioGroup.Item key={c.value} value={c.value} className={cx(itemStyles[props.variant], focusRing)}>
            {c.preview && (
              <span aria-hidden className="flex h-16 items-center justify-center">
                {c.preview}
              </span>
            )}
            <RadioGroup.ItemText>{c.label}</RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        ))}
      </div>
    </RadioGroup.Root>
  );
}

const stepButton =
  "grid size-8 shrink-0 place-items-center rounded-full border border-line bg-button text-fg transition-colors hover:border-muted disabled:opacity-40";

/** A number with − and + around it; the number can also be typed. */
export function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  active?: boolean;
  onValueChange: (value: number) => void;
}) {
  return (
    <NumberInput.Root
      value={String(props.value)}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      allowMouseWheel
      clampValueOnBlur
      onValueChange={(e) => {
        if (Number.isFinite(e.valueAsNumber)) props.onValueChange(e.valueAsNumber);
      }}
      className={cx(
        "flex flex-col gap-2 rounded-xl border-[1.5px] bg-raised px-3.5 py-3",
        props.active ? "border-accent" : "border-line",
      )}
    >
      <NumberInput.Label
        className={cx(
          "font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
          props.active ? "text-accent" : "text-muted",
        )}
      >
        {props.label}
      </NumberInput.Label>
      <NumberInput.Control className="flex items-center justify-between gap-2">
        <NumberInput.DecrementTrigger aria-label={`Shorter ${props.label.toLowerCase()}`} className={stepButton}>
          <MinusIcon width={16} height={16} />
        </NumberInput.DecrementTrigger>
        <span className="flex items-baseline justify-center">
          <NumberInput.Input className="w-12 bg-transparent text-right font-display text-2xl font-bold tabular-nums text-fg outline-none focus-visible:underline" />
          <span className="pl-1 text-[13px] font-medium text-muted">{props.unit}</span>
        </span>
        <NumberInput.IncrementTrigger aria-label={`Longer ${props.label.toLowerCase()}`} className={stepButton}>
          <AddIcon width={16} height={16} />
        </NumberInput.IncrementTrigger>
      </NumberInput.Control>
    </NumberInput.Root>
  );
}

/** A round icon button with a small caption under it (+5 min, Skip, Reset). */
export function RoundButton(props: {
  label: string;
  caption?: string;
  size?: number;
  raised?: boolean;
  autoFocus?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const size = props.size ?? 44;
  return (
    <span className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={props.label}
        autoFocus={props.autoFocus}
        onClick={props.onClick}
        style={{ width: size, height: size }}
        className={cx(
          "grid place-items-center rounded-full border border-line bg-button text-fg transition-colors hover:border-muted active:translate-y-px",
          props.raised ? "shadow-[0_10px_24px_rgba(0,0,0,0.5)]" : "shadow-[0_4px_12px_rgba(0,0,0,0.5)]",
        )}
      >
        {props.children}
      </button>
      {props.caption && (
        <span aria-hidden className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
          {props.caption}
        </span>
      )}
    </span>
  );
}
