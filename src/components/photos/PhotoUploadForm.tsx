"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resizeImageToJpeg } from "@/lib/image";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default function PhotoUploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [photoDate, setPhotoDate] = useState(todayIso());
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois de um erro
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      const jpeg = await resizeImageToJpeg(file);
      const path = `${userId}/${photoDate}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("progress-photos")
        .upload(path, jpeg, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("progress_photos")
        .upsert(
          { user_id: userId, photo_date: photoDate, storage_path: path },
          { onConflict: "user_id,photo_date" }
        );
      if (dbError) throw dbError;

      router.refresh();
    } catch {
      setError("Não foi possível processar essa imagem, tente novamente com JPG ou PNG.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-card border border-base-border bg-base-surface p-6 space-y-4">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Enviar foto</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Data da foto</label>
          <input
            type="date"
            value={photoDate}
            max={todayIso()}
            onChange={(e) => setPhotoDate(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Foto</label>
          <label className="flex items-center justify-center w-full rounded-lg border border-dashed border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink-muted cursor-pointer hover:border-accent transition">
            {isUploading ? "Enviando..." : "Escolher imagem"}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      </div>
      {error && <p className="text-sm text-signal-behind">{error}</p>}
      <p className="text-xs text-ink-faint">
        Enviar uma foto no mesmo dia substitui a anterior.
      </p>
    </div>
  );
}
