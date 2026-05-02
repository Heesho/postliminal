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
        night: "#050507",
        ink: "#0a0b0f",
        fog: "#b8bbc7",
        gold: "#d7b765",
        violet: "#8b7cf6",
        cyan: "#6ee7f9"
      },
      boxShadow: {
        liminal: "0 24px 80px rgba(0, 0, 0, 0.45)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    },
  },
  plugins: [],
};

export default config;
