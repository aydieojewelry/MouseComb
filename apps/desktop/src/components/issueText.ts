/** The first validation message of a TanStack Form field, if any. */
export function issueText(errors: unknown[]): string | undefined {
  const first = errors.find(Boolean);
  if (!first) return undefined;
  return typeof first === "string" ? first : ((first as { message?: string }).message ?? "Check this field.");
}
