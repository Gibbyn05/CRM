"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { normalizePhoneNumber } from "@/lib/format";
import Icon from "./Icon";

type PhoneLinkProps = {
  phone: string | null | undefined;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function PhoneLink({ phone, children, className = "", onClick }: PhoneLinkProps) {
  const normalized = normalizePhoneNumber(phone);
  const content = children ?? phone;

  if (!normalized) return <span className={className}>{content}</span>;

  return (
    <a href={`tel:${normalized}`} className={className} onClick={onClick} title={`Ring ${phone}`}>
      {content}
    </a>
  );
}

export default function CallButton({
  phone,
  label = "Ring",
  className = "",
  onClick,
}: {
  phone: string | null | undefined;
  label?: string;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const normalized = normalizePhoneNumber(phone);
  const baseClass = `inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${className}`;

  if (!normalized) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Telefonnummer mangler eller er ugyldig"
        className={`${baseClass} cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400`}
      >
        <Icon name="phone" size={15} />
        {label}
      </button>
    );
  }

  return (
    <a
      href={`tel:${normalized}`}
      onClick={onClick}
      title={`Ring ${phone}`}
      className={`${baseClass} border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-brand-100`}
    >
      <Icon name="phone" size={15} />
      {label}
    </a>
  );
}
