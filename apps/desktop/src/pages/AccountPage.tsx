import { errorMessage, useAccount, useServerUrl, useSetServerUrl, useSignOut, useSyncNow, useSyncStatus } from "@mousecomb/data";
import { Button, Dialog, Section, SignOutIcon, StatusDot, Switch, SyncIcon, TextField, toaster } from "@mousecomb/ui";
import { useState } from "react";

import { CredentialsForm } from "../components/CredentialsForm";
import { PageHeader } from "../components/PageHeader";
import { describeSync } from "../components/SyncBadge";

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
  const { data: status } = useSyncStatus();
  return (
    <>
      {status?.message && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {status.message}
        </p>
      )}
      <Section
        title="Sign in or create an account"
        description="Everything works without an account. Signing in adds sync: changes you make here appear on your other devices within a minute."
      >
        <CredentialsForm />
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
