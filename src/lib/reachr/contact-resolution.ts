import type {
  ReachrCompany,
  ReachrContactCandidate,
  ReachrContactPriority,
  ReachrRole,
  ReachrSelectedContact,
} from "@/lib/reachr";

const PRIORITY_ORDER: Record<ReachrContactPriority, number> = {
  daily_manager: 0,
  chairperson: 1,
  company_main: 2,
};

const MIN_PERSON_CONFIDENCE = 80;

/**
 * Verifies every contact candidate and selects exactly one phone number.
 * Person candidates require an exact name + role match against Brreg roles,
 * plus an independent link to the company. A name match alone is rejected.
 */
export function resolveReachrContact(company: ReachrCompany): ReachrCompany {
  const evaluated = (company.contact_candidates ?? [])
    .map((candidate) => evaluateCandidate(candidate, company))
    .sort(compareCandidates);
  const winner = evaluated.find((candidate) => candidate.verified) ?? null;

  return {
    ...company,
    phone: winner?.phone ?? null,
    contact_candidates: evaluated,
    selected_contact: winner ? withSelectionReason(winner) : null,
  };
}

function evaluateCandidate(
  candidate: ReachrContactCandidate,
  company: ReachrCompany,
): ReachrContactCandidate {
  const phone = normalizeNorwegianPhone(candidate.phone);
  if (!phone) {
    return rejected(candidate, "Telefonnummeret har ikke gyldig norsk format.");
  }

  if (candidate.subject === "company") {
    const matchedFields = ["telefon"];
    let confidence = 55;
    if (sameOrgNumber(candidate.org_number, company.org_number)) {
      matchedFields.push("organisasjonsnummer");
      confidence += 30;
    } else if (sameText(candidate.company_name, company.name)) {
      matchedFields.push("bedrift");
      confidence += 20;
    }
    if (candidate.source_context === "official_register") {
      matchedFields.push("offentlig register");
      confidence += 10;
    }
    return {
      ...candidate,
      phone,
      priority: "company_main",
      verified: confidence >= 70,
      confidence: Math.min(confidence, 100),
      matched_fields: matchedFields,
      rejection_reason:
        confidence >= 70 ? undefined : "Hovednummeret kunne ikke knyttes sikkert til bedriften.",
    };
  }

  const officialRole = findOfficialRole(candidate, company.roles ?? []);
  if (!officialRole) {
    return rejected(
      { ...candidate, phone },
      "Navn og rolle matcher ikke samme person i Brønnøysundregistrene.",
    );
  }

  const matchedFields = ["navn", "rolle"];
  let confidence = 65;
  const companyMatched =
    sameOrgNumber(candidate.org_number, company.org_number) ||
    sameText(candidate.company_name, company.name);

  if (companyMatched) {
    matchedFields.push(
      sameOrgNumber(candidate.org_number, company.org_number)
        ? "organisasjonsnummer"
        : "bedrift",
    );
    confidence += 25;
  }

  if (
    candidate.postal_code &&
    officialRole.postal_code &&
    candidate.postal_code === officialRole.postal_code
  ) {
    matchedFields.push("postnummer");
    confidence += 10;
  }

  const verified = companyMatched && confidence >= MIN_PERSON_CONFIDENCE;
  return {
    ...candidate,
    phone,
    priority: rolePriority(officialRole),
    role_code: officialRole.role_code,
    role_name: officialRole.role_name,
    person_name: officialRole.name,
    verified,
    confidence: Math.min(confidence, 100),
    matched_fields: matchedFields,
    rejection_reason: verified
      ? undefined
      : "Personen mangler en uavhengig, verifisert kobling til bedriften.",
  };
}

function findOfficialRole(
  candidate: ReachrContactCandidate,
  roles: ReachrRole[],
): ReachrRole | null {
  const candidateRole = canonicalRole(candidate.role_code, candidate.role_name);
  if (!candidate.person_name || !candidateRole) return null;
  const candidateName = canonicalName(candidate.person_name);
  return (
    roles.find(
      (role) =>
        canonicalName(role.name) === candidateName &&
        canonicalRole(role.role_code, role.role_name) === candidateRole,
    ) ?? null
  );
}

function rolePriority(role: ReachrRole): ReachrContactPriority {
  return canonicalRole(role.role_code, role.role_name) === "DAGL"
    ? "daily_manager"
    : "chairperson";
}

function canonicalRole(code: string | null, name: string | null): "DAGL" | "LEDE" | null {
  const normalizedCode = (code ?? "").toUpperCase().replace(/[^A-ZÆØÅ]/g, "");
  const normalizedName = canonicalName(`${code ?? ""} ${name ?? ""}`);
  if (normalizedCode === "DAGL" || normalizedName.includes("daglig leder")) return "DAGL";
  if (
    normalizedCode === "LEDE" ||
    normalizedName.includes("styreleder") ||
    normalizedName === "leder"
  ) {
    return "LEDE";
  }
  return null;
}

function compareCandidates(a: ReachrContactCandidate, b: ReachrContactCandidate): number {
  return (
    Number(b.verified) - Number(a.verified) ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    b.confidence - a.confidence ||
    a.provider_label.localeCompare(b.provider_label, "nb")
  );
}

function withSelectionReason(candidate: ReachrContactCandidate): ReachrSelectedContact {
  const target =
    candidate.priority === "daily_manager"
      ? "daglig leder"
      : candidate.priority === "chairperson"
        ? "styreleder"
        : "bedriftens hovednummer";
  return {
    ...candidate,
    selection_reason: `Valgt som ${target}. Verifisert mot ${candidate.matched_fields.join(", ")}.`,
  };
}

function rejected(
  candidate: ReachrContactCandidate,
  rejectionReason: string,
): ReachrContactCandidate {
  return {
    ...candidate,
    verified: false,
    confidence: 0,
    matched_fields: [],
    rejection_reason: rejectionReason,
  };
}

function normalizeNorwegianPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("0047")
    ? digits.slice(4)
    : digits.startsWith("47") && digits.length === 10
      ? digits.slice(2)
      : digits;
  return /^\d{8}$/.test(national) ? `+47${national}` : null;
}

function sameOrgNumber(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.replace(/\D/g, "") === b.replace(/\D/g, "");
}

function sameText(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return canonicalName(a) === canonicalName(b);
}

function canonicalName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("nb-NO")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
