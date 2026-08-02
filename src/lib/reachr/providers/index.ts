import { mergeReachrCompany, type ReachrCompany, type ReachrDataSource } from "@/lib/reachr";
import { api1881Provider } from "./api1881";
import { brregProvider } from "./brreg";
import { eniroProvider } from "./eniro";
import { proffProvider } from "./proff";
import type { ReachrProvider, ReachrSearchInput } from "./types";

export const reachrProviders: ReachrProvider[] = [
  brregProvider,
  proffProvider,
  eniroProvider,
  api1881Provider,
];

export async function enrichCompanyFromProviders(orgNumber: string): Promise<ReachrCompany | null> {
  let company: ReachrCompany | null = null;
  const sources: ReachrDataSource[] = [];

  for (const provider of reachrProviders) {
    const result = await provider.enrichByOrgNumber(orgNumber);
    sources.push(result.source);
    if (isUsableCompany(result.company)) {
      company = company
        ? mergeReachrCompany(company, result.company)
        : result.company;
    }
  }

  return company ? { ...company, data_sources: sources } : null;
}

export async function searchAdditionalProviders(input: ReachrSearchInput): Promise<{
  companies: ReachrCompany[];
  sources: ReachrDataSource[];
}> {
  const companies: ReachrCompany[] = [];
  const sources: ReachrDataSource[] = [];
  for (const provider of reachrProviders) {
    if (!provider.search || provider.name === "brreg") continue;
    const result = await provider.search(input);
    sources.push(result.source);
    companies.push(...(result.companies ?? []));
  }
  return { companies, sources };
}

function isUsableCompany(company: Partial<ReachrCompany> | undefined): company is ReachrCompany {
  return Boolean(company?.org_number && company.name && company.address);
}
