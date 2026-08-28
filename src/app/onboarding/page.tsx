import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at")
    .eq("id", user.id)
    .single();

  // Já passou pelo onboarding — não deixa revisitar via URL direta.
  if (profile?.onboarded_at) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen">
      <OnboardingFlow
        userId={user.id}
        displayName={profile?.display_name ?? "Usuário"}
      />
    </main>
  );
}
