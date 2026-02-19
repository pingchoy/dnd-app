import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontSize: {
        sm: ["16px", "24px"],
      },
      fontFamily: {
        cinzel: ["var(--font-cinzel)", "Georgia", "serif"],
        crimson: ["var(--font-crimson)", "Georgia", "serif"],
      },
      colors: {
        dungeon: {
          DEFAULT: "#0d0a08",
          light: "#1a1410",
          mid: "#241c16",
        },
        parchment: {
          DEFAULT: "#f4e0ae",
          light: "#fdf3dc",
          dark: "#e2c97e",
          dm: "#f0d89a",
        },
        gold: {
          DEFAULT: "#c9a84c",
          light: "#e5c97e",
          dark: "#8b6914",
          bright: "#f0d060",
        },
        ink: {
          DEFAULT: "#2c1810",
          light: "#4a2e1e",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "stone-texture":
          "radial-gradient(ellipse at 20% 50%, rgba(70,40,20,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(50,20,10,0.08) 0%, transparent 60%)",
      },
      boxShadow: {
        parchment: "0 2px 12px rgba(0,0,0,0.4)",
        "gold-glow": "0 0 12px rgba(201,168,76,0.3)",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        flicker: "flicker 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.4s ease-out",
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};
export default config;
