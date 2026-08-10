"use client";

import {
  DASHBOARD_WIDGET_COLORS,
  DASHBOARD_WIDGET_LABELS,
  type DashboardWidgetColor,
  type DashboardWidgetPreference,
} from "@/lib/dashboard-widgets";

export default function DashboardWidgetSettings({
  widgets,
  saving,
  saved,
  error,
  onChange,
  onClose,
}: {
  widgets: DashboardWidgetPreference[];
  saving: boolean;
  saved: boolean;
  error: string;
  onChange: (widgets: DashboardWidgetPreference[]) => void;
  onClose: () => void;
}) {
  function move(index: number, nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= widgets.length) return;
    const next = [...widgets];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }

  function patch(index: number, values: Partial<DashboardWidgetPreference>) {
    onChange(widgets.map((widget, i) => (i === index ? { ...widget, ...values } : widget)));
  }

  return (
    <section className="rounded-[1.75rem] border border-[#bda98b] bg-[#fffaf0] p-5 shadow-[0_22px_60px_rgba(61,44,24,0.12)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-eyebrow">Personlig oppsett</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-[#2b2118]">Organiser widgets</h2>
          <p className="mt-1 max-w-xl text-sm text-[#6b6660]">
            Endringer lagres automatisk for din bruker. Skjulte widgets beholder plasseringen sin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[#6b6660]" aria-live="polite">
            {saving ? "Lagrer …" : error || (saved ? "Lagret" : "")}
          </span>
          <button type="button" onClick={onClose} className="rounded-full border border-[#d8c9b0] px-4 py-2 text-sm font-bold text-[#2b2118] transition hover:bg-[#efe3ce]">
            Ferdig
          </button>
        </div>
      </div>

      <ol className="mt-5 grid gap-2 lg:grid-cols-2">
        {widgets.map((widget, index) => (
          <li key={widget.id} className={`rounded-2xl border p-3 transition ${widget.visible ? "border-[#d8c9b0] bg-white/65" : "border-dashed border-[#d8c9b0] bg-[#efe3ce]/35 opacity-70"}`}>
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#2b2118] text-xs font-black text-white tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[#2b2118]">{DASHBOARD_WIDGET_LABELS[widget.id]}</p>
                <p className="text-xs text-[#8d806e]">{widget.visible ? "Vises på dashboardet" : "Skjult"}</p>
              </div>
              <button type="button" onClick={() => patch(index, { visible: !widget.visible })} aria-pressed={widget.visible} className={`rounded-full px-3 py-1.5 text-xs font-black transition ${widget.visible ? "bg-[#eafff5] text-[#087647]" : "bg-[#2b2118] text-white"}`}>
                {widget.visible ? "Synlig" : "Vis"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#d8c9b0]/70 pt-3">
              <div className="flex items-center gap-1">
                <MoveButton label="Flytt opp" disabled={index === 0} onClick={() => move(index, index - 1)}>↑</MoveButton>
                <MoveButton label="Flytt ned" disabled={index === widgets.length - 1} onClick={() => move(index, index + 1)}>↓</MoveButton>
                {index > 0 && (
                  <button type="button" onClick={() => move(index, 0)} className="ml-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#6f4d2e] transition hover:bg-[#efe3ce]">
                    Vis først
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5" aria-label="Velg widgetfarge">
                {(Object.keys(DASHBOARD_WIDGET_COLORS) as DashboardWidgetColor[]).map((color) => {
                  const swatch = DASHBOARD_WIDGET_COLORS[color];
                  return (
                    <button
                      key={color}
                      type="button"
                      title={swatch.label}
                      aria-label={`${swatch.label}${widget.color === color ? ", valgt" : ""}`}
                      aria-pressed={widget.color === color}
                      onClick={() => patch(index, { color })}
                      className={`h-5 w-5 rounded-full border-2 transition hover:scale-110 ${widget.color === color ? "border-[#2b2118] ring-2 ring-white" : "border-white"}`}
                      style={{ backgroundColor: swatch.dot }}
                    />
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d8c9b0] bg-[#fffaf0] text-sm font-black text-[#2b2118] transition hover:bg-[#efe3ce] disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  );
}
