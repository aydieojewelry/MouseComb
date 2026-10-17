import {
  errorMessage,
  useAccount,
  useServerUrl,
  useSetServerUrl,
  useSignIn,
  useSignOut,
  useSignUp,
  useSyncNow,
  useSyncStatus,
} from "@mousecomb/data";
import { Button, Dialog, Section, SignOutIcon, StatusDot, Switch, SyncIcon, TextField, toaster } from "@mousecomb/ui";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";

import { PageHeader } from "../components/PageHeader";
import { describeSync } from "../components/SyncBadge";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(71, "Use at most 71 characters."),
});

function issueText(errors: unknown[]): string | undefined {
  const first = errors.find(Boolean);
  if (!first) return undefined;
  return typeof first === "string" ? first : ((first as { message?: string }).message ?? "Check this field.");
}

export function AccountPage() {
  const { data: account, isPending } = useAccount();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <PageHeader
        title="Account & sync"
        description="Sign in to keep your settings, snippets and extension data the same on every PC and on your phone."
      />
      {isPending ? null : account ? <SignedIn email={account.email} server={account.backend_url} /> : <SignedOut />}
    </div>
  );
}

function SignedOut() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const { data: status } = useSyncStatus();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const action = mode === "sign-in" ? signIn : signUp;

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: credentialsSchema },
    onSubmit: async ({ value }) => {
      try {
        await action.mutateAsync(value);
        toaster.success({ title: mode === "sign-in" ? "Signed in" : "Account created", description: "Syncing your setup now." });
      } catch {
        // Shown under the form from `action.error`.
      }
    },
  });

  return (
    <>
      {status?.message && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {status.message}
        </p>
      )}
      <Section
        title={mode === "sign-in" ? "Sign in" : "Create an account"}
        description="Everything works without an account. Signing in adds sync: changes you make here appear on your other devices within a minute."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => (
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                error={issueText(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <TextField
                label="Password"
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                helper={mode === "sign-up" ? "At least 8 characters." : undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                error={issueText(field.state.meta.errors)}
              />
            )}
          </form.Field>
          {action.error && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(action.error)}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                signIn.reset();
                signUp.reset();
              }}
            >
              {mode === "sign-in" ? "New here? Create an account" : "Have an account? Sign in"}
            </Button>
            <Button type="submit" variant="primary" busy={action.isPending}>
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </div>
        </form>
      </Section>
      <ServerSection />
    </>
  );
}

function ServerSection() {
  const { data: url = "" } = useServerUrl();
  const save = useSetServerUrl();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? url;
  return (
    <Section
      title="Sync server"
      description="Your own MouseComb server (PocketBase). Leave it unless you host one somewhere else."
    >
      <div className="flex items-end gap-3">
        <TextField
          className="flex-1"
          label="Server address"
          value={value}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          error={save.error ? errorMessage(save.error) : undefined}
        />
        <Button
          disabled={draft === null || draft === url}
          busy={save.isPending}
          onClick={() =>
            save.mutate(value, {
              onSuccess: () => {
                setDraft(null);
                toaster.success({ title: "Server saved" });
              },
            })
          }
        >
          Save
        </Button>
      </div>
    </Section>
  );
}

function SignedIn(props: { email: string; server: string }) {
  const { data: status } = useSyncStatus();
  const syncNow = useSyncNow();
  const signOut = useSignOut();
  const [confirm, setConfirm] = useState(false);
  const [keepData, setKeepData] = useState(true);
  const { tone, label } = describeSync(status);

  return (
    <>
      <Section
        title="Signed in"
        aside={
          <Button
            busy={syncNow.isPending || status?.state === "syncing"}
            onClick={() =>
              syncNow.mutate(undefined, {
                onError: (e) => toaster.error({ title: "Sync didn't finish", description: errorMessage(e) }),
              })
            }
          >
            <SyncIcon />
            Sync now
          </Button>
        }
      >
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted">Account</dt>
          <dd className="m-0 truncate">{props.email}</dd>
          <dt className="text-muted">Status</dt>
          <dd className="m-0 flex items-center gap-2">
            <StatusDot tone={tone} pulse={status?.state === "syncing"} />
            {label}
          </dd>
          {status?.message && (
            <>
              <dt className="text-muted">Details</dt>
              <dd className="m-0 text-warn">{status.message}</dd>
            </>
          )}
          <dt className="text-muted">Server</dt>
          <dd className="m-0 truncate font-mono text-xs leading-5 text-muted">{props.server}</dd>
        </dl>
      </Section>
      <Section
        title="Sign out"
        description="Stops syncing on this PC. Your data stays safe on the server and on your other devices."
        aside={
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <SignOutIcon />
            Sign out
          </Button>
        }
      >
        {null}
      </Section>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out of MouseComb?"
        description={`You can sign back in as ${props.email} at any time.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={signOut.isPending}
              onClick={() =>
                signOut.mutate(keepData, {
                  onSuccess: () => {
                    setConfirm(false);
                    toaster.success({ title: "Signed out" });
                  },
                })
              }
            >
              Sign out
            </Button>
          </>
        }
      >
        <Switch
          label="Keep my settings and snippets on this PC"
          description="Turn off on a shared computer."
          checked={keepData}
          onCheckedChange={setKeepData}
        />
      </Dialog>
    </>
  );
}
