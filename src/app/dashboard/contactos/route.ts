import { NextResponse, type NextRequest } from "next/server";
import { isNavigation } from "@/lib/pass/http";
import { contactRequestsToCsv, contactRequestsToVCard } from "@/lib/card/contact";
import { listOwnContactRequests } from "@/lib/data/contact-requests";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Owner-only export of the contacts people left on their card:
 *   ?format=csv            → every request as a spreadsheet
 *   ?format=vcf[&id=<id>]  → one or all requests for the phone's Contacts app
 * The session is re-checked here; RLS limits the rows to the owner's card.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const user = supabase ? await getSessionUser(supabase) : null;
  if (!supabase || !user) {
    // A followed link goes to the login page; a script gets the status.
    if (isNavigation(request)) return NextResponse.redirect(new URL("/login?next=/dashboard", request.url), { status: 303 });
    return new Response("Entra con tu email para descargarlo.", { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "csv" ? "csv" : "vcf";
  const id = params.get("id");

  const { requests } = await listOwnContactRequests(supabase);
  const selected = id ? requests.filter((r) => r.id === id) : requests;
  if (id && selected.length === 0) {
    if (isNavigation(request)) return NextResponse.redirect(new URL("/dashboard#contactos", request.url), { status: 303 });
    return new Response("Contacto no encontrado", { status: 404 });
  }

  const date = new Date().toISOString().slice(0, 10);
  const single = selected.length === 1 && id ? selected[0]!.name : null;
  const filename =
    format === "csv"
      ? `passme-contactos-${date}.csv`
      : `${(single ?? "passme-contactos").normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contacto"}.vcf`;

  const body = format === "csv" ? contactRequestsToCsv(selected) : contactRequestsToVCard(selected);
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
