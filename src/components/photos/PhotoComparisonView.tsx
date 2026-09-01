"use client";

import { useState } from "react";

type PhotoWithUrl = { photo_date: string; url: string };

export default function PhotoComparisonView({ photos }: { photos: PhotoWithUrl[] }) {
  // Default: mais antiga à esquerda, mais recente à direita
  // (photos vem ordenado desc da page, então [last] = mais antiga, [0] = mais recente)
  const [leftDate, setLeftDate] = useState(photos.at(-1)?.photo_date ?? "");
  const [rightDate, setRightDate] = useState(photos[0]?.photo_date ?? "");

  if (photos.length < 2) {
    return (
      <p className="text-sm text-ink-faint">
        Envie fotos em pelo menos 2 datas diferentes para comparar lado a lado.
      </p>
    );
  }

  const left = photos.find((p) => p.photo_date === leftDate);
  const right = photos.find((p) => p.photo_date === rightDate);

  // Ordenar datas crescente para os selects (mais intuitivo: antiga→recente)
  const sortedPhotos = [...photos].sort((a, b) =>
    a.photo_date.localeCompare(b.photo_date)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Antes</label>
          <select
            value={leftDate}
            onChange={(e) => setLeftDate(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {sortedPhotos.map((p) => (
              <option key={p.photo_date} value={p.photo_date}>
                {p.photo_date}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Depois</label>
          <select
            value={rightDate}
            onChange={(e) => setRightDate(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {sortedPhotos.map((p) => (
              <option key={p.photo_date} value={p.photo_date}>
                {p.photo_date}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {left ? (
          <img
            src={left.url}
            alt={`Foto de ${left.photo_date}`}
            className="rounded-card border border-base-border w-full"
          />
        ) : (
          <div className="rounded-card border border-base-border bg-base-surface2 aspect-[3/4]" />
        )}
        {right ? (
          <img
            src={right.url}
            alt={`Foto de ${right.photo_date}`}
            className="rounded-card border border-base-border w-full"
          />
        ) : (
          <div className="rounded-card border border-base-border bg-base-surface2 aspect-[3/4]" />
        )}
      </div>
    </div>
  );
}
