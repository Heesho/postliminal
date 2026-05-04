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
        night: "#07070a",
        ink: "#11121a",
        fog: "rgba(255,255,255,0.52)",
        gold: "#f5b950",
        violet: "#6aa6ff",
        cyan: "#8de0c2",
      },
      boxShadow: {
        liminal: "0 24px 80px rgba(0, 0, 0, 0.48)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        serif: ["Instrument Serif", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
