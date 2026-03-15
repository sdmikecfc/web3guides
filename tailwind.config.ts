import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        background: "#0a0a0f",
        surface: "#12121a",
        "surface-2": "#1a1a26",
        border: "#1e1e2e",
        "border-bright": "#2a2a3e",
        text: "#e2e2f0",
        muted: "#6b6b8a",
        accent: {
          DEFAULT: "#7c6aff",
          dim: "#3d3580",
          glow: "rgba(124, 106, 255, 0.15)",
        },
        green: {
          DEFAULT: "#00e5a0",
          dim: "#004d36",
          glow: "rgba(0, 229, 160, 0.12)",
        },
        orange: {
          DEFAULT: "#ff7c35",
          dim: "#4d2510",
          glow: "rgba(255, 124, 53, 0.12)",
        },
        blue: {
          DEFAULT: "#3b9eff",
          dim: "#0d2d4d",
          glow: "rgba(59, 158, 255, 0.12)",
        },
        yellow: {
          DEFAULT: "#ffe135",
          dim: "#4d4209",
          glow: "rgba(255, 225, 53, 0.12)",
        },
        pink: {
          DEFAULT: "#ff5fa3",
          dim: "#4d1b31",
          glow: "rgba(255, 95, 163, 0.12)",
        },
        red: {
          DEFAULT: "#ff4545",
          dim: "#4d0f0f",
          glow: "rgba(255, 69, 69, 0.12)",
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(124,106,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,255,0.03) 1px, transparent 1px)",
        "noise-overlay": "url('/noise.svg')",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        glow: "0 0 40px rgba(124, 106, 255, 0.15)",
        "glow-sm": "0 0 20px rgba(124, 106, 255, 0.1)",
        card: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease forwards",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
