import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

// Salg-landing: start et nytt salg, og (kommer i neste steg) se tidligere tilbud.
export default async function SalgPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salg</h1>
          <p className="text-sm text-slate-500">
            Lag et nytt tilbud med produkter fra katalogen.
          </p>
        </div>
        <Link
          href="/salg/ny"
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Icon name="plus" size={16} />
          Nytt salg
        </Link>
      </div>

      <div className="card p-10 text-center text-sm text-slate-400">
        Oversikt over tidligere sendte tilbud kommer her.
      </div>
    </div>
  );
}
