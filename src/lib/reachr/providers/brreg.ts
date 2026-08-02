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
    return {
      company: {
        ...company,
        roles: rolesRes.ok ? normalizeRoles(await rolesRes.json()) : [],
        financials: financialsRes.ok ? normalizeFinancials(await financialsRes.json()) : null,
      },
      source: source("active", [
        "register",
        "roller",
        "regnskap",
        "bransjekode",
        "ansatte",
        "adresse",
      ]),
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
