import DagsavisView from "@/components/DagsavisView";

export const dynamic = "force-dynamic";

// AI-generert dagsavis: automatisk oppsummering av forrige dags prestasjon.
export default function DagsavisPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dagsavis</h1>
        <p className="text-sm text-slate-500">
          AI-generert oppsummering av gårsdagens prestasjon
        </p>
      </div>
      <DagsavisView />
    </div>
  );
}
