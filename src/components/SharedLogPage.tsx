import type { AuthorMap } from "@/lib/chat-types";
import Icon from "./Icon";
import TeamChat from "./TeamChat";

export default function SharedLogPage({
  authors,
  audience,
}: {
  authors: AuthorMap;
  audience: "team" | "manager";
}) {
  const isManagerLog = audience === "manager";

  return (
    <div className="flex h-full min-h-[38rem] flex-col">
      <header className="mb-5 grid gap-5 rounded-[1.75rem] border border-[#d8c9b0] bg-[#171717] px-6 py-7 text-[#fffaf0] shadow-[0_22px_65px_rgba(62,45,27,0.14)] sm:grid-cols-[1fr_auto] sm:items-end sm:px-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#09fe94]">
            <Icon name={isManagerLog ? "lock" : "chat"} size={15} />
            {isManagerLog ? "Kun for ledergruppen" : "Felles arbeidsrom"}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">
            {isManagerLog ? "Lederlogg" : "Teamlogg"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d8d0c4] sm:text-base">
            {isManagerLog
              ? "Et lukket rom for ledernotater, beslutninger og intern oppfølging. Bare ledere kan lese og skrive her."
              : "Del beskjeder, observasjoner og korte notater med hele teamet. Nye innlegg vises direkte hos kollegaene dine."}
          </p>
        </div>
        <div className="w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#d9bd8f]">
          {isManagerLog ? "Lederadgang" : "Hele teamet"}
        </div>
      </header>

      <TeamChat
        authors={authors}
        channel={audience}
        heightClass="min-h-0 flex-1"
        placeholder={
          isManagerLog
            ? "Skriv et ledernotat …"
            : "Skriv en beskjed eller et notat til teamet …"
        }
        emptyText={
          isManagerLog
            ? "Ingen ledernotater er skrevet ennå."
            : "Teamloggen er tom. Skriv det første innlegget."
        }
      />
    </div>
  );
}
