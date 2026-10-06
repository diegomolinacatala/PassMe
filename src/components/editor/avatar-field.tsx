"use client";

import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/card/avatar";
import { AVATAR_SIZE_PX, newAvatarPath } from "@/lib/card/avatar";
import { cropRect, isHeic, type CropView } from "@/lib/card/crop";
import { AVATAR_BUCKET } from "@/lib/env";
import { InlineError } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { PhotoCropSheet, type CropSource } from "./photo-crop-sheet";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const JPEG_QUALITY = 0.86;

/** The framed square of the photo as a small, consistent JPEG. */
async function toSquareJpeg(bitmap: ImageBitmap, view: CropView): Promise<Blob> {
  const { sx, sy, size } = cropRect(view);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE_PX;
  canvas.height = AVATAR_SIZE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", JPEG_QUALITY),
  );
}

const HEIC_ERROR = "Tu navegador no abre fotos HEIC. Expórtala como JPG o hazle una captura.";

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

  // The picked photo waiting to be framed (decoded once; the sheet shows its object URL).
  const [picked, setPicked] = useState<{ bitmap: ImageBitmap; source: CropSource } | null>(null);

  function release() {
    if (!picked) return;
    URL.revokeObjectURL(picked.source.url);
    picked.bitmap.close();
    setPicked(null);
  }

  async function handleFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(null);
    const heic = isHeic(file);
    if (!file.type.startsWith("image/") && !heic) return setError("Elige una imagen (JPG o PNG).");
    if (file.size > MAX_INPUT_BYTES) return setError("La imagen es demasiado grande (máx. 15 MB).");

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return setError(heic ? HEIC_ERROR : "No hemos podido abrir esa imagen. Prueba con otra.");
    }
    setPicked({ bitmap, source: { url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height } });
  }

  async function upload(view: CropView) {
    if (!picked) return;
    setBusy(true);
    try {
      const blob = await toSquareJpeg(picked.bitmap, view);
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
      release();
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink/80 px-4 text-sm font-medium transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            <Camera className="size-4" aria-hidden />
            {url ? "Cambiar foto" : "Subir foto"}
          </button>
          {url ? (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm text-muted transition-colors hover:bg-danger-wash hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
              Quitar
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted">Podrás encuadrarla. Sale en el pase y al guardar tu contacto.</p>
        {error ? (
          <InlineError live>
            {error}
          </InlineError>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <PhotoCropSheet source={picked?.source ?? null} onCancel={release} onConfirm={upload} />
    </div>
  );
}
