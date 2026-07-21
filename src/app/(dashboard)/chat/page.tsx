import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import TeamChat from "@/components/TeamChat";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name");

  const nameMap = Object.fromEntries(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team-chat</h1>
        <p className="text-sm text-slate-500">Intern chat for hele teamet</p>
      </div>
      <TeamChat nameMap={nameMap} />
    </div>
  );
}
