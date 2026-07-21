import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Statusfarger for live-dashboardet
        status: {
          incall: "#ef4444", // i samtale (rød)
          idle: "#22c55e", // ledig (grønn)
          notincall: "#f59e0b", // ikke i samtale (gul/amber)
          offline: "#6b7280", // frakoblet (grå)
        },
      },
    },
  },
  plugins: [],
};

export default config;
