import DeletePhotoButton from "./DeletePhotoButton";

type PhotoWithUrl = {
  photo_date: string;
  storage_path: string;
  url: string;
};

export default function PhotoHistoryGrid({
  userId,
  photos,
}: {
  userId: string;
  photos: PhotoWithUrl[];
}) {
  if (photos.length === 0) {
    return (
      <div className="rounded-card border border-base-border bg-base-surface p-6 text-center text-sm text-ink-faint">
        Nenhuma foto ainda. Envie a primeira acima.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {photos.map((p) => (
        <div key={p.photo_date} className="space-y-1">
          <img
            src={p.url}
            alt={`Foto de progresso de ${p.photo_date}`}
            className="rounded-card border border-base-border aspect-[3/4] object-cover w-full"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">{p.photo_date}</span>
            <DeletePhotoButton
              userId={userId}
              photoDate={p.photo_date}
              storagePath={p.storage_path}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
