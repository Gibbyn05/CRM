import Leaderboard from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ledertavle</h1>
        <p className="text-sm text-slate-500">
          Rangering av selgere basert på aktivitet og salg
        </p>
      </div>
      <Leaderboard />
    </div>
  );
}
