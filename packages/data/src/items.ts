import { commands, events, type Item } from "@mousecomb/bindings";
import { createCollection, type Collection } from "@tanstack/react-db";

import { unwrap } from "./errors";

type ItemCollectionOptions<Row extends object> = {
  /** Collection id, unique per window. */
  id: string;
  /** Item kind in the Rust store (`setting`, `snippet`, `ext`, …). */
  kind: string;
  /** Primary key of a row; must equal the item key. */
  getKey: (row: Row) => string;
  /** Rows from stored items. Return `null` to skip items that don't parse. */
  fromItem: (item: Item) => Row | null;
  /** The JSON stored for a row. */
  toData: (row: Row) => unknown;
};

/**
 * A live TanStack DB collection of one item kind, backed by the Rust store.
 *
 * Sync: subscribes to `items-changed` first, then loads the list, and reloads
 * whenever Rust reports a change to this kind: from this window, a hotkey, an
 * extension, or another device via sync. Writes call the typed commands and
 * wait for the reload, so optimistic rows hand over to synced rows without a
 * flicker (TanStack DB custom-adapter skill: "refetch" strategy).
 */
export function createItemCollection<Row extends object>(
  opts: ItemCollectionOptions<Row>,
): Collection<Row, string> {
  let reload: () => Promise<void> = async () => {};

  return createCollection<Row, string>({
    id: opts.id,
    getKey: opts.getKey,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady, markError, collection }) => {
        // What the store last reported, as rows and as JSON for cheap comparison.
        // Kept here rather than read from `collection`, which also shows
        // optimistic changes still in flight.
        const synced = new Map<string, { row: Row; json: string }>();
        let ready = false;
        let disposed = false;
        let queue = Promise.resolve();

        const load = async () => {
          const items = await unwrap(commands.itemsList(opts.kind));
          if (disposed) return;
          const next = new Map<string, Row>();
          for (const item of items) {
            const row = opts.fromItem(item);
            if (row) next.set(opts.getKey(row), row);
          }
          begin();
          for (const [key, row] of next) {
            const json = JSON.stringify(row);
            const before = synced.get(key);
            if (!before) write({ type: "insert", value: row });
            else if (before.json !== json) write({ type: "update", value: row });
            synced.set(key, { row, json });
          }
          for (const [key, { row }] of [...synced]) {
            if (!next.has(key)) {
              write({ type: "delete", value: row });
              synced.delete(key);
            }
          }
          commit();
        };

        // Reloads run one after another, never overlapping.
        reload = () => {
          queue = queue.then(load, load);
          return queue;
        };

        let pending = false;
        const unlisten = events.itemsChanged.listen((event) => {
          if (event.payload.kind !== opts.kind) return;
          if (!ready) {
            pending = true;
            return;
          }
          void reload().catch(console.error);
        });

        reload()
          .then(async () => {
            ready = true;
            if (pending) await reload();
            markReady();
          })
          .catch((error: unknown) => {
            if (collection.status === "loading") markError(error as Error);
          });

        return () => {
          disposed = true;
          void unlisten.then((stop) => stop());
        };
      },
    },
    onInsert: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await unwrap(commands.itemPut(opts.kind, opts.getKey(m.modified), opts.toData(m.modified)));
      }
      await reload();
    },
    onUpdate: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await unwrap(commands.itemPut(opts.kind, opts.getKey(m.modified), opts.toData(m.modified)));
      }
      await reload();
    },
    onDelete: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await unwrap(commands.itemDelete(opts.kind, String(m.key)));
      }
      await reload();
    },
  });
}
