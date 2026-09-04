import Link from "next/link";
import type { CoachLink } from "@/types/database";

/**
 * Lista os perfis que o usuário acompanha como coach — sem interação além
 * de navegação, por isso Server Component (mesmo padrão de
 * PhotoHistoryGrid, que só vira client no botão isolado que precisa dele).
 */
export default function CoachClientsList({ clients }: { clients: CoachLink[] }) {
  return (
    <div className="bg-base-surface border border-base-border rounded-card p-5">
      <p className="font-display font-bold text-lg mb-3">Perfis que você acompanha</p>
      {clients.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Você ainda não acompanha nenhum perfil. Peça a quem você treina/acompanha que compartilhe
          o link de convite.
        </p>
      ) : (
        <ul className="space-y-2">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/dashboard/coach/${client.owner_user_id}`}
                className="flex items-center justify-between rounded-lg border border-base-border px-3 py-2 hover:border-ink-faint transition"
              >
                <span className="text-sm text-ink">{client.owner_display_name}</span>
                <span className="text-xs text-ink-faint">Ver progresso →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
