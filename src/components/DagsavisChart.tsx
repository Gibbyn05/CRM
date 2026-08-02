"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DagsavisPeriod, DagsavisSeriesPoint } from "@/lib/dagsavis";

const COLORS = {
  calls: "#4b3019",
  sales: "#7a542d",
  grid: "#b8945c",
  axis: "#7a542d",
};

export default function DagsavisChart({
  period,
  points,
  onPeriodChange,
}: {
  period: DagsavisPeriod;
  points: DagsavisSeriesPoint[];
  onPeriodChange: (next: DagsavisPeriod) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {});
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const normalized = useMemo(() => {
    const maxValue = Math.max(
      1,
      ...points.flatMap((point) => [point.calls_count, point.sales_count]),
    );
    const viewWidth = 900;
    const viewHeight = 210;
    const padding = { top: 18, right: 18, bottom: 34, left: 42 };
    const innerWidth = viewWidth - padding.left - padding.right;
    const innerHeight = viewHeight - padding.top - padding.bottom;
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    function xFor(index: number) {
      return padding.left + index * stepX;
    }

    function yFor(value: number) {
      return padding.top + innerHeight - (value / maxValue) * innerHeight;
    }

    const callsPath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.calls_count)}`)
      .join(" ");
    const salesPath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.sales_count)}`)
      .join(" ");
    const gridLines = Array.from({ length: 4 }, (_, index) => {
      const y = padding.top + (innerHeight / 3) * index;
      const value = Math.round(maxValue - (maxValue / 3) * index);
      return { y, value };
    });

    return {
      viewWidth,
      viewHeight,
      padding,
      stepX,
      xFor,
      yFor,
      callsPath,
      salesPath,
      gridLines,
      maxValue,
    };
  }, [points]);

  const activePoint = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1];
  const hoverX = hoverIndex !== null ? normalized.xFor(hoverIndex) : null;
  const hoverYCalls = hoverIndex !== null ? normalized.yFor(activePoint?.calls_count ?? 0) : null;
  const hoverYSales = hoverIndex !== null ? normalized.yFor(activePoint?.sales_count ?? 0) : null;

  if (points.length === 0) {
    return (
      <section className="border-y-2 border-[#4b3019]/70 bg-[#f0d39b]/25 px-3 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#4b3019]/65">
              Linjegraf
            </p>
            <h3 className="mt-1 text-base font-bold text-[#4b3019]">
              Samtaler og salg over tid
            </h3>
          </div>
          <div className="inline-flex border border-[#4b3019]/35 p-0.5 text-xs">
            {([
              ["dag", "Dag"],
              ["uke", "Uke"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onPeriodChange(value)}
                className={`rounded-full px-3 py-1.5 transition ${
                  period === value
                    ? "bg-[#4b3019] text-[#f7e3b7]"
                    : "text-[#4b3019]/65 hover:bg-[#4b3019]/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="border border-dashed border-[#4b3019]/25 px-4 py-8 text-center text-sm text-[#4b3019]/55">
          Ingen datapunktoppsamling for den valgte perioden ennå.
        </div>
      </section>
    );
  }

  function updateHover(clientX: number) {
    if (!wrapRef.current || points.length === 0) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const start = normalized.padding.left;
    const end = normalized.viewWidth - normalized.padding.right;
    const clamped = Math.max(start, Math.min(end, (x / rect.width) * normalized.viewWidth));
    const step = points.length > 1 ? normalized.stepX : 1;
    const index = Math.max(
      0,
      Math.min(points.length - 1, Math.round((clamped - start) / step)),
    );
    setHoverIndex(index);
  }

  return (
    <section className="border-y-2 border-[#4b3019]/70 bg-[#f0d39b]/25 px-3 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[#4b3019]/65">
            Linjegraf
          </p>
          <h3 className="mt-1 text-base font-bold text-[#4b3019]">
            Samtaler og salg over tid
          </h3>
        </div>
        <div className="inline-flex border border-[#4b3019]/35 p-0.5 text-xs">
          {([
            ["dag", "Dag"],
            ["uke", "Uke"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onPeriodChange(value)}
              className={`rounded-full px-3 py-1.5 transition ${
                period === value
                  ? "bg-[#4b3019] text-[#f7e3b7]"
                  : "text-[#4b3019]/65 hover:bg-[#4b3019]/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => updateHover(event.clientX)}
        onTouchMove={(event) => updateHover(event.touches[0]?.clientX ?? 0)}
      >
        <svg
          viewBox={`0 0 ${normalized.viewWidth} ${normalized.viewHeight}`}
          className="h-[170px] w-full overflow-visible"
          role="img"
          aria-label="Samtaler og salg over tid"
        >
          <defs>
            <linearGradient id="callsGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLORS.calls} stopOpacity="0.2" />
              <stop offset="100%" stopColor={COLORS.calls} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLORS.sales} stopOpacity="0.18" />
              <stop offset="100%" stopColor={COLORS.sales} stopOpacity="0" />
            </linearGradient>
          </defs>

          {normalized.gridLines.map((line) => (
            <g key={line.y}>
              <line
                x1={normalized.padding.left}
                x2={normalized.viewWidth - normalized.padding.right}
                y1={line.y}
                y2={line.y}
                stroke={COLORS.grid}
                strokeDasharray="4 6"
                strokeWidth="1"
              />
              <text
                x={12}
                y={line.y + 4}
                fill={COLORS.axis}
                fontSize="11"
                fontFamily="Georgia, 'Times New Roman', serif"
              >
                {line.value}
              </text>
            </g>
          ))}

          <path
            d={`${normalized.callsPath} L ${normalized.viewWidth - normalized.padding.right} ${normalized.viewHeight - normalized.padding.bottom} L ${normalized.padding.left} ${normalized.viewHeight - normalized.padding.bottom} Z`}
            fill="url(#callsGradient)"
          />
          <path
            d={`${normalized.salesPath} L ${normalized.viewWidth - normalized.padding.right} ${normalized.viewHeight - normalized.padding.bottom} L ${normalized.padding.left} ${normalized.viewHeight - normalized.padding.bottom} Z`}
            fill="url(#salesGradient)"
          />

          <path
            d={normalized.callsPath}
            fill="none"
            stroke={COLORS.calls}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={normalized.salesPath}
            fill="none"
            stroke={COLORS.sales}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="8 6"
          />

          {points.map((point, index) => {
            const x = normalized.xFor(index);
            const callsY = normalized.yFor(point.calls_count);
            const salesY = normalized.yFor(point.sales_count);
            const showLabel = index === 0 || index === points.length - 1 || index % 2 === 0;
            return (
              <g key={point.key}>
                <circle cx={x} cy={callsY} r="4.2" fill={COLORS.calls} />
                <circle cx={x} cy={salesY} r="4" fill="#fff" stroke={COLORS.sales} strokeWidth="2" />
                {showLabel && (
                  <text
                    x={x}
                    y={normalized.viewHeight - 18}
                    textAnchor="middle"
                    fill={COLORS.axis}
                    fontSize="11"
                    fontFamily="Georgia, 'Times New Roman', serif"
                  >
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}

          {hoverIndex !== null && hoverX !== null && hoverYCalls !== null && hoverYSales !== null && (
            <>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={normalized.padding.top}
                y2={normalized.viewHeight - normalized.padding.bottom}
                stroke={COLORS.axis}
                strokeDasharray="3 5"
              />
              <circle cx={hoverX} cy={hoverYCalls} r="6" fill={COLORS.calls} stroke="#f0d39b" strokeWidth="2" />
              <circle cx={hoverX} cy={hoverYSales} r="6" fill={COLORS.sales} stroke="#f0d39b" strokeWidth="2" />
            </>
          )}
        </svg>

        <div className="pointer-events-none absolute inset-0">
          {hoverIndex !== null && activePoint && (
            <div
              className="absolute z-10 -translate-x-1/2 border border-[#4b3019]/25 bg-[#efd39c] px-3 py-2 text-sm shadow-lg"
              style={{
                left: `${(normalized.xFor(hoverIndex) / normalized.viewWidth) * 100}%`,
                top: `${Math.max(
                  8,
                  ((hoverYCalls ?? 90) / normalized.viewHeight) * 100 - 14,
                )}%`,
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#4b3019]/55">
                {activePoint.label}
              </p>
              <p className="mt-1 font-medium text-[#4b3019]">Samtaler: {activePoint.calls_count}</p>
              <p className="text-[#4b3019]/70">Salg: {activePoint.sales_count}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[#4b3019]/15 pt-2 text-xs">
        <LegendDot color={COLORS.calls} label="Samtaler" filled />
        <LegendDot color={COLORS.sales} label="Salg" />
      </div>
    </section>
  );
}

function LegendDot({
  color,
  label,
  filled = false,
}: {
  color: string;
  label: string;
  filled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[#4b3019]/70">
      <span
        className={`h-2.5 w-2.5 rounded-full ${filled ? "" : "border"}`}
        style={{
          backgroundColor: filled ? color : "white",
          borderColor: color,
        }}
      />
      {label}
    </span>
  );
}
