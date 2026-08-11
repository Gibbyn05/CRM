import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { AuthorInfo } from "@/lib/chat-types";
import SharedLogPage from "@/components/SharedLogPage";

export const dynamic = "force-dynamic";

export default async function ManagerLogPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle<Pick<Profile, "role">>();

  if (me?.role !== "manager") redirect("/dashboard");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("is_active", true);

  const authors: Record<string, AuthorInfo> = Object.fromEntries(
    (
      (profiles as Pick<
        Profile,
        "id" | "full_name" | "email" | "avatar_url"
      >[]) ?? []
    ).map((profile) => [
      profile.id,
      {
        name: profile.full_name || profile.email || "Ukjent",
        avatar_url: profile.avatar_url,
      },
    ]),
  );

  return <SharedLogPage authors={authors} audience="manager" />;
}
