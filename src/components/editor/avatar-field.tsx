"use client";

import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/card/avatar";
import { AVATAR_SIZE_PX, newAvatarPath } from "@/lib/card/avatar";
import { AVATAR_BUCKET } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const JPEG_QUALITY = 0.86;

/** Center-crops any image to a square JPEG so every avatar is small and consistent. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE_PX;
  canvas.height = AVATAR_SIZE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE_PX,
    AVATAR_SIZE_PX,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", JPEG_QUALITY),
  );
}

interface AvatarFieldProps {
  userId: string;
  name: string;
  url: string | null;
  demo: boolean;
  onChange: (path: string | null, url: string | null) => void;
}

export function AvatarField({ userId, name, url, demo, onChange }: AvatarFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Elige una imagen (JPG, PNG, HEIC…).");
    if (file.size > MAX_INPUT_BYTES) return setError("La imagen es demasiado grande (máx. 15 MB).");

    setBusy(true);
    try {
      const blob = await toSquareJpeg(file);
      if (demo) {
        onChange(null, URL.createObjectURL(blob));
        return;
      }
      const supabase = getBrowserSupabase();
      if (!supabase) throw new Error("Supabase no configurado");
      const path = newAvatarPath(userId);
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      onChange(path, data.publicUrl);
    } catch {
      setError("No hemos podido subir la foto. Prueba con otra imagen.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        <Avatar name={name || "?"} url={url} size={88} className="text-ink ring-1 ring-line" />
        {busy ? (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/40 text-white">
            <LoaderCircle className="size-6 animate-spin" aria-label="Subiendo foto" />
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/80 px-3.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            <Camera className="size-4" aria-hidden />
            {url ? "Cambiar foto" : "Subir foto"}
          </button>
          {url ? (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:bg-danger-wash hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
              Quitar
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted">Cuadrada, se recorta sola. Aparece en el pase y al guardar tu contacto.</p>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
