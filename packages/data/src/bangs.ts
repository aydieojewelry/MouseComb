import { z } from "zod";

import { createItemCollection } from "./items";

/** A user's own bang: `!jira login bug` searches your Jira. */
export const bangInputSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(60, "Keep the name under 60 characters."),
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+$/, "Use a web address starting with https://")
    .refine((s) => s.includes("{q}"), "Put {q} where the search words go."),
});

export const bangTriggerSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{1,16}$/, "Use 1 to 16 letters or numbers, without the !");

export type Bang = z.infer<typeof bangInputSchema> & { trigger: string };

/** Your own bangs, synced across devices. The trigger is the item key, so one trigger is one bang. */
export const bangsCollection = createItemCollection<Bang>({
  id: "bangs",
  kind: "bang",
  getKey: (b) => b.trigger,
  fromItem: (item) => {
    const parsed = bangInputSchema.safeParse(item.data);
    const trigger = bangTriggerSchema.safeParse(item.key);
    return parsed.success && trigger.success ? { trigger: trigger.data, ...parsed.data } : null;
  },
  toData: ({ name, url }) => ({ name, url }),
});
