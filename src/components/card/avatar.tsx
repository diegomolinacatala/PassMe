import { initials } from "@/lib/card/name";
import { cn } from "@/lib/cn";

// Re-exported: the pass renderers and the editor import it from here.
export { initials };

interface AvatarProps {
  name: string;
  url: string | null;
  /** Diameter in px. */
  size: number;
  className?: string;
}

/** Round avatar; falls back to serif initials on a translucent disc. */
export function Avatar({ name, url, size, className }: AvatarProps) {
  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user uploads live on Supabase Storage; no optimizer needed at this size
      <img
        src={url}
        alt={name ? `Foto de ${name}` : "Foto de perfil"}
        width={size}
        height={size}
        style={style}
        className={cn("shrink-0 rounded-full object-cover", className)}
        decoding="async"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{ ...style, fontSize: size * 0.4 }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-current/12 font-display leading-none select-none",
        className,
      )}
    >
      <span className="translate-y-[4%]">{initials(name)}</span>
    </div>
  );
}
