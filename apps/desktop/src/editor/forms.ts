/** The text of a field's validation errors, for TextField's `error` prop. */
export function issueText(errors: unknown[]): string | undefined {
  const messages = errors
    .map((e) => (typeof e === "string" ? e : (e as { message?: string } | undefined)?.message))
    .filter((m): m is string => Boolean(m));
  return messages.length ? messages.join(" ") : undefined;
}
