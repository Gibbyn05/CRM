import type { ReachrCompany, ReachrDataSource } from "@/lib/reachr";

export type ReachrProviderName = "brreg" | "proff" | "eniro" | "api1881";

export interface ReachrSearchInput {
  query: string;
  location: string;
  industry: string;
  nace: string;
  page: number;
  size: number;
}

export interface ReachrProviderResult {
  company?: Partial<ReachrCompany>;
  companies?: ReachrCompany[];
  source: ReachrDataSource;
}

export interface ReachrProvider {
  name: ReachrProviderName;
  label: string;
  isConfigured(): boolean;
  enrichByOrgNumber(orgNumber: string): Promise<ReachrProviderResult>;
  search?(input: ReachrSearchInput): Promise<ReachrProviderResult>;
}
