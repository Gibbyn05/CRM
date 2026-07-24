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
        // Merkevare-aksent (indigo/violett) – primærfargen i hele UI-et.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // Statusfarger for live-dashboardet
        status: {
          incall: "#ef4444", // i samtale (rød)
          idle: "#22c55e", // ledig (grønn)
          notincall: "#f59e0b", // ikke i samtale (gul/amber)
          offline: "#94a3b8", // frakoblet (grå)
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.05)",
        soft: "0 8px 30px -12px rgb(15 23 42 / 0.18)",
        pop: "0 20px 45px -15px rgb(15 23 42 / 0.30)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
