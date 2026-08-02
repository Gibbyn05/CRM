import {
  BrregEntity,
  normalizeBrregEntity,
  normalizeFinancials,
  normalizeRoles,
} from "@/lib/reachr";
import type { ReachrProvider, ReachrProviderResult, ReachrSearchInput } from "./types";

export const brregProvider: ReachrProvider = {
  name: "brreg",
  label: "Brønnøysundregistrene",
  isConfigured() {
    return true;
  },
  async enrichByOrgNumber(orgNumber: string): Promise<ReachrProviderResult> {
    const [entityRes, rolesRes, financialsRes] = await Promise.all([
      fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      }),
      fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}/roller`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      }),
      fetch(`https://data.brreg.no/regnskapsregisteret/regnskap/${orgNumber}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 },
      }),
    ]);

    if (!entityRes.ok) {
      return {
        source: source("error", ["register"], "Brreg svarte ikke akkurat nå."),
      };
    }

    const company = normalizeBrregEntity((await entityRes.json()) as BrregEntity);
    const roles = rolesRes.ok ? normalizeRoles(await rolesRes.json()) : [];
    const financials = financialsRes.ok ? normalizeFinancials(await financialsRes.json()) : null;
    const fields = [
      "register",
      roles.length > 0 ? "roller" : null,
      financials ? "regnskap" : null,
      company.industry_code ? "bransjekode" : null,
      company.employees != null ? "ansatte" : null,
      company.address.city ? "adresse" : null,
      company.phone ? "telefon" : null,
      company.email ? "e-post" : null,
      company.website ? "nettside" : null,
    ].filter((field): field is string => Boolean(field));

    return {
      company: {
        ...company,
        roles,
        financials,
      },
      source: source(
        "active",
        fields,
        financials ? undefined : "Regnskap finnes ikke i Brreg ennå. Det skjer ofte for nye selskaper eller selskaper uten innlevert regnskap.",
      ),
    };
  },
  async search(_input: ReachrSearchInput): Promise<ReachrProviderResult> {
    return {
      companies: [],
      source: source("active", ["registersøk"]),
    };
  },
};

function source(
  status: "active" | "not_configured" | "error",
  fields: string[],
  message?: string,
) {
  return {
    provider: "brreg",
    label: "Brønnøysundregistrene",
    enabled: true,
    fields,
    status,
    message,
  };
}
