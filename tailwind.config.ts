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
        mono:    ["'JetBrains Mono'", "monospace"],
        display: ["'Syne'", "sans-serif"],
        body:    ["'DM Sans'", "sans-serif"],
      },
      colors: {
        background: "#080b14",
        surface:    "#0d1120",
        "surface-2":"#131826",
        border:     "#1c2236",
        "border-2": "#252d42",
        text:       "#e4e8f5",
        muted:      "#6272a0",
        accent: {
          DEFAULT: "#7c6aff",
          dim:     "#2d2580",
          glow:    "rgba(124,106,255,0.18)",
        },
      },
      animation: {
        "fade-up": "fadeUp 0.5s cubic-bezier(.22,1,.36,1) both",
        shimmer:   "shimmer 1.8s linear infinite",
        drift:     "drift 22s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
        drift: {
          "0%":   { transform: "translate(0,0) scale(1)" },
          "33%":  { transform: "translate(3vw,-4vh) scale(1.06)" },
          "66%":  { transform: "translate(-2vw,3vh) scale(0.97)" },
          "100%": { transform: "translate(2vw,2vh) scale(1.03)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
