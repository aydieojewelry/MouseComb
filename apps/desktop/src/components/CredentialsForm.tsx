import { errorMessage, useRequestPasswordReset, useSignIn, useSignUp } from "@mousecomb/data";
import { Button, Dialog, TextField, toaster } from "@mousecomb/ui";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";

import { issueText } from "./issueText";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(71, "Use at most 71 characters."),
});

/** Sign in or create an account (FEAT-021), with a password-reset link. */
export function CredentialsForm(props: { onSignedIn?: () => void }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [resetOpen, setResetOpen] = useState(false);
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
        props.onSignedIn?.();
      } catch {
        // Shown under the form from `action.error`.
      }
    },
  });

  return (
    <>
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
          <p role="alert" className="m-0 text-sm text-danger">
            {errorMessage(action.error)}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              className="px-2"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                signIn.reset();
                signUp.reset();
              }}
            >
              {mode === "sign-in" ? "Create an account" : "Have an account? Sign in"}
            </Button>
            {mode === "sign-in" && (
              <Button variant="ghost" className="px-2" onClick={() => setResetOpen(true)}>
                Forgot password?
              </Button>
            )}
          </div>
          <Button type="submit" variant="primary" busy={action.isPending}>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </div>
      </form>
      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}

function ResetPasswordDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const reset = useRequestPasswordReset();
  const close = () => {
    props.onOpenChange(false);
    reset.reset();
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        reset.isSuccess ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" busy={reset.isPending} onClick={() => reset.mutate(email)}>
              Send link
            </Button>
          </>
        )
      }
    >
      {reset.isSuccess ? (
        <p className="m-0 text-sm">If {email.trim()} has an account, the link is on its way. Check your inbox and spam folder.</p>
      ) : (
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={reset.error ? errorMessage(reset.error) : undefined}
        />
      )}
    </Dialog>
  );
}
