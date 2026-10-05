import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { getLegalIdentity } from "@/lib/legal";

export const metadata: Metadata = { title: "Términos de uso" };

/* TEMPLATE — have a lawyer review it before launch. */

export default function TermsPage() {
  const legal = getLegalIdentity();
  const mail = (
    <a href={`mailto:${legal.email}`} className="underline underline-offset-2 hover:text-ink">
      {legal.email}
    </a>
  );

  const sections: LegalSection[] = [
    {
      title: "El servicio",
      body: [
        "PassMe te permite crear una tarjeta de contacto, publicarla en tu enlace (/u/…) y añadirla a Apple Wallet o Google Wallet.",
        "Tu tarjeta, tu QR y tu pase son gratis, para siempre. Si en el futuro añadimos funciones de pago, serán opcionales y nunca te cobraremos nada sin que lo aceptes.",
      ],
    },
    {
      title: "Tu cuenta",
      body: [
        "Entras con tu email (o con Google). Necesitas tener al menos 14 años. Cada cuenta tiene una tarjeta.",
        "Eres responsable de lo que ocurra con tu cuenta: no compartas los enlaces ni los códigos de acceso.",
      ],
    },
    {
      title: "Tu contenido",
      body: [
        "Lo que publicas en tu tarjeta es tuyo y eres responsable de ello: debe ser veraz y tienes que tener derecho a usarlo (por ejemplo, tu foto y el nombre de tu empresa).",
        "No puedes hacerte pasar por otra persona o empresa, ni publicar contenido ilegal, ofensivo o engañoso.",
      ],
    },
    {
      title: "Uso aceptable",
      body: [
        "No uses PassMe para enviar spam, recopilar datos de otras personas sin su permiso, saturar el servicio o saltarte sus medidas de seguridad.",
        "Podemos despublicar tarjetas o suspender cuentas que incumplan estas normas, avisándote cuando sea posible.",
      ],
    },
    {
      title: "Contactos que recibes",
      body: [
        "Si activas «Recibir contactos», las personas que te dejan sus datos te los confían a ti. Úsalos solo para lo que aceptaron (ponerte en contacto con ellas) y bórralos si te lo piden. Respecto a esos datos, tú eres el responsable y PassMe los guarda en tu nombre.",
        "Lo mismo con «Recibir propuestas de reunión»: los datos de quien te propone una reunión son para organizarla. PassMe solo hace de intermediario por email; lo que acordéis y la reunión en sí son cosa vuestra.",
      ],
    },
    {
      title: "Apple Wallet y Google Wallet",
      body: [
        "Los pases funcionan dentro de apps de Apple y Google, con sus propias condiciones. Si esas plataformas cambian o dejan de estar disponibles, PassMe puede verse afectado.",
      ],
    },
    {
      title: "Disponibilidad y cambios",
      body: [
        "Hacemos lo posible para que PassMe funcione siempre, pero se ofrece tal cual, sin garantía de disponibilidad continua. Podemos mejorar o cambiar funciones; si un cambio te afecta de forma importante, te avisaremos.",
      ],
    },
    {
      title: "Baja",
      body: [
        "Puedes borrar tu cuenta cuando quieras desde el editor (Cuenta › Borrar mi cuenta y mi tarjeta). Se borra todo lo asociado a ella.",
        <>Dudas o reclamaciones: {mail}. Estos términos se rigen por la ley española.</>,
      ],
    },
  ];

  return <LegalPage title="Términos de uso" intro="Las reglas del juego, en corto y en claro." sections={sections} />;
}
