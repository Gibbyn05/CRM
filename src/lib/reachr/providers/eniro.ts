import type { ReachrKeywordResult, ReachrProvider, ReachrProviderResult } from "./types";

export const eniroProvider: ReachrProvider = {
  name: "eniro",
  label: "Eniro / Gule Sider",
  isConfigured() {
    return Boolean(process.env.ENIRO_PROFILE && process.env.ENIRO_KEY);
  },
  async enrichByOrgNumber(): Promise<ReachrProviderResult> {
    return {
      source: {
        provider: "eniro",
        label: "Eniro / Gule Sider",
        enabled: false,
        fields: [],
        status: this.isConfigured() ? "error" : "not_configured",
        message: this.isConfigured()
          ? "Eniro direkteadapter er klar for avtalespesifikt endpoint, men ikke aktivert."
          : "Mangler ENIRO_PROFILE og ENIRO_KEY. Alternativt kommer Gule Sider-data via Proff EniroPro når PROFF_API_TOKEN er satt.",
      },
    };
  },
  // Foreslår bransje-/kategorisøkeord fra Gule Sider. Krever ENIRO_PROFILE og
  // ENIRO_KEY samt et bekreftet endepunkt for kategoritaksonomien før dette
  // kan aktiveres — inntil da: "not_configured", aldri fabrikkerte forslag.
  async suggestKeywords(): Promise<ReachrKeywordResult> {
    return {
      keywords: [],
      source: {
        provider: "eniro",
        label: "Eniro / Gule Sider",
        enabled: false,
        fields: [],
        status: this.isConfigured() ? "error" : "not_configured",
        message: this.isConfigured()
          ? "Gule Sider-søkeordforslag er klar for avtalespesifikt endepunkt, men ikke aktivert."
          : "Mangler ENIRO_PROFILE og ENIRO_KEY. Bruker intern bransjeordbok som forslag i mellomtiden.",
      },
    };
  },
};
