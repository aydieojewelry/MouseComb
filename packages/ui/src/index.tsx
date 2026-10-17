/**
 * MouseComb components: Ark UI (Zag.js state machines) styled with the
 * tokens in styles.css. Apps use these instead of raw Ark parts.
 */
import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { Portal } from "@ark-ui/react/portal";
import { Slider as ArkSlider } from "@ark-ui/react/slider";
import { Switch as ArkSwitch } from "@ark-ui/react/switch";
import { Toast, Toaster as ArkToaster, createToaster } from "@ark-ui/react/toast";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export * from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover font-semibold",
  secondary: "bg-raised text-fg border border-line hover:border-muted",
  ghost: "text-muted hover:text-fg hover:bg-raised",
  danger: "bg-raised text-danger border border-line hover:border-danger",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }
>(function Button({ variant = "secondary", busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

const inputClass =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg placeholder:text-muted " +
  "outline-none transition-colors focus:border-accent data-[invalid]:border-danger";

type FieldProps = {
  label: string;
  helper?: ReactNode;
  error?: string;
  className?: string;
};

export function TextField({
  label,
  helper,
  error,
  className,
  ...input
}: FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">) {
  return (
    <Field.Root invalid={Boolean(error)} className={cx("flex flex-col gap-1.5", className)}>
      <Field.Label className="text-xs font-medium text-muted">{label}</Field.Label>
      <Field.Input className={inputClass} {...input} />
      {helper && !error && <Field.HelperText className="text-xs text-muted">{helper}</Field.HelperText>}
      {error && <Field.ErrorText className="text-xs text-danger">{error}</Field.ErrorText>}
    </Field.Root>
  );
}

export function TextArea({
  label,
  helper,
  error,
  className,
  ...input
}: FieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  return (
    <Field.Root invalid={Boolean(error)} className={cx("flex flex-col gap-1.5", className)}>
      <Field.Label className="text-xs font-medium text-muted">{label}</Field.Label>
      <Field.Textarea className={cx(inputClass, "min-h-32 resize-y font-mono")} {...input} />
      {helper && !error && <Field.HelperText className="text-xs text-muted">{helper}</Field.HelperText>}
      {error && <Field.ErrorText className="text-xs text-danger">{error}</Field.ErrorText>}
    </Field.Root>
  );
}

export function Switch(props: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <ArkSwitch.Root
      checked={props.checked}
      disabled={props.disabled}
      onCheckedChange={(e) => props.onCheckedChange(e.checked)}
      className="flex cursor-pointer items-center justify-between gap-6 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
    >
      <span className="flex flex-col gap-0.5">
        <ArkSwitch.Label className="text-sm text-fg">{props.label}</ArkSwitch.Label>
        {props.description && <span className="text-xs text-muted">{props.description}</span>}
      </span>
      <ArkSwitch.Control className="relative h-6 w-11 shrink-0 rounded-full border border-line bg-raised transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent">
        <ArkSwitch.Thumb className="absolute left-0.5 top-0.5 size-4.5 rounded-full bg-muted transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-accent-ink" />
      </ArkSwitch.Control>
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  );
}

export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onValueChange: (value: number) => void;
}) {
  return (
    <ArkSlider.Root
      value={[props.value]}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onValueChange={(e) => props.onValueChange(e.value[0] ?? props.value)}
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between">
        <ArkSlider.Label className="text-sm text-fg">{props.label}</ArkSlider.Label>
        <span className="font-mono text-xs tabular-nums text-muted">
          {props.value}
          {props.unit}
        </span>
      </div>
      <ArkSlider.Control className="relative flex h-5 items-center">
        <ArkSlider.Track className="h-1.5 w-full rounded-full bg-raised">
          <ArkSlider.Range className="h-full rounded-full bg-accent" />
        </ArkSlider.Track>
        <ArkSlider.Thumb
          index={0}
          className="size-4 rounded-full border-2 border-accent bg-idle outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArkSlider.HiddenInput />
        </ArkSlider.Thumb>
      </ArkSlider.Control>
    </ArkSlider.Root>
  );
}

export function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ArkDialog.Root open={props.open} onOpenChange={(e) => props.onOpenChange(e.open)} lazyMount unmountOnExit>
      <Portal>
        <ArkDialog.Backdrop className="fixed inset-0 bg-idle/70" />
        <ArkDialog.Positioner className="fixed inset-0 flex items-center justify-center p-4">
          <ArkDialog.Content className="flex w-full max-w-md flex-col gap-4 rounded-modal border border-line bg-surface p-6 shadow-2xl">
            <div className="flex flex-col gap-1">
              <ArkDialog.Title className="font-display text-lg font-semibold">{props.title}</ArkDialog.Title>
              {props.description && (
                <ArkDialog.Description className="text-sm text-muted">{props.description}</ArkDialog.Description>
              )}
            </div>
            {props.children}
            {props.footer && <div className="flex justify-end gap-2">{props.footer}</div>}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}

/** One toaster for the whole window. */
export const toaster = createToaster({ placement: "bottom-end", gap: 8, max: 3 });

export function Toaster() {
  return (
    <ArkToaster toaster={toaster}>
      {(toast) => (
        <Toast.Root
          className={cx(
            "w-80 rounded-lg border bg-surface px-4 py-3 shadow-xl",
            toast.type === "error" ? "border-danger" : "border-line",
          )}
        >
          <Toast.Title className="text-sm font-semibold">{toast.title}</Toast.Title>
          {toast.description && <Toast.Description className="text-xs text-muted">{toast.description}</Toast.Description>}
        </Toast.Root>
      )}
    </ArkToaster>
  );
}

/** A titled group of settings rows. */
export function Section(props: { title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-modal border border-line bg-idle/40 p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold">{props.title}</h2>
          {props.description && <p className="max-w-prose text-sm text-muted">{props.description}</p>}
        </div>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

const dotColor = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", muted: "bg-muted", accent: "bg-accent" } as const;

export function StatusDot(props: { tone: keyof typeof dotColor; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-2 shrink-0 rounded-full", dotColor[props.tone], props.pulse && "animate-pulse")}
    />
  );
}

export function Kbd(props: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line border-b-2 bg-raised px-1.5 py-0.5 font-mono text-xs text-fg">
      {props.children}
    </kbd>
  );
}
