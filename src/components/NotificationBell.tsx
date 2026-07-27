"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification, Reminder } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import Icon, { type IconName } from "./Icon";

// Varsel-bjella. Viser ekte varsler (notifications) + forfalte påminnelser,
// oppdatert i sanntid via Realtime. Rød teller = uleste varsler + forfalte
// påminnelser.
export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [dueReminders, setDueReminders] = useState<Reminder[]>([]);

  const loadDue = useCallback(async () => {
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .eq("agent_id", userId)
      .eq("done", false)
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(20);
    setDueReminders((data as Reminder[]) ?? []);
  }, [supabase, userId]);

  useEffect(() => {
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setNotes((data as Notification[]) ?? []));
    loadDue();

    const channel = supabase
      .channel("bell")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const n = payload.new as Notification;
            setNotes((prev) =>
              prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 20),
            );
          } else if (payload.eventType === "UPDATE") {
            const n = payload.new as Notification;
            setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
          filter: `agent_id=eq.${userId}`,
        },
        () => loadDue(),
      )
      .subscribe();

    // Sjekk forfalte påminnelser jevnlig (uten server-scheduler).
    const t = setInterval(loadDue, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [supabase, userId, loadDue]);

  const unread = notes.filter((n) => !n.read).length;
  const badge = unread + dueReminders.length;

  async function markAllRead() {
    const ids = notes.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    setNotes((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  }

  async function openNote(n: Notification) {
    if (!n.read) {
      setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  const iconFor: Record<string, IconName> = {
    message: "chat",
    reminder: "clock",
    contract: "dagsavis",
    appointment: "calendar",
    deal: "pipeline",
    system: "bell",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Varsler"
        className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
      >
        <Icon name="bell" size={18} />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-3xs font-bold text-white ring-2 ring-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-popover-in absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-semibold text-slate-800">Varsler</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Merk alle som lest
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto thin-scroll">
              {/* Forfalte påminnelser øverst */}
              {dueReminders.map((r) => (
                <button
                  key={`r-${r.id}`}
                  onClick={() => {
                    setOpen(false);
                    router.push("/reminders");
                  }}
                  className="flex w-full items-start gap-3 border-b border-slate-50 bg-amber-50/50 px-4 py-3 text-left hover:bg-amber-50"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <Icon name="clock" size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      Påminnelse: {r.title}
                    </p>
                    <p className="text-xs text-amber-600">Forfalt · {timeAgo(r.due_at)}</p>
                  </div>
                </button>
              ))}

              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNote(n)}
                  className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                    n.read ? "" : "bg-brand-50/40"
                  }`}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon name={iconFor[n.type] ?? "bell"} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="truncate text-xs text-slate-500">{n.body}</p>
                    )}
                    <p className="text-2xs text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                </button>
              ))}

              {dueReminders.length === 0 && notes.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-slate-400">
                  Ingen varsler ennå.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
