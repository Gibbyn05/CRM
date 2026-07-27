import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile } from "@/lib/types";
import OrganizationForm from "@/components/OrganizationForm";

export const dynamic = "force-dynamic";

// «Min organisasjon» – selskapsinfo, logo og gjenbrukbar maltekst. Kun ledere.
export default async function OrganizationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  if (me?.role !== "manager") redirect("/dashboard");

  const { data: org } = await supabase
    .from("organization")
    .select("*")
    .eq("id", 1)
    .maybeSingle<Organization>();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Min organisasjon</h1>
        <p className="text-sm text-slate-500">
          Selskapsinformasjon og logo. Brukes automatisk i e-poster og maler.
        </p>
      </div>
      <OrganizationForm initialOrg={org ?? null} />
    </div>
  );
}
