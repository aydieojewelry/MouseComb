import { errorMessage } from "@mousecomb/data";
import { Button } from "@mousecomb/ui";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

/** Shown when a page can't load: what went wrong, and a way to try again. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div role="alert" className="grid h-full place-items-center p-8">
      <div className="flex max-w-md flex-col items-start gap-3 rounded-modal border border-line bg-card p-6">
        <h1 className="font-display text-lg font-semibold">This page didn't load</h1>
        <p className="text-sm text-muted">{errorMessage(error)}</p>
        <Button
          variant="primary"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
