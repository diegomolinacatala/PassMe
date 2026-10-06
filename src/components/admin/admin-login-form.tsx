"use client";

import { useActionState } from "react";
import { adminLoginAction, type AdminLoginState } from "@/app/admin/actions";
import { Field, InlineError, inputClasses } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function AdminLoginForm() {
  const [state, action] = useActionState<AdminLoginState, FormData>(adminLoginAction, {});

  return (
    <form action={action} className="space-y-5" noValidate>
      <Field label="Usuario">
        {(props) => (
          <input
            {...props}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            defaultValue={state.username}
            className={inputClasses()}
          />
        )}
      </Field>
      <Field label="Contraseña">
        {(props) => (
          <input {...props} name="password" type="password" autoComplete="current-password" required className={inputClasses()} />
        )}
      </Field>
      {state.error ? <InlineError live>{state.error}</InlineError> : null}
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
