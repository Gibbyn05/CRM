import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ChatWidget from "@/components/ChatWidget";
import StatusBar from "@/components/StatusBar";
import DeactivatedScreen from "@/components/DeactivatedScreen";
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

  // Deaktiverte brukere blokkeres fra hele appen.
  if (profile && profile.is_active === false) {
    return <DeactivatedScreen />;
  }

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
    // App-skall: først fra lg låses høyden slik at sidebaren står fast og KUN
    // <main> scroller. Tablet portrait får mobilskall, ellers blir innholdet
    // for trangt når en fast sidebar tar 16rem.
    <div className="flex min-h-screen flex-col bg-[#f4ead8] lg:h-screen lg:flex-row lg:overflow-hidden">
      <Sidebar profile={profile} />

      <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:overflow-hidden">
        <Topbar profile={profile} />
        {/* Bunn-padding må klarere det høyeste faste elementet: chat-bobla
            (bottom-[5rem] + h-14 => toppkant på 8.5rem), ikke bare
            statuslinja (~4rem). Pluss iPhone safe-area. */}
        <main className="thin-scroll flex-1 overflow-x-hidden bg-[radial-gradient(circle_at_18%_0%,rgba(184,138,82,0.14),transparent_34rem),linear-gradient(120deg,#fffaf0_0%,#f4ead8_48%,#efe3ce_100%)] px-3 py-4 pb-[calc(9rem+env(safe-area-inset-bottom))] sm:px-5 lg:overflow-y-auto lg:p-8 lg:pb-[calc(9rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto h-full w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Flytende chat-boble + fast statuslinje nederst */}
      <ChatWidget authors={authors} />
      <StatusBar />
    </div>
  );
}
