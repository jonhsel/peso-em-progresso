"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeletePhotoButton({
  userId,
  photoDate,
  storagePath,
}: {
  userId: string;
  photoDate: string;
  storagePath: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Excluir a foto de ${photoDate}?`)) return;
    setIsDeleting(true);
    try {
      await supabase.storage.from("progress-photos").remove([storagePath]);
      await supabase
        .from("progress_photos")
        .delete()
        .eq("user_id", userId)
        .eq("photo_date", photoDate);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-xs text-ink-faint hover:text-signal-behind transition"
    >
      {isDeleting ? "..." : "Excluir"}
    </button>
  );
}
