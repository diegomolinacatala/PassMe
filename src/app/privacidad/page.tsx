import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Privacidad" };

/*
 * TEMPLATE — review with a lawyer before launch and fill in the controller
 * details (name, NIF, address, contact email). See docs/SETUP.md › Legal.
 */
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacidad@tu-dominio.com";

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "Qué datos guardamos",
    body: [
      "Tu email, para que puedas entrar sin contraseña.",
      "Lo que tú escribes en tu tarjeta: nombre, cargo, empresa, ubicación, biografía, foto y los contactos que añadas. Los contactos que marcas como ocultos se guardan, pero nunca se muestran ni se envían a quien visita tu tarjeta.",
      "Estadísticas agregadas de tu tarjeta (visitas, clics, contactos guardados). No guardamos direcciones IP ni usamos cookies de seguimiento de los visitantes.",
      "Si añades tu pase a Apple Wallet, el identificador del dispositivo y el token de notificaciones que Apple nos envía, solo para poder actualizar el pase.",
    ],
  },
  {
    title: "Para qué los usamos",
    body: [
      "Para mostrar tu tarjeta a quien tú se la enseñes, generar tus pases de Apple Wallet y Google Wallet y mantenerlos actualizados.",
      "No vendemos tus datos ni los usamos para publicidad.",
    ],
  },
  {
    title: "Con quién los compartimos",
    body: [
      "Proveedores que necesitamos para funcionar: Supabase (base de datos, autenticación y almacenamiento), Vercel (alojamiento), Apple y Google (solo los datos del pase, cuando tú decides añadirlo a su cartera).",
      "Quien escanea tu QR ve únicamente los datos que tú has marcado como visibles.",
    ],
  },
  {
    title: "Tus derechos",
    body: [
      "Puedes editar o despublicar tu tarjeta en cualquier momento desde el editor.",
      "Puedes borrar tu cuenta desde el editor (Cuenta › Eliminar): se borran tu tarjeta, tu foto, tus estadísticas y tus registros de dispositivos.",
      `Para cualquier otra petición (acceso, rectificación, portabilidad, oposición) escríbenos a ${CONTACT_EMAIL}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`,
    ],
  },
  {
    title: "Cookies",
    body: [
      "Solo usamos cookies técnicas para mantener tu sesión iniciada. No hay cookies de analítica ni de publicidad, por eso no verás un banner de cookies.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
      <Logo />
      <p className="eyebrow mt-14">Última actualización: septiembre de 2026</p>
      <h1 className="mt-3 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">Privacidad</h1>
      <p className="mt-6 text-lg leading-relaxed text-ink-soft">
        PassMe existe para que compartas solo lo que quieras. Esta página explica, sin letra pequeña, qué datos tratamos y
        por qué.
      </p>
      <div className="mt-12 space-y-12">
        {SECTIONS.map((section, index) => (
          <section key={section.title}>
            <p className="font-mono text-[11px] tracking-[0.16em] text-signal">{String(index + 1).padStart(2, "0")}</p>
            <h2 className="mt-1 font-display text-3xl leading-none">{section.title}</h2>
            <ul className="mt-4 space-y-3 leading-relaxed text-ink-soft">
              {section.body.map((paragraph) => (
                <li key={paragraph} className="border-l-2 border-line pl-4">
                  {paragraph}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
