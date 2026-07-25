import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f4f5f6",
        card: "#ffffff",
        ink: {
          DEFAULT: "#1a1c1e",
          muted: "#8b9099",
          soft: "#b6bbc2",
        },
        line: "#eceef0",
        brand: {
          50: "#f4f9e8",
          100: "#e7f2cd",
          200: "#d4e9a5",
          300: "#c1de78",
          400: "#b0d55a",
          500: "#93c23e",
          600: "#74a02e",
          700: "#587a26",
          800: "#476124",
          900: "#3c5222",
          950: "#1e2d0e",
        },
        gold: "#f2d24b",
        tangerine: "#ec9b52",
        rose: "#e0705f",
        sky: "#5b9bd5",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.03)",
        soft: "0 4px 20px rgba(16,24,40,0.06)",
        pop: "0 8px 30px rgba(16,24,40,0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
