"use client";

import {
  SIDEBAR_GROUP_LABELS,
  type SidebarGroupPreference,
} from "@/lib/sidebar-navigation";

export default function SidebarMenuSettings({
  groups,
  labels,
  saving,
  saved,
  error,
  onChange,
  onClose,
}: {
  groups: SidebarGroupPreference[];
  labels: Record<string, string>;
  saving: boolean;
  saved: boolean;
  error: string;
  onChange: (groups: SidebarGroupPreference[]) => void;
  onClose: () => void;
}) {
  function moveGroup(index: number, nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    const next = [...groups];
    const [group] = next.splice(index, 1);
    next.splice(nextIndex, 0, group);
    onChange(next);
  }

  function patchGroup(index: number, values: Partial<SidebarGroupPreference>) {
    onChange(groups.map((group, i) => (i === index ? { ...group, ...values } : group)));
  }

  function moveItem(groupIndex: number, itemIndex: number, nextIndex: number) {
    const items = [...groups[groupIndex].items];
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const [item] = items.splice(itemIndex, 1);
    items.splice(nextIndex, 0, item);
    patchGroup(groupIndex, { items });
  }

  function toggleItem(groupIndex: number, itemIndex: number) {
    const items = groups[groupIndex].items.map((item, index) =>
      index === itemIndex ? { ...item, visible: !item.visible } : item,
    );
    patchGroup(groupIndex, { items });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-start bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tilpass sidemeny">
      <section className="thin-scroll h-full w-full max-w-xl overflow-y-auto border-r border-white/15 bg-[#171717] p-5 text-[#fffaf0] shadow-[28px_0_80px_rgba(0,0,0,0.35)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d9bd8f]/70">Personlig navigasjon</p>
            <h2 className="font-display mt-2 text-4xl font-bold">Organiser menyen</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#fffaf0]/55">
              Flytt kategorier og sider, eller skjul det du ikke bruker. Profil og utlogging er alltid tilgjengelig nederst.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold transition hover:bg-white/10">Ferdig</button>
        </div>

        <div className="mt-4 min-h-5 text-xs font-bold text-[#09fe94]" aria-live="polite">
          {saving ? "Lagrer …" : error || (saved ? "Lagret" : "")}
        </div>

        <ol className="mt-2 space-y-3">
          {groups.map((group, groupIndex) => (
            <li key={group.id} className={`rounded-2xl border p-3 ${group.visible ? "border-white/15 bg-white/[0.055]" : "border-dashed border-white/15 bg-black/20 opacity-65"}`}>
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#09fe94] text-xs font-black text-[#171717]">{groupIndex + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">{SIDEBAR_GROUP_LABELS[group.id]}</p>
                  <p className="text-xs text-[#d9bd8f]/55">{group.items.filter((item) => item.visible).length} synlige sider</p>
                </div>
                <button type="button" onClick={() => patchGroup(groupIndex, { visible: !group.visible })} className={`rounded-full px-3 py-1.5 text-xs font-black ${group.visible ? "bg-[#09fe94]/15 text-[#09fe94]" : "bg-white/10 text-white"}`}>
                  {group.visible ? "Synlig" : "Vis"}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-1 border-t border-white/10 pt-3">
                <MoveButton label="Flytt kategori opp" disabled={groupIndex === 0} onClick={() => moveGroup(groupIndex, groupIndex - 1)}>↑</MoveButton>
                <MoveButton label="Flytt kategori ned" disabled={groupIndex === groups.length - 1} onClick={() => moveGroup(groupIndex, groupIndex + 1)}>↓</MoveButton>
                {groupIndex > 0 && <button type="button" onClick={() => moveGroup(groupIndex, 0)} className="ml-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#d9bd8f] hover:bg-white/10">Vis først</button>}
              </div>

              <ol className="mt-3 space-y-1.5">
                {group.items.map((item, itemIndex) => (
                  <li key={item.href} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${item.visible ? "bg-black/20" : "bg-black/10 opacity-55"}`}>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{labels[item.href] ?? item.href}</span>
                    <button type="button" onClick={() => toggleItem(groupIndex, itemIndex)} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.visible ? "bg-white/10 text-[#fffaf0]" : "bg-[#09fe94] text-[#171717]"}`}>
                      {item.visible ? "Skjul" : "Vis"}
                    </button>
                    <MoveButton label="Flytt side opp" disabled={itemIndex === 0} onClick={() => moveItem(groupIndex, itemIndex, itemIndex - 1)}>↑</MoveButton>
                    <MoveButton label="Flytt side ned" disabled={itemIndex === group.items.length - 1} onClick={() => moveItem(groupIndex, itemIndex, itemIndex + 1)}>↓</MoveButton>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
      <button type="button" aria-label="Lukk menytilpasning" onClick={onClose} className="hidden flex-1 sm:block" />
    </div>
  );
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/15 text-xs font-black transition hover:bg-white/10 disabled:opacity-20">{children}</button>;
}
