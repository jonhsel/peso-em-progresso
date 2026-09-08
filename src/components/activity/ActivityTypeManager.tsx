"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityType } from "@/types/database";

function isDuplicateName(name: string, types: ActivityType[], excludeId?: string): boolean {
  const normalized = name.trim().toLowerCase();
  return types.some(
    (t) => t.id !== excludeId && t.name.trim().toLowerCase() === normalized
  );
}

export default function ActivityTypeManager({
  userId,
  types,
}: {
  userId: string;
  types: ActivityType[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrackDistance, setNewTrackDistance] = useState(false);

  const [editName, setEditName] = useState("");
  const [editTrackDistance, setEditTrackDistance] = useState(false);

  function startEdit(t: ActivityType) {
    setError(null);
    setCreating(false);
    setEditingId(t.id);
    setEditName(t.name);
    setEditTrackDistance(t.track_distance);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = newName.trim();
    if (trimmed === "") {
      setError("Informe um nome para o tipo de atividade.");
      return;
    }
    if (isDuplicateName(trimmed, types)) {
      setError("Já existe um tipo de atividade com esse nome.");
      return;
    }

    setLoadingId("new");
    const { error: supaError } = await supabase.from("activity_types").insert({
      user_id: userId,
      name: trimmed,
      track_distance: newTrackDistance,
    });
    setLoadingId(null);

    if (supaError) {
      setError("Não foi possível criar o tipo de atividade.");
      return;
    }

    setNewName("");
    setNewTrackDistance(false);
    setCreating(false);
    router.refresh();
  }

  async function handleUpdate(t: ActivityType) {
    setError(null);

    const trimmed = editName.trim();
    if (trimmed === "") {
      setError("Informe um nome para o tipo de atividade.");
      return;
    }
    if (isDuplicateName(trimmed, types, t.id)) {
      setError("Já existe um tipo de atividade com esse nome.");
      return;
    }

    setLoadingId(t.id);
    const { error: supaError } = await supabase
      .from("activity_types")
      .update({ name: trimmed, track_distance: editTrackDistance })
      .eq("id", t.id);
    setLoadingId(null);

    if (supaError) {
      setError("Não foi possível salvar as alterações.");
      return;
    }

    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(t: ActivityType) {
    const confirmed = window.confirm(
      `Excluir "${t.name}"? Todas as sessões desse tipo serão apagadas.`
    );
    if (!confirmed) return;

    setError(null);
    setLoadingId(t.id);
    const { error: supaError } = await supabase.from("activity_types").delete().eq("id", t.id);
    setLoadingId(null);

    if (supaError) {
      setError("Não foi possível excluir o tipo de atividade.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Tipos de atividade</p>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditingId(null);
              setCreating(true);
            }}
            className="text-xs text-accent transition hover:text-accent-hover"
          >
            + Novo tipo
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {types.map((t) => (
          <li key={t.id} className="rounded-lg border border-base-border p-3">
            {editingId === t.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={editTrackDistance}
                    onChange={(e) => setEditTrackDistance(e.target.checked)}
                  />
                  Registrar distância
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdate(t)}
                    disabled={loadingId === t.id}
                    className="rounded-lg bg-accent text-base-bg font-medium px-3 py-1.5 text-xs disabled:opacity-60 transition hover:bg-accent-hover"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-base-border px-3 py-1.5 text-xs text-ink-muted transition hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink">{t.name}</p>
                  {t.track_distance && (
                    <p className="text-xs text-ink-faint">Registra distância</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    aria-label={`Editar ${t.name}`}
                    className="text-ink-faint transition hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    disabled={loadingId === t.id}
                    aria-label={`Excluir ${t.name}`}
                    className="text-ink-faint transition hover:text-signal-behind disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {creating && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-lg border border-base-border p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ex: Yoga"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={newTrackDistance}
              onChange={(e) => setNewTrackDistance(e.target.checked)}
            />
            Registrar distância
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loadingId === "new"}
              className="rounded-lg bg-accent text-base-bg font-medium px-3 py-1.5 text-xs disabled:opacity-60 transition hover:bg-accent-hover"
            >
              {loadingId === "new" ? "Criando..." : "Criar"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-base-border px-3 py-1.5 text-xs text-ink-muted transition hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-signal-behind">{error}</p>}
    </div>
  );
}
