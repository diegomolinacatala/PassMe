import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { getLegalIdentity } from "@/lib/legal";

export const metadata: Metadata = { title: "Aviso legal" };

/*
 * TEMPLATE (LSSI-CE art. 10) — have a lawyer review it before launch. The
 * owner's details come from NEXT_PUBLIC_LEGAL_* (see .env.example).
 */

export default function LegalNoticePage() {
  const legal = getLegalIdentity();
  const mail = (
    <a href={`mailto:${legal.email}`} className="underline underline-offset-2 hover:text-ink">
      {legal.email}
    </a>
  );

  const sections: LegalSection[] = [
    {
      title: "Titular",
      body: [
        <>
          Este sitio y el servicio PassMe pertenecen a {legal.name}, con NIF {legal.taxId} y domicilio en {legal.address}. Contacto:{" "}
          {mail}.
        </>,
      ],
    },
    {
      title: "Objeto",
      body: [
        "PassMe permite crear una tarjeta de contacto digital, publicarla en una página propia y añadirla como pase a Apple Wallet y Google Wallet para compartirla con un QR.",
        "El uso del servicio implica aceptar este aviso, los términos de uso y la política de privacidad.",
      ],
    },
    {
      title: "Contenido de los usuarios",
      body: [
        "Cada persona es responsable de lo que publica en su tarjeta. PassMe no revisa el contenido antes de publicarlo.",
        <>
          Si ves una tarjeta que suplanta a alguien o incluye contenido ilícito, escríbenos a {mail} y actuaremos con rapidez para
          retirarla.
        </>,
      ],
    },
    {
      title: "Propiedad intelectual",
      body: [
        "El diseño, el código, la marca y los textos de PassMe pertenecen a su titular. Los contenidos de cada tarjeta son de quien los publica, que autoriza a PassMe a mostrarlos para prestar el servicio.",
      ],
    },
    {
      title: "Enlaces a terceros",
      body: [
        "Las tarjetas enlazan a sitios de terceros (redes sociales, webs, agendas). PassMe no controla ni responde de esos sitios.",
      ],
    },
    {
      title: "Ley aplicable",
      body: [
        "Este aviso se rige por la ley española. Para cualquier controversia serán competentes los juzgados que correspondan según la normativa de consumidores y usuarios.",
      ],
    },
  ];

  return <LegalPage title="Aviso legal" intro="Quién está detrás de PassMe y las reglas básicas del sitio." sections={sections} />;
}
