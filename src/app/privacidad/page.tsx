import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { getLegalIdentity } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacidad" };

/*
 * TEMPLATE — have a lawyer review it before launch. The controller details come
 * from NEXT_PUBLIC_LEGAL_* (see .env.example). Keep it true to what the code
 * does: retention periods mirror cleanup_expired_data() and the migrations.
 */

export default function PrivacyPage() {
  const legal = getLegalIdentity();
  const mail = (
    <a href={`mailto:${legal.email}`} className="underline underline-offset-2 hover:text-ink">
      {legal.email}
    </a>
  );

  const sections: LegalSection[] = [
    {
      title: "Quién es el responsable",
      body: [
        <>
          {legal.name} · NIF {legal.taxId} · {legal.address}. Para cualquier cuestión sobre tus datos: {mail}.
        </>,
      ],
    },
    {
      title: "Qué datos guardamos",
      body: [
        "Tu email, para que puedas entrar sin contraseña.",
        "Lo que tú escribes en tu tarjeta: nombre, cargo, empresa, ubicación, biografía, foto y los contactos que añadas. Los contactos que marcas como ocultos se guardan, pero nunca se muestran ni se envían a quien visita tu tarjeta.",
        "Estadísticas de tu tarjeta (visitas, clics, contactos guardados). No guardamos direcciones IP ni usamos cookies de seguimiento: una visita se cuenta una vez por sesión del navegador.",
        "Si añades tu pase a Apple Wallet, el identificador del dispositivo y el token de notificaciones que Apple nos envía, solo para poder actualizar el pase.",
        "Si activas el formulario «Te dejo mi contacto», los datos que otras personas te dejan (ver el apartado siguiente).",
        "Para frenar abusos (spam, fuerza bruta) guardamos contadores asociados a un identificador seudonimizado de tu conexión (un hash con clave secreta de la IP, que no permite recuperarla) durante como mucho un día, y durante 24 horas los intentos de código de acceso asociados a un hash de tu email.",
      ],
    },
    {
      id: "contactos",
      title: "Si dejas tu contacto en una tarjeta",
      body: [
        "Cuando rellenas «Te dejo mi contacto» en la tarjeta de alguien, tus datos (nombre, email o teléfono, empresa y mensaje) se envían a esa persona, que es quien decide cómo usarlos. PassMe los guarda en su nombre, visibles solo para ella.",
        "La base legal es tu consentimiento, que das al marcar la casilla. Puedes retirarlo pidiéndole a esa persona que borre tus datos, o escribiéndonos y lo trasladamos.",
        "Se conservan hasta que el dueño de la tarjeta los borra o elimina su cuenta, como mucho 24 meses (y solo los 1.000 más recientes por tarjeta).",
      ],
    },
    {
      title: "Para qué los usamos",
      body: [
        "Para prestarte el servicio: mostrar tu tarjeta a quien tú se la enseñes, generar tus pases de Apple Wallet y Google Wallet y mantenerlos actualizados (ejecución del contrato).",
        "Para proteger el servicio y a sus usuarios frente a abusos (interés legítimo).",
        "Para avisarte por email de que alguien te ha dejado su contacto, si tienes el formulario activado (el aviso no incluye sus datos: los ves en tu editor).",
        "No vendemos tus datos ni los usamos para publicidad.",
      ],
    },
    {
      title: "Con quién los compartimos",
      body: [
        "Proveedores que necesitamos para funcionar, con contrato de encargo de tratamiento: Supabase (base de datos, acceso y fotos; servidores en la UE), Vercel (alojamiento), Resend (envío de emails) y, si está activa, Cloudflare Turnstile (verificación anti-spam en los formularios).",
        "Apple y Google reciben los datos del pase solo cuando tú decides añadirlo a su cartera.",
        "Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo; en ese caso se amparan en cláusulas contractuales tipo o en el Marco de Privacidad de Datos UE-EE. UU.",
        "Quien escanea tu QR ve únicamente los datos que tú has marcado como visibles.",
      ],
    },
    {
      title: "Cuánto tiempo",
      body: [
        "Tu cuenta y tu tarjeta, hasta que la borres. Las estadísticas, unos 13 meses.",
        "Al borrar la cuenta se eliminan tu tarjeta, tu foto, tus estadísticas, los contactos recibidos y los registros de dispositivos. Solo el texto de tus enlaces (/u/…) queda reservado 90 días para que nadie pueda suplantarte con tus QR antiguos.",
      ],
    },
    {
      title: "Tus derechos",
      body: [
        "Puedes editar o despublicar tu tarjeta en cualquier momento, y borrar tu cuenta desde el editor (Cuenta › Eliminar).",
        <>
          Para ejercer tus derechos de acceso, rectificación, supresión, portabilidad, limitación u oposición, escríbenos a {mail}.
          También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
        </>,
      ],
    },
    {
      title: "Cookies",
      body: [
        "Solo usamos cookies técnicas para mantener tu sesión iniciada, y el almacenamiento del navegador para no contar dos veces la misma visita. No hay cookies de analítica ni de publicidad, por eso no verás un banner de cookies.",
      ],
    },
  ];

  return (
    <LegalPage
      title="Privacidad"
      intro="PassMe existe para que compartas solo lo que quieras. Esta página explica, sin letra pequeña, qué datos tratamos y por qué."
      sections={sections}
    />
  );
}
