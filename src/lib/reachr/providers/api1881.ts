import type { ReachrProvider, ReachrProviderResult } from "./types";

export const api1881Provider: ReachrProvider = {
  name: "api1881",
  label: "1881",
  isConfigured() {
    return Boolean(process.env.API1881_KEY);
  },
  async enrichByOrgNumber(): Promise<ReachrProviderResult> {
    return {
      source: {
        provider: "api1881",
        label: "1881",
        enabled: false,
        fields: [],
        status: this.isConfigured() ? "error" : "not_configured",
        message: this.isConfigured()
          ? "1881-adapteren er klar for avtalespesifikt endpoint, men må kobles til når API-dokumentasjon/nøkkel er avklart."
          : "Mangler API1881_KEY.",
      },
    };
  },
};
