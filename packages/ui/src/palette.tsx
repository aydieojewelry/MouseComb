/**
 * The OmniBar list (FEAT-004): an always-open Ark Combobox whose results are
 * virtualized with TanStack Virtual, so thousands of apps and snippets stay fast.
 * The caller filters and ranks; this only shows, highlights and selects.
 */
import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type Ref } from "react";

import { cx } from "./cx";
import { SearchIcon } from "./icons";

export type PaletteItem = { key: string; title: string };

const ROW_HEIGHT = 48;

export function CommandPalette<T extends PaletteItem>(props: {
  items: T[];
  inputValue: string;
  onInputValueChange: (value: string) => void;
  onSelect: (item: T) => void;
  /** Escape pressed. */
  onEscape: () => void;
  renderItem: (item: T, highlighted: boolean) => ReactNode;
  placeholder: string;
  /** A line under the input: an error, or "press Enter again". */
  status?: ReactNode;
  footer?: ReactNode;
  emptyText?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Change it each time the palette is shown (resets mouse tracking). */
  openId?: number;
}) {
  const collection = useMemo(
    () => createListCollection({ items: props.items, itemToValue: (i) => i.key, itemToString: (i) => i.title }),
    [props.items],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: props.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // A window that opens under a resting mouse shouldn't let it steal the
  // highlight: hover counts only after the mouse really moves.
  const pointer = useRef<{ x: number; y: number } | "moved" | null>(null);
  useEffect(() => {
    pointer.current = null;
  }, [props.openId]);
  const gatePointer = (e: PointerEvent) => {
    const p = pointer.current;
    if (p === "moved") return;
    if (p === null) pointer.current = { x: e.clientX, y: e.clientY };
    else if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
      pointer.current = "moved";
      return;
    }
    e.stopPropagation();
  };

  // Something is always highlighted, so Enter always does something.
  const [picked, setPicked] = useState<string | null>(null);
  const highlighted = props.items.some((i) => i.key === picked) ? picked : (props.items[0]?.key ?? null);

  return (
    <Combobox.Root
      className="flex h-full flex-col"
      collection={collection}
      open
      disableLayer
      closeOnSelect={false}
      openOnClick={false}
      value={[]}
      inputValue={props.inputValue}
      onInputValueChange={(e) => {
        if (e.reason !== "item-select") props.onInputValueChange(e.inputValue);
      }}
      highlightedValue={highlighted}
      onHighlightChange={(e) => setPicked(e.highlightedValue)}
      selectionBehavior="preserve"
      onSelect={(e) => {
        const item = props.items.find((i) => i.key === e.itemValue);
        if (item) props.onSelect(item);
      }}
      scrollToIndexFn={(d) => virtualizer.scrollToIndex(d.index, { align: "auto" })}
      positioning={{ placement: "bottom-start", sameWidth: true, gutter: 0, flip: false, strategy: "fixed" }}
    >
      <Combobox.Control className="flex shrink-0 items-center gap-3 border-b border-line px-5">
        <SearchIcon className="shrink-0 text-muted" width={22} height={22} />
        <Combobox.Input
          ref={props.inputRef}
          autoFocus
          spellCheck={false}
          placeholder={props.placeholder}
          className="h-16 w-full bg-transparent font-display text-xl text-fg outline-none placeholder:text-muted"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              props.onEscape();
            }
          }}
        />
      </Combobox.Control>
      {props.status && <div className="shrink-0 border-b border-line px-5 py-2 text-sm">{props.status}</div>}
      <Combobox.Positioner className="!static !transform-none flex min-h-0 flex-1 flex-col">
        <Combobox.Content className="flex min-h-0 flex-1 flex-col outline-none">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2" onPointerMoveCapture={gatePointer}>
            {props.items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">{props.emptyText ?? "Nothing found."}</p>
            ) : (
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((row) => {
                  const item = props.items[row.index]!;
                  return (
                    <Combobox.Item
                      key={item.key}
                      item={item}
                      className={cx(
                        "absolute inset-x-0 top-0 flex cursor-default items-center rounded-lg px-3",
                        "data-[highlighted]:bg-raised",
                      )}
                      style={{ height: ROW_HEIGHT, transform: `translateY(${row.start}px)` }}
                    >
                      {props.renderItem(item, item.key === highlighted)}
                    </Combobox.Item>
                  );
                })}
              </div>
            )}
          </div>
          {props.footer && <div className="shrink-0 border-t border-line px-5 py-2 text-xs text-muted">{props.footer}</div>}
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  );
}
