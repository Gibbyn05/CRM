import Leaderboard from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-eyebrow mb-2">Resultater</p>
        <h1 className="font-display text-4xl font-bold text-[#2b2118] sm:text-5xl">Ledertavle</h1>
        <p className="mt-2 text-sm text-[#6b6660]">
          Rangering av selgere basert på aktivitet og salg
        </p>
      </div>
      <Leaderboard />
    </div>
  );
}
