"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import Icon, { type IconName } from "./Icon";
import { activityActor, activityMessage, type ActivityFeedItem, type ActivityType } from "@/lib/activity-feed";

const ICONS: Record<ActivityType, IconName> = {
  call: "phone",
  email: "mail",
  meeting: "calendar",
  note: "chat",
  task: "check",
  status: "route",
  offer: "pipeline",
  signature: "receipt",
  payment: "wallet",
};

const dayLabel = (iso: string) => new Intl.DateTimeFormat("nb-NO", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Oslo",
}).format(new Date(iso));

const timeLabel = (iso: string) => new Intl.DateTimeFormat("nb-NO", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo",
}).format(new Date(iso));

export default function ActivityFeed({
  activities,
  loading,
  error,
  expanded = false,
  onSelect,
  onExpand,
}: {
  activities: ActivityFeedItem[];
  loading: boolean;
  error?: string;
  expanded?: boolean;
  onSelect: (activity: ActivityFeedItem) => void;
  onExpand: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-[#e4e8e5] bg-white shadow-[0_5px_22px_rgba(37,45,42,0.08)]">
      <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-[-0.02em] text-[#303633]">Sanntidsaktivitet</h2>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#75817b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#67c790]" />Live
            </span>
          </div>
          <p className="mt-1 text-xs text-[#8a938e]">{activities.length} hendelser</p>
        </div>
        <button
          type="button"
          onClick={onExpand}
          aria-label={expanded ? "Lukk utvidet aktivitetslogg" : "Utvid aktivitetslogg"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#f7f8f7] text-[#606b64] transition hover:bg-[#edf1ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b9a6a]"
        >
          {expanded ? <Icon name="close" size={16} /> : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M3 8l6-6M21 8l-6-6M3 16l6 6M21 16l-6 6" />
            </svg>
          )}
        </button>
      </div>

      <div className={`thin-scroll min-h-0 overflow-y-auto bg-[#fcfdfc] ${expanded ? "h-[min(75vh,780px)]" : "h-[440px]"}`}>
        {error && <p role="alert" className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}
        <ol className="space-y-4 px-5 pb-8 pt-2 sm:px-7">
          {activities.map((activity, index) => {
            const actor = activityActor(activity);
            const assignedProfile = Boolean(activity.agent_id) && ["email", "meeting", "task", "offer"].includes(activity.activity_type);
            const date = dayLabel(activity.occurred_at);
            const showDate = index === 0 || dayLabel(activities[index - 1].occurred_at) !== date;
            return (
              <li key={activity.activity_id} className="list-none">
                {showDate && (
                  <div className="my-4 flex justify-center">
                    <time dateTime={activity.occurred_at} className="rounded-full bg-[#343b37] px-3 py-1 text-[11px] font-medium text-white shadow-sm">{date}</time>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <Avatar name={actor} url={activity.activity_type === "signature" || activity.activity_type === "payment" ? null : activity.agent_avatar_url} size={32} />
                  <div className="min-w-0 max-w-[calc(100%-44px)]">
                    <p className="mb-1 ml-1 truncate text-xs font-semibold text-[#59645e]">
                      {actor}{assignedProfile && <span className="ml-1 font-normal text-[#9aa39d]" title="CRM lagrer tilknyttet profil, men ikke alltid hvem som utførte endringen.">· tilknyttet profil</span>}
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelect(activity)}
                      className="max-w-full rounded-2xl rounded-bl-md border border-[#e6e9e6] bg-white px-4 py-2.5 text-left text-sm leading-5 text-[#303633] shadow-[0_2px_6px_rgba(32,43,36,0.09)] transition hover:border-[#a7d5bc] hover:shadow-[0_4px_12px_rgba(32,43,36,0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b9a6a]"
                    >
                      <span className="break-words">{activityMessage(activity)}</span>
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[11px]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e8ece8] bg-white text-[#79857b] shadow-sm" title={activity.title}>
                        <Icon name={ICONS[activity.activity_type]} size={11} />
                      </span>
                      <Link href={`/customers/${activity.customer_id}`} className="max-w-full truncate font-medium text-[#4b9a77] hover:underline">
                        Kunde {activity.customer_name}
                      </Link>
                      <time dateTime={activity.occurred_at} title={`${date} kl. ${timeLabel(activity.occurred_at)}`} className="text-[#9aa39d]">
                        {timeLabel(activity.occurred_at)}
                      </time>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          {!loading && !error && activities.length === 0 && (
            <li className="list-none px-4 py-24 text-center text-sm text-[#79857b]">Ingen kundeaktivitet ennå.</li>
          )}
          {loading && activities.length === 0 && (
            <li className="list-none px-4 py-24 text-center text-sm text-[#79857b]">Laster aktivitet …</li>
          )}
        </ol>
      </div>
    </div>
  );
}
