"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

export default function PlanGate({
  plan,
  featureName,
  children,
}: {
  plan: "free" | "pro";
  featureName: string;
  children: React.ReactNode;
}) {
  if (plan === "pro") return <>{children}</>;

  return (
    <div className="rounded-card border border-dashed border-base-border bg-base-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-ink-faint" />
      <p className="mt-3 font-display font-bold text-base">{featureName} é Pro</p>
      <p className="mt-1 text-sm text-ink-muted">
        Disponível no plano Pro — R$ 11,90/mês.
      </p>
      <Link
        href="/dashboard/upgrade"
        className="mt-4 inline-block rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition"
      >
        Fazer upgrade
      </Link>
    </div>
  );
}
