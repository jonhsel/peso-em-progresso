"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(traduzErro(error.message));
        setLoading(false);
        return;
      }
      router.refresh();
      router.push("/dashboard");
      return;
    }

    // signup: qualquer pessoa pode criar sua própria conta para acompanhar
    // o próprio peso (uso pensado para amigos/família, cada um com seus dados)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split("@")[0] } },
    });
    if (error) {
      setError(traduzErro(error.message));
      setLoading(false);
      return;
    }
    setNotice("Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.");
    setMode("signin");
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.2em] text-ink-faint uppercase mb-2">Acompanhamento de peso</p>
          <h1 className="font-display font-bold text-3xl">Peso em Progresso</h1>
        </div>

        <div className="bg-base-surface border border-base-border rounded-card p-6">
          <div className="flex mb-6 rounded-lg bg-base-surface2 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 transition ${
                mode === "signin" ? "bg-base-border text-ink" : "text-ink-muted"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 transition ${
                mode === "signup" ? "bg-base-border text-ink" : "text-ink-muted"
              }`}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs text-ink-muted mb-1.5">Como podemos te chamar?</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-signal-onpace"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-signal-onpace"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-signal-onpace"
              />
            </div>

            {error && <p className="text-sm text-signal-behind">{error}</p>}
            {notice && <p className="text-sm text-signal-ahead">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-signal-onpace text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:brightness-110"
            >
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-faint mt-6">
          Cada pessoa tem sua própria conta e seus próprios dados, isolados por usuário.
        </p>
      </div>
    </main>
  );
}

function traduzErro(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha inválidos.";
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Password should be")) return "A senha deve ter pelo menos 6 caracteres.";
  return msg;
}
