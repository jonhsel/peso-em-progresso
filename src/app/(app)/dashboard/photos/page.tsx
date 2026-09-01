import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import PhotoUploadForm from "@/components/photos/PhotoUploadForm";
import PhotoHistoryGrid from "@/components/photos/PhotoHistoryGrid";
import PhotoComparisonView from "@/components/photos/PhotoComparisonView";
import type { ProgressPhoto } from "@/types/database";

export default async function PhotosPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", user.id)
    .order("photo_date", { ascending: false });

  const photoRows = (rows as ProgressPhoto[]) ?? [];

  let photos: { photo_date: string; storage_path: string; url: string }[] = [];
  if (photoRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(
        photoRows.map((p) => p.storage_path),
        3600
      );
    photos = photoRows.map((p, i) => ({
      photo_date: p.photo_date,
      storage_path: p.storage_path,
      url: signed?.[i]?.signedUrl ?? "",
    }));
  }

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <PhotoUploadForm userId={user.id} />
        <section>
          <h2 className="font-display font-bold text-lg mb-3">Comparar</h2>
          <PhotoComparisonView photos={photos} />
        </section>
        <section>
          <h2 className="font-display font-bold text-lg mb-3">Histórico</h2>
          <PhotoHistoryGrid userId={user.id} photos={photos} />
        </section>
      </main>
    </div>
  );
}
