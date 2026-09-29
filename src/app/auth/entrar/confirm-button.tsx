"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="signal" size="lg" className="w-full" disabled={pending} aria-busy={pending} autoFocus>
      {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
      {pending ? "Entrando…" : "Entrar en PassMe"}
    </Button>
  );
}
