import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { AuthorInfo } from "@/lib/chat-types";
import TeamChat from "@/components/TeamChat";

export const dynamic = "force-dynamic";

// «Diskusjon» – intern chat kun for ledere (channel = 'leadership'). Selgere
// har ikke denne fanen i sidebaren og RLS blokkerer også direkte tilgang.
export default async function DiscussionPage() {
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

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("role", "manager");

  const authors: Record<string, AuthorInfo> = Object.fromEntries(
    (
      (profiles as Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[]) ??
      []
    ).map((p) => [
      p.id,
      { name: p.full_name || p.email || "Ukjent", avatar_url: p.avatar_url },
    ]),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Diskusjon</h1>
        <p className="text-sm text-slate-500">
          Intern chat kun synlig for ledelsen – selgere ser ikke denne fanen.
        </p>
      </div>
      <TeamChat
        authors={authors}
        channel="leadership"
        heightClass="h-[75vh]"
        emptyText="Ingen meldinger ennå. Start lederdiskusjonen!"
      />
    </div>
  );
}
