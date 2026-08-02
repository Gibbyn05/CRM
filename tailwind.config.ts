import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Inter, self-hosted via next/font (src/app/layout.tsx) and exposed
        // as --font-sans; falls back to the system stack while it loads.
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", "Georgia", ...defaultTheme.fontFamily.serif],
      },
      fontSize: {
        // Delte mikro-roller: eyebrow/tabellhoder (2xs) og tidsstempler/badges (3xs).
        // Erstatter spredte text-[10px]/text-[11px]-verdier med navngitte steg.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        "3xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      colors: {
        // Reachr-stil: beige/brun base med signalgrønn aksent.
        brand: {
          50: "#eafff5",
          100: "#ccffe7",
          200: "#9dffd4",
          300: "#62ffc0",
          400: "#09fe94",
          500: "#00e882",
          600: "#008f52",
          700: "#087043",
          800: "#0b5637",
          900: "#0a432f",
        },
        paper: {
          50: "#fffaf0",
          100: "#faf8f2",
          200: "#f4ead8",
          300: "#efe3ce",
          400: "#d8c9b0",
          500: "#b7a991",
        },
        ink: {
          900: "#171717",
          800: "#2b2118",
          700: "#3d3a34",
          600: "#5f5548",
          500: "#6b6660",
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
        card: "0 1px 2px 0 rgb(61 44 24 / 0.04), 0 1px 3px 0 rgb(61 44 24 / 0.05)",
        soft: "0 18px 50px -24px rgb(61 44 24 / 0.26)",
        pop: "0 24px 70px -24px rgb(61 44 24 / 0.34)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
