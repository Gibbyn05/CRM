import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import ChatWidget from "@/components/ChatWidget";
import StatusBar from "@/components/StatusBar";
import type { AuthorInfo } from "@/lib/chat-types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: profiles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase.from("profiles").select("id, full_name, email, avatar_url"),
  ]);

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
    <div className="flex min-h-screen">
      <Sidebar profile={profile} />
      {/* pb-20 gir plass til den faste statuslinja nederst */}
      <main className="flex-1 overflow-x-hidden bg-slate-100 p-4 pb-24 md:p-6 md:pb-24">
        {children}
      </main>

      {/* Flytende chat-boble + fast statuslinje nederst */}
      <ChatWidget authors={authors} />
      <StatusBar />
    </div>
  );
}
