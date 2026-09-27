import { CalendarDays, Globe, Link2, Mail, MessageCircle, Phone, Send, type LucideProps } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { LinkKind } from "@/lib/card/links";

/*
 * Brand glyphs drawn in Lucide's 24px/2px-stroke style so they sit well next to
 * Lucide icons. LinkedIn/Instagram/YouTube/GitHub paths come from Lucide's
 * former brand set (ISC license); X and TikTok are simplified PassMe drawings.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const LinkedInIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </Glyph>
);

const InstagramIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </Glyph>
);

const YouTubeIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </Glyph>
);

const GitHubIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </Glyph>
);

const XIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 4h4.2L20 20h-4.2z" />
    <path d="M19.5 4 13.3 10.8" />
    <path d="M4.5 20l6.2-6.8" />
  </Glyph>
);

const TikTokIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
    <path d="M14 3c.4 2.6 2.4 4.6 5 5" />
  </Glyph>
);

type AnyIcon = ComponentType<IconProps> | ComponentType<LucideProps>;

const ICONS: Record<LinkKind, AnyIcon> = {
  email: Mail,
  phone: Phone,
  whatsapp: MessageCircle,
  linkedin: LinkedInIcon,
  website: Globe,
  instagram: InstagramIcon,
  x: XIcon,
  github: GitHubIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  telegram: Send,
  booking: CalendarDays,
  custom: Link2,
};

export function LinkIcon({ kind, size = 20, className }: { kind: LinkKind; size?: number; className?: string }) {
  const Icon = ICONS[kind] as ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  return <Icon size={size} className={className} aria-hidden />;
}
