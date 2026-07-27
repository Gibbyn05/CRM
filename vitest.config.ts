import { defineConfig } from "vitest/config";
import path from "path";

// Testkonfig for rene funksjoner i src/lib/ (maler, tokens, org.nr-oppslag).
// Kjører ikke React-komponenter/Next-ruter – de er dekket av
// lint/build/typecheck + manuell test av UI-flyten (se README/PR-beskrivelse).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
